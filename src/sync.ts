import {createClient,type RealtimeChannel,type Session,type SupabaseClient} from '@supabase/supabase-js'
import db from './db'
import type {DailyRecord,Draft,RecordOptions,Schedule,Staff,SyncEntityType,WeatherLocation} from './types'

// 環境変数があればそちらを優先し、未設定時は既定の Supabase プロジェクトへ接続する。
const projectUrl=import.meta.env.VITE_SUPABASE_URL||'https://uaknupbbuxwjowzkoihu.supabase.co'
const publishableKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_v-TnFBvQSUHAuCDR4O6DSA_QVF_Uqhl'

// 開発時の再読み込みでもクライアントを使い回し、認証状態や Realtime 接続の重複を防ぐ。
const runtime=globalThis as typeof globalThis&{__compassSupabase?:SupabaseClient}
export const supabase=runtime.__compassSupabase??createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
runtime.__compassSupabase=supabase

// 画面に表示する同期の進行状況と、ログイン中のメールアドレスを表す型。
export type SyncPhase='starting'|'signed-out'|'syncing'|'synced'|'offline'|'error'
export interface SyncState{
  phase:SyncPhase
  email:string|null
  message:string
  lastSyncedAt:string|null
}

// Supabase の compass_data テーブルで扱う、同期対象1件の共通形式。
// payload には各テーブルのレコードを入れ、deleted で削除済みであることを伝える。
type RemoteEntity={
  entity_type:SyncEntityType
  entity_key:string
  payload:unknown|null
  updated_at:string
  deleted:boolean
}

// 同期状態の変更を画面へ通知するための購読者と、同期処理の実行状態。
const listeners=new Set<()=>void>()
let state:SyncState={phase:'starting',email:null,message:'同期を準備しています。',lastSyncedAt:null}
let session:Session|null=null
let channel:RealtimeChannel|null=null
let startPromise:Promise<void>|null=null
let syncPromise:Promise<void>|null=null
let syncRequested=false
let syncTimer:number|undefined
let localRevision=0

// 状態を部分更新して、購読している画面コンポーネントを再描画させる。
function setState(next:Partial<SyncState>){
  state={...state,...next}
  listeners.forEach(listener=>listener())
}

// React などの画面から同期状態を購読・解除するための公開関数。
export function subscribeSync(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}
export function getSyncState(){return state}

// 更新時刻を比較可能な数値へ変換し、無効な日時は最も古い時刻として扱う。
function timestamp(value:string|undefined){const parsed=Date.parse(value??'');return Number.isFinite(parsed)?parsed:0}
// テーブル種別とレコード固有キーから、同期用の一意なキーを作る。
function entityId(type:SyncEntityType,key:string){return `${type}:${key}`}

// 削除されていないローカルレコードを、Supabase に送る共通形式へ変換する。
function activeEntity(type:SyncEntityType,key:string,payload:unknown,updatedAt:string):RemoteEntity{
  return{entity_type:type,entity_key:key,payload,updated_at:updatedAt,deleted:false}
}

// IndexedDB の同期対象をすべて読み取り、削除情報も含めた同期用一覧を作る。
// 同じレコードでは、通常データより新しい削除情報を優先する。
async function collectLocalEntities(){
  const[staff,schedules,records,drafts,locations,options,tombstones]=await Promise.all([
    db.staff.toArray(),db.schedules.toArray(),db.records.toArray(),db.drafts.toArray(),
    db.weatherLocations.toArray(),db.recordOptions.toArray(),db.syncTombstones.toArray(),
  ])
  const entities:RemoteEntity[]=[]
  for(const item of staff)if(item.id!==undefined)entities.push(activeEntity('staff',String(item.id),item,item.updatedAt??item.createdAt))
  for(const item of schedules)entities.push(activeEntity('schedule',item.date,item,item.updatedAt))
  for(const item of records)entities.push(activeEntity('record',item.date,item,item.updatedAt))
  for(const item of drafts)entities.push(activeEntity('draft',item.id,item,item.updatedAt))
  for(const item of locations)if(item.id)entities.push(activeEntity('weather_location',item.id,item,item.updatedAt??'1970-01-01T00:00:00.000Z'))
  for(const item of options)entities.push(activeEntity('record_options',item.id,item,item.updatedAt??'1970-01-01T00:00:00.000Z'))
  const result=new Map<string,RemoteEntity>()
  for(const item of entities)result.set(entityId(item.entity_type,item.entity_key),item)
  for(const item of tombstones){
    const id=entityId(item.entityType,item.entityKey),current=result.get(id)
    if(!current||timestamp(item.deletedAt)>timestamp(current.updated_at))result.set(id,{entity_type:item.entityType,entity_key:item.entityKey,payload:null,updated_at:item.deletedAt,deleted:true})
  }
  return result
}

// Supabase で削除済みのレコードを端末から削除し、削除情報も端末に残す。
// これにより、次回同期で古いデータを復活させない。
async function deleteRemoteEntity(item:RemoteEntity){
  switch(item.entity_type){
    case'staff':await db.staff.delete(Number(item.entity_key));break
    case'schedule':{const current=await db.schedules.where('date').equals(item.entity_key).first();if(current?.id!==undefined)await db.schedules.delete(current.id);break}
    case'record':{const current=await db.records.where('date').equals(item.entity_key).first();if(current?.id!==undefined)await db.records.delete(current.id);break}
    case'draft':await db.drafts.delete(item.entity_key as Draft['id']);break
    case'weather_location':await db.weatherLocations.delete(item.entity_key as WeatherLocation['id']);break
    case'record_options':await db.recordOptions.delete(item.entity_key as RecordOptions['id']);break
  }
  await db.syncTombstones.put({id:entityId(item.entity_type,item.entity_key),entityType:item.entity_type,entityKey:item.entity_key,deletedAt:item.updated_at})
}

// Supabase から取得した有効なレコードを、対応する IndexedDB テーブルへ保存する。
// 日付をキーとする予定・記録は、端末側の ID を保ったまま更新する。
async function putRemoteEntity(item:RemoteEntity){
  if(!item.payload||typeof item.payload!=='object')return
  switch(item.entity_type){
    case'staff':await db.staff.put(item.payload as Staff);break
    case'schedule':{
      const payload=item.payload as Schedule,current=await db.schedules.where('date').equals(item.entity_key).first()
      await db.schedules.put({...payload,id:current?.id})
      break
    }
    case'record':{
      const payload=item.payload as DailyRecord,current=await db.records.where('date').equals(item.entity_key).first()
      await db.records.put({...payload,id:current?.id})
      break
    }
    case'draft':await db.drafts.put(item.payload as Draft);break
    case'weather_location':await db.weatherLocations.put(item.payload as WeatherLocation);break
    case'record_options':await db.recordOptions.put(item.payload as RecordOptions);break
  }
  await db.syncTombstones.delete(entityId(item.entity_type,item.entity_key))
}

// ダウンロード対象を1つの IndexedDB トランザクションで反映する。
// 途中で失敗しても一部のテーブルだけが更新された状態を避ける。
async function applyRemoteEntities(items:RemoteEntity[]){
  await db.transaction('rw',[db.staff,db.schedules,db.records,db.drafts,db.weatherLocations,db.recordOptions,db.syncTombstones],async()=>{
    for(const item of items){
      if(item.deleted)await deleteRemoteEntity(item)
      else await putRemoteEntity(item)
    }
  })
}

// 端末と Supabase を1回だけ比較し、更新時刻が新しい側のデータを採用する。
// 通信中に端末のデータが変わった場合は、もう一度同期を予約する。
async function syncOnce(){
  const currentSession=session
  if(!currentSession)return
  if(!navigator.onLine){setState({phase:'offline',message:'オフラインです。変更はこの端末に保存されています。'});return}
  setState({phase:'syncing',message:'PC・スマホのデータを同期しています。'})
  const revisionAtStart=localRevision
  const local=await collectLocalEntities()
  const{data,error}=await supabase.from('compass_data').select('entity_type,entity_key,payload,updated_at,deleted')
  if(error)throw error
  if(revisionAtStart!==localRevision){syncRequested=true;return}
  const remote=new Map<string,RemoteEntity>()
  for(const raw of data??[]){
    const item=raw as RemoteEntity
    remote.set(entityId(item.entity_type,item.entity_key),item)
  }
  const download:RemoteEntity[]=[]
  const upload:RemoteEntity[]=[]
  const keys=new Set([...local.keys(),...remote.keys()])
  for(const key of keys){
    const localItem=local.get(key),remoteItem=remote.get(key)
    if(localItem&&!remoteItem){upload.push(localItem);continue}
    if(remoteItem&&!localItem){download.push(remoteItem);continue}
    if(!localItem||!remoteItem)continue
    if(timestamp(localItem.updated_at)>timestamp(remoteItem.updated_at))upload.push(localItem)
    else if(timestamp(remoteItem.updated_at)>timestamp(localItem.updated_at)||localItem.deleted!==remoteItem.deleted)download.push(remoteItem)
  }
  if(download.length)await applyRemoteEntities(download)
  for(let index=0;index<upload.length;index+=100){
    const rows=upload.slice(index,index+100).map(item=>({...item,user_id:currentSession.user.id}))
    const{error:uploadError}=await supabase.from('compass_data').upsert(rows,{onConflict:'user_id,entity_type,entity_key'})
    if(uploadError)throw uploadError
  }
  const completedAt=new Date().toISOString()
  setState({phase:'synced',message:'この端末とSupabaseは同期済みです。',lastSyncedAt:completedAt})
}

// 同期処理を同時に複数走らせず、追加の同期要求は現在の処理完了後にまとめて実行する。
async function runSyncLoop(){
  if(syncPromise)return syncPromise
  syncPromise=(async()=>{
    try{
      do{syncRequested=false;await syncOnce()}while(syncRequested)
    }catch(error){
      const message=error instanceof Error?error.message:'同期に失敗しました。'
      setState({phase:navigator.onLine?'error':'offline',message:navigator.onLine?`同期できませんでした: ${message}`:'オフラインです。変更はこの端末に保存されています。'})
    }finally{syncPromise=null}
  })()
  return syncPromise
}

// ログインユーザーに紐づく Realtime 監視を停止し、不要な接続を残さない。
function stopRealtime(){if(channel){void supabase.removeChannel(channel);channel=null}}
// 他端末で compass_data が変わったら、端末間の差分同期を予約する。
function startRealtime(userId:string){
  stopRealtime()
  channel=supabase.channel(`compass-data-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'compass_data',filter:`user_id=eq.${userId}`},()=>requestSync()).subscribe()
}

// 認証状態の変化に応じて、同期の開始・停止と端末所有者の確認を行う。
// 別アカウントの端末データを上書きしないよう、ユーザー ID が異なる場合は同期しない。
async function useSession(nextSession:Session|null){
  session=nextSession
  stopRealtime()
  if(!nextSession){setState({phase:'signed-out',email:null,message:'ログインするとPC・スマホで同じデータを使えます。'});return}
  const owner=await db.syncOwners.get('owner')
  if(owner&&owner.userId!==nextSession.user.id){
    setState({phase:'error',email:nextSession.user.email??null,message:'この端末には別アカウントのデータがあります。元のアカウントでログインしてください。'})
    return
  }
  if(!owner)await db.syncOwners.put({id:'owner',userId:nextSession.user.id})
  setState({phase:navigator.onLine?'syncing':'offline',email:nextSession.user.email??null,message:navigator.onLine?'ログインしました。同期を開始します。':'オフラインです。変更はこの端末に保存されています。'})
  startRealtime(nextSession.user.id)
  requestSync()
}

// アプリ起動時に認証状態、ネットワーク復帰、画面復帰、定期実行を登録する。
// 同じ初期化処理を重複して登録しないよう、Promise を保持する。
export function startSync(){
  if(startPromise)return startPromise
  startPromise=(async()=>{
    const{data,error}=await supabase.auth.getSession()
    if(error)throw error
    await useSession(data.session)
    supabase.auth.onAuthStateChange((_event,nextSession)=>{window.setTimeout(()=>void useSession(nextSession),0)})
    window.addEventListener('online',()=>requestSync())
    window.addEventListener('offline',()=>{if(session)setState({phase:'offline',message:'オフラインです。変更はこの端末に保存されています。'})})
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')requestSync()})
    window.setInterval(()=>requestSync(),15_000)
  })().catch(error=>{
    setState({phase:'error',message:error instanceof Error?error.message:'同期の初期化に失敗しました。'})
  })
  return startPromise
}

// すぐに同期を依頼する。実行中の場合は runSyncLoop が次の1回を続けて処理する。
export function requestSync(){syncRequested=true;void runSyncLoop()}
// 端末内の変更を短時間まとめてから同期し、入力中の通信回数を抑える。
export function notifyLocalChange(delay=900){
  localRevision+=1
  if(syncTimer!==undefined)window.clearTimeout(syncTimer)
  syncTimer=window.setTimeout(()=>{syncTimer=undefined;requestSync()},delay)
}

// 月ごとの通常利用予定をまとめて更新し、解除した日付は削除情報として同期対象にする。
export async function applyRegularScheduleChanges(schedules:Schedule[],datesToDelete:string[]){
  const deletedAt=new Date().toISOString()
  await db.transaction('rw',db.schedules,db.syncTombstones,async()=>{
    for(const schedule of schedules){
      const current=await db.schedules.where('date').equals(schedule.date).first()
      if(!current)await db.schedules.add(schedule)
      await db.syncTombstones.delete(entityId('schedule',schedule.date))
    }
    for(const date of datesToDelete){
      const current=await db.schedules.where('date').equals(date).first()
      if(current?.id===undefined||current.type!=='regular')continue
      await db.schedules.delete(current.id)
      await db.syncTombstones.put({id:entityId('schedule',date),entityType:'schedule',entityKey:date,deletedAt})
    }
  })
  notifyLocalChange()
}

// 担当者を端末から削除し、他端末にも削除を伝える情報を記録する。
export async function deleteSyncedStaff(id:number){
  const deletedAt=new Date().toISOString()
  await db.transaction('rw',db.staff,db.syncTombstones,async()=>{
    await db.staff.delete(id)
    await db.syncTombstones.put({id:entityId('staff',String(id)),entityType:'staff',entityKey:String(id),deletedAt})
  })
  notifyLocalChange(0)
}

// 指定したメールアドレスへ、ログイン用の6桁コードを送信する。
export async function sendSyncOtp(email:string){
  const{error}=await supabase.auth.signInWithOtp({
    email,
    options:{shouldCreateUser:true},
  })
  if(error)throw error
}

// メールで受け取ったコードを検証し、成功時に Supabase のログイン状態を作成する。
export async function verifySyncOtp(email:string,token:string){
  const{data,error}=await supabase.auth.verifyOtp({email,token,type:'email'})
  if(error)throw error
  if(!data.session)throw new Error('OTP verification did not create a session')
}

// 現在の Supabase セッションを終了し、端末間同期を停止する。
export async function signOutFromSync(){await supabase.auth.signOut()}
// 画面の「今すぐ同期」操作用。同期の完了または失敗まで待機する。
export async function syncNow(){syncRequested=true;await runSyncLoop()}
