import Dexie,{type EntityTable}from'dexie';
import type{CachedWeather,DailyRecord,Draft,RecordOptions,Schedule,Staff,SyncOwner,SyncTombstone,WeatherLocation}from'./types';
import{defaultExerciseMinutes,legacyDefaultExerciseMinutes}from'./features/records/recordOptions';

const stores={staff:'++id,name,role',schedules:'++id,&date,type',records:'++id,&date',drafts:'id',weatherLocations:'id',weatherCache:'++id,&[locationId+date],date',recordOptions:'id'};
const db=new Dexie('CompassWalkDB') as Dexie&{
  staff:EntityTable<Staff,'id'>;
  schedules:EntityTable<Schedule,'id'>;
  records:EntityTable<DailyRecord,'id'>;
  drafts:EntityTable<Draft,'id'>;
  weatherLocations:EntityTable<WeatherLocation,'id'>;
  weatherCache:EntityTable<CachedWeather,'id'>;
  recordOptions:EntityTable<RecordOptions,'id'>;
  syncTombstones:EntityTable<SyncTombstone,'id'>;
  syncOwners:EntityTable<SyncOwner,'id'>;
};
db.version(1).stores({staff:'++id,name,role',schedules:'++id,&date,type',records:'++id,&date',drafts:'id'});
db.version(2).stores({...stores,recordOptions:null});
db.version(3).stores(stores);
const defaultStaff=[{name:'杉本',role:'理学療法士'},{name:'岸田',role:'理学療法士'},{name:'松本',role:'理学療法士'},{name:'土屋',role:'理学療法士'},{name:'八木澤',role:'柔道整復師'},{name:'富田',role:'柔道整復師'},{name:'田村',role:'看護師'},{name:'岩堀',role:'その他'}]as const;
const seedTimestamp='2026-01-01T00:00:00.000Z';
db.version(4).stores(stores).upgrade(async tx=>{const staff=tx.table('staff');for(const person of defaultStaff)if(!await staff.where('name').equals(person.name).and(item=>item.role===person.role).first())await staff.add({...person,createdAt:seedTimestamp,updatedAt:seedTimestamp})});
db.version(5).stores({...stores,syncTombstones:'id,entityType,deletedAt',syncOwners:'id'});
db.version(6).stores({...stores,syncTombstones:'id,entityType,deletedAt',syncOwners:'id'}).upgrade(async tx=>{
  const options=await tx.table('recordOptions').get('record-options')as RecordOptions|undefined;
  const usesLegacyDefaults=options?.exerciseMinutes.length===legacyDefaultExerciseMinutes.length&&options.exerciseMinutes.every((value,index)=>value===legacyDefaultExerciseMinutes[index]);
  if(usesLegacyDefaults)await tx.table('recordOptions').put({...options,exerciseMinutes:[...defaultExerciseMinutes],updatedAt:new Date().toISOString()});
});
db.weatherLocations.hook('creating',(_key,item)=>{item.updatedAt??=new Date().toISOString()});
db.weatherLocations.hook('updating',changes=>('updatedAt'in changes&&changes.updatedAt?undefined:{updatedAt:new Date().toISOString()}));
export type BackupFile={format:'compass-walk-backup';version:1;exportedAt:string;staff:Staff[];schedules:Schedule[];records:DailyRecord[];drafts:Draft[]};
export async function createBackup():Promise<BackupFile>{return{format:'compass-walk-backup',version:1,exportedAt:new Date().toISOString(),staff:await db.staff.toArray(),schedules:await db.schedules.toArray(),records:await db.records.toArray(),drafts:await db.drafts.toArray()}}
export function downloadText(text:string,name:string,type:string){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),0)}
export async function downloadBackup(prefix='compass-walk-backup'){const backup=await createBackup();downloadText(JSON.stringify(backup,null,2),`${prefix}-${backup.exportedAt.slice(0,10)}.json`,'application/json');return backup}
export async function restoreBackup(value:unknown){const data=value as Partial<BackupFile>;if(data.format!=='compass-walk-backup'||data.version!==1||!Array.isArray(data.staff)||!Array.isArray(data.schedules)||!Array.isArray(data.records)||!Array.isArray(data.drafts))throw new Error('バックアップファイルの形式が正しくありません。');await db.transaction('rw',db.staff,db.schedules,db.records,db.drafts,async()=>{await Promise.all([db.staff.clear(),db.schedules.clear(),db.records.clear(),db.drafts.clear()]);await db.staff.bulkPut(data.staff!);await db.schedules.bulkPut(data.schedules!);await db.records.bulkPut(data.records!);await db.drafts.bulkPut(data.drafts!)})}
export async function downloadRecordsCsv(){const rs=await db.records.orderBy('date').toArray();const esc=(x:unknown)=>`"${String(x??'').replaceAll('"','""')}"`;const lines=[['利用日','利用前の体調','睡眠','疲労','気分','痛みレベル','痛い場所','体温','血圧','脈拍','SpO2','実施運動','運動時間','今日の成果','満足度'],...rs.map(x=>[x.date,x.beforeCondition,x.sleep,x.fatigue,x.mood,x.painLevel,x.painAreas?.join('、'),x.vitals?.temperature,x.vitals?.bloodPressure,x.vitals?.pulse,x.vitals?.spo2,x.exercises?.join('、'),x.exerciseMinutes,x.achievement,x.satisfaction])].map(row=>row.map(esc).join(',')).join('\r\n');downloadText('\uFEFF'+lines,`compass-walk-records-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8')}
let seedPromise:Promise<void>|null=null;
export function seedDatabase(){
  seedPromise??=db.transaction('rw',db.staff,async()=>{for(const person of defaultStaff)if(!await db.staff.where('name').equals(person.name).and(item=>item.role===person.role).first())await db.staff.add({...person,createdAt:seedTimestamp,updatedAt:seedTimestamp})});
  return seedPromise;
}
export default db;
