export type VisitType='regular'|'makeup'|'absence'|'cancelled'; export type Weather='sunny'|'cloudy'|'rainy'|'snowy'|'unset'; export type StaffRole='理学療法士'|'柔道整復師'|'看護師'|'その他';
export interface WeatherLocation { id?: 'default'; name: string; latitude: number; longitude: number; timezone: string; updatedAt?: string }
export interface WeatherData { value: Weather; source: 'auto'|'manual'; fetchedAt?: string; temperatureMax?: number; temperatureMin?: number; precipitationProbability?: number }
export interface CachedWeather extends WeatherData { id?: number; locationId: 'default'; date: string }
export type RecordWeather = Weather | WeatherData
export type StrengthTrainingMachineId='leg-press'|'hip-abduction'|'leg-extension'|'chest-press'|'torso-flex'|'rowing'
export type StrengthTrainingMinutes=3|4|5|6
export interface StrengthTrainingEntry{machineId:StrengthTrainingMachineId;minutes:StrengthTrainingMinutes}
export type RehabProgramId='exercise-bike'|'parallel-bars'|'stair-training'|'hot-pack'|'upper-limb-pulley'
export interface RehabProgramEntry{programId:RehabProgramId;minutes:number}
export interface Staff{id?:number;name:string;role:StaffRole;createdAt:string;updatedAt?:string} export interface Schedule{id?:number;date:string;type:VisitType;note?:string;updatedAt:string}
export interface DailyRecord{id?:number;date:string;weather:RecordWeather;condition?:string;beforeCondition?:string;sleep?:string;fatigue?:string;mood?:string;painLevel?:string;painAreas?:string[];vitals?:{bloodPressure?:string;pulse?:number;temperature?:number;spo2?:number};staffIds?:number[];exercises?:string[];exerciseMinutes?:string;strengthTraining?:StrengthTrainingEntry[];rehabPrograms?:RehabProgramEntry[];assistiveDevices?:string[];assistanceLevel?:string;achievement?:string;instructions?:string;homeExercises?:string[];afterFatigue?:string;afterPain?:string;satisfaction?:string;updatedAt:string}
export interface Draft{id:'record';data:Partial<DailyRecord>;updatedAt:string}
export interface RecordOptions{id:'record-options';exercises:string[];exerciseMinutes:string[];updatedAt?:string}
export type SyncEntityType='staff'|'schedule'|'record'|'draft'|'weather_location'|'record_options'
export interface SyncTombstone{id:string;entityType:SyncEntityType;entityKey:string;deletedAt:string}
export interface SyncOwner{id:'owner';userId:string}
