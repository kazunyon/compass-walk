import Dexie,{type EntityTable}from'dexie';
import type{CachedWeather,DailyRecord,Draft,RecordOptions,Schedule,Staff,SyncOwner,SyncTombstone,WeatherLocation}from'./types';
import{defaultExerciseMinutes,legacyDefaultExerciseMinutes}from'./features/records/recordOptions';
import{strengthTrainingText,strengthTrainingTotal}from'./features/records/strengthTraining';
import{rehabProgramsText,rehabProgramsTotal}from'./features/records/rehabPrograms';

// IndexedDB の各テーブルと検索用インデックス。変更時は新しい version を追加して移行する。
const stores={staff:'++id,name,role',schedules:'++id,&date,type',records:'++id,&date',drafts:'id',weatherLocations:'id',weatherCache:'++id,&[locationId+date],date',recordOptions:'id'};
/*
 * Dexie インスタンスへ、テーブル名とレコード型を対応付ける。
 * ここで定義した型により、各テーブルの読み書きで項目名や ID の型を検査できる。
 */
const db=new Dexie('CompassWalkDB') as Dexie&{
  // 担当者の氏名・職種・作成日時を保存するテーブル。
  staff:EntityTable<Staff,'id'>;
  // 利用予定の日付、利用種別、メモを保存するテーブル。
  schedules:EntityTable<Schedule,'id'>;
  // 体調、バイタル、運動、成果など、日ごとの記録を保存するテーブル。
  records:EntityTable<DailyRecord,'id'>;
  // 記録画面で保存途中の入力内容を、端末内で一時保存するテーブル。
  drafts:EntityTable<Draft,'id'>;
  // 天気を取得する地域・地点の設定を保存するテーブル。
  weatherLocations:EntityTable<WeatherLocation,'id'>;
  // 取得済みの天気情報を、地域と日付の組み合わせでキャッシュするテーブル。
  weatherCache:EntityTable<CachedWeather,'id'>;
  // 運動時間など、記録画面で選ぶ候補値の設定を保存するテーブル。
  recordOptions:EntityTable<RecordOptions,'id'>;
  // 別端末へ削除済みデータを伝えるための削除情報を保存するテーブル。
  syncTombstones:EntityTable<SyncTombstone,'id'>;
  // 同期先のユーザー情報と、同期状態を管理するテーブル。
  syncOwners:EntityTable<SyncOwner,'id'>;
};
// 既存端末のデータを保ったまま段階的にスキーマを更新する。
db.version(1).stores({staff:'++id,name,role',schedules:'++id,&date,type',records:'++id,&date',drafts:'id'});
db.version(2).stores({...stores,recordOptions:null});
db.version(3).stores(stores);
const defaultStaff=[{name:'杉本',role:'理学療法士'},{name:'岸田',role:'理学療法士'},{name:'松本',role:'理学療法士'},{name:'土屋',role:'理学療法士'},{name:'八木澤',role:'柔道整復師'},{name:'富田',role:'柔道整復師'},{name:'田村',role:'看護師'},{name:'岩堀',role:'その他'}]as const;
const seedTimestamp='2026-01-01T00:00:00.000Z';
// v4 以前から更新した端末にも、未登録の初期担当者だけを追加する。
db.version(4).stores(stores).upgrade(async tx=>{const staff=tx.table('staff');for(const person of defaultStaff)if(!await staff.where('name').equals(person.name).and(item=>item.role===person.role).first())await staff.add({...person,createdAt:seedTimestamp,updatedAt:seedTimestamp})});
db.version(5).stores({...stores,syncTombstones:'id,entityType,deletedAt',syncOwners:'id'});
// 旧既定値を使っている場合だけ、新しい運動時間の既定値に置き換える。
db.version(6).stores({...stores,syncTombstones:'id,entityType,deletedAt',syncOwners:'id'}).upgrade(async tx=>{
  const options=await tx.table('recordOptions').get('record-options')as RecordOptions|undefined;
  const usesLegacyDefaults=options?.exerciseMinutes.length===legacyDefaultExerciseMinutes.length&&options.exerciseMinutes.every((value,index)=>value===legacyDefaultExerciseMinutes[index]);
  if(usesLegacyDefaults)await tx.table('recordOptions').put({...options,exerciseMinutes:[...defaultExerciseMinutes],updatedAt:new Date().toISOString()});
});
// 地域設定が作成・更新された時刻を自動で設定し、同期時の新旧判定に利用する。
db.weatherLocations.hook('creating',(_key,item)=>{item.updatedAt??=new Date().toISOString()});
db.weatherLocations.hook('updating',changes=>('updatedAt'in changes&&changes.updatedAt?undefined:{updatedAt:new Date().toISOString()}));
// JSON バックアップのファイル形式。将来形式を変更する場合は version を追加する。
export type BackupFile={format:'compass-walk-backup';version:1;exportedAt:string;staff:Staff[];schedules:Schedule[];records:DailyRecord[];drafts:Draft[]};
// 復元可能な JSON バックアップに、端末内の主要データをまとめる。
export async function createBackup():Promise<BackupFile>{return{format:'compass-walk-backup',version:1,exportedAt:new Date().toISOString(),staff:await db.staff.toArray(),schedules:await db.schedules.toArray(),records:await db.records.toArray(),drafts:await db.drafts.toArray()}}
// Blob URL を使って、ブラウザから文字列を指定ファイル名でダウンロードさせる。
export function downloadText(text:string,name:string,type:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),0)}
// バックアップの作成時刻をファイル名へ付け、複数回保存しても識別しやすくする。
export async function downloadBackup(prefix='compass-walk-backup'){const backup=await createBackup();downloadText(JSON.stringify(backup,null,2),`${prefix}-${backup.exportedAt.slice(0,10)}.json`,'application/json');return backup}
// 形式を検証してから、4 テーブルを 1 トランザクションで入れ替える。
export async function restoreBackup(value:unknown){const data=value as Partial<BackupFile>;if(data.format!=='compass-walk-backup'||data.version!==1||!Array.isArray(data.staff)||!Array.isArray(data.schedules)||!Array.isArray(data.records)||!Array.isArray(data.drafts))throw new Error('バックアップファイルの形式が正しくありません。');await db.transaction('rw',db.staff,db.schedules,db.records,db.drafts,async()=>{await Promise.all([db.staff.clear(),db.schedules.clear(),db.records.clear(),db.drafts.clear()]);await db.staff.bulkPut(data.staff!);await db.schedules.bulkPut(data.schedules!);await db.records.bulkPut(data.records!);await db.drafts.bulkPut(data.drafts!)})}
// Excel などで開ける CSV として、日付順に日々の記録を出力する。
// 文字化けを避けるため、先頭に UTF-8 の BOM を付ける。
export async function downloadRecordsCsv(){const rs=await db.records.orderBy('date').toArray();const esc=(x:unknown)=>`"${String(x??'').replaceAll('"','""')}"`;const lines=[['利用日','利用前の体調','睡眠','疲労','気分','痛みレベル','痛い場所','体温','血圧','脈拍','SpO2','実施運動','運動時間','筋トレ内容','筋トレ合計時間（分）','運動・療法内容','運動・療法合計時間（分）','今日の成果','満足度'],...rs.map(x=>[x.date,x.beforeCondition,x.sleep,x.fatigue,x.mood,x.painLevel,x.painAreas?.join('、'),x.vitals?.temperature,x.vitals?.bloodPressure,x.vitals?.pulse,x.vitals?.spo2,x.exercises?.join('、'),x.exerciseMinutes,strengthTrainingText(x.strengthTraining),x.strengthTraining?.length?strengthTrainingTotal(x.strengthTraining):'',rehabProgramsText(x.rehabPrograms),x.rehabPrograms?.length?rehabProgramsTotal(x.rehabPrograms):'',x.achievement,x.satisfaction])].map(row=>row.map(esc).join(',')).join('\r\n');downloadText('\uFEFF'+lines,`compass-walk-records-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8')}
let seedPromise:Promise<void>|null=null;
// 初回起動時にだけ、重複を避けて標準の担当者を登録する。
export function seedDatabase(){
  seedPromise??=db.transaction('rw',db.staff,async()=>{for(const person of defaultStaff)if(!await db.staff.where('name').equals(person.name).and(item=>item.role===person.role).first())await db.staff.add({...person,createdAt:seedTimestamp,updatedAt:seedTimestamp})});
  return seedPromise;
}
export default db;
