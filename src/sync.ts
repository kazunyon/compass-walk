import {createClient,type RealtimeChannel,type Session,type SupabaseClient} from '@supabase/supabase-js'
import db from './db'
import type {DailyRecord,Draft,RecordOptions,Schedule,Staff,SyncEntityType,WeatherLocation} from './types'

const projectUrl=import.meta.env.VITE_SUPABASE_URL||'https://uaknupbbuxwjowzkoihu.supabase.co'
const publishableKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_v-TnFBvQSUHAuCDR4O6DSA_QVF_Uqhl'

const runtime=globalThis as typeof globalThis&{__compassSupabase?:SupabaseClient}
export const supabase=runtime.__compassSupabase??createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
runtime.__compassSupabase=supabase

export type SyncPhase='starting'|'signed-out'|'syncing'|'synced'|'offline'|'error'
export interface SyncState{
  phase:SyncPhase
  email:string|null
  message:string
  lastSyncedAt:string|null
}

type RemoteEntity={
  entity_type:SyncEntityType
  entity_key:string
  payload:unknown|null
  updated_at:string
  deleted:boolean
}

const listeners=new Set<()=>void>()
let state:SyncState={phase:'starting',email:null,message:'同期を準備しています。',lastSyncedAt:null}
let session:Session|null=null
let channel:RealtimeChannel|null=null
let startPromise:Promise<void>|null=null
let syncPromise:Promise<void>|null=null
let syncRequested=false
let syncTimer:number|undefined
let localRevision=0

function setState(next:Partial<SyncState>){
  state={...state,...next}
  listeners.forEach(listener=>listener())
}

export function subscribeSync(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener)}
export function getSyncState(){return state}

function timestamp(value:string|undefined){const parsed=Date.parse(value??'');return Number.isFinite(parsed)?parsed:0}
function entityId(type:SyncEntityType,key:string){return `${type}:${key}`}

function activeEntity(type:SyncEntityType,key:string,payload:unknown,updatedAt:string):RemoteEntity{
  return{entity_type:type,entity_key:key,payload,updated_at:updatedAt,deleted:false}
}

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

async function applyRemoteEntities(items:RemoteEntity[]){
  await db.transaction('rw',[db.staff,db.schedules,db.records,db.drafts,db.weatherLocations,db.recordOptions,db.syncTombstones],async()=>{
    for(const item of items){
      if(item.deleted)await deleteRemoteEntity(item)
      else await putRemoteEntity(item)
    }
  })
}

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

function stopRealtime(){if(channel){void supabase.removeChannel(channel);channel=null}}
function startRealtime(userId:string){
  stopRealtime()
  channel=supabase.channel(`compass-data-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'compass_data',filter:`user_id=eq.${userId}`},()=>requestSync()).subscribe()
}

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

export function requestSync(){syncRequested=true;void runSyncLoop()}
export function notifyLocalChange(delay=900){
  localRevision+=1
  if(syncTimer!==undefined)window.clearTimeout(syncTimer)
  syncTimer=window.setTimeout(()=>{syncTimer=undefined;requestSync()},delay)
}

export async function deleteSyncedStaff(id:number){
  const deletedAt=new Date().toISOString()
  await db.transaction('rw',db.staff,db.syncTombstones,async()=>{
    await db.staff.delete(id)
    await db.syncTombstones.put({id:entityId('staff',String(id)),entityType:'staff',entityKey:String(id),deletedAt})
  })
  notifyLocalChange(0)
}

export async function signInForSync(email:string,password:string){
  const{error}=await supabase.auth.signInWithPassword({email,password})
  if(error)throw error
}

export async function signUpForSync(email:string,password:string){
  const{data,error}=await supabase.auth.signUp({email,password})
  if(error)throw error
  return Boolean(data.session)
}

export async function signOutFromSync(){await supabase.auth.signOut()}
export async function syncNow(){syncRequested=true;await runSyncLoop()}
