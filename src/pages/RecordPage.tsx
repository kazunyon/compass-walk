import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CloudUpload, Save } from 'lucide-react';
import db from '../db';
import type { DailyRecord } from '../types';

type FormValues = Partial<DailyRecord> & { date: string };
const choices = {
  beforeCondition: ['とても良い', '良い', 'ふつう', 'あまり良くない', '悪い'], sleep: ['よく眠れた', 'まあ眠れた', '眠りが浅い', 'あまり眠れなかった'], fatigue: ['なし', '少しある', 'ある', '強い'], mood: ['とても良い', '良い', 'ふつう', '沈みがち'], painLevel: ['なし', '軽い', '中くらい', '強い'], exerciseMinutes: ['10分未満', '10〜20分', '20〜30分', '30分以上'], assistanceLevel: ['見守り', '一部介助', '中等度介助', '全介助'], afterFatigue: ['なし', '少しある', 'ある', '強い'], afterPain: ['なし', '軽い', '中くらい', '強い'], satisfaction: ['とても満足', '満足', 'ふつう', '不満']
};
const defaults: FormValues = { date: new Date().toISOString().slice(0, 10), painAreas: [], staffIds: [], exercises: [], assistiveDevices: [], homeExercises: [] };
const multiOptions = { painAreas: ['なし', '首・肩', '腰', 'ひざ', '足', 'その他'], exercises: ['ストレッチ', '歩行練習', '筋力トレーニング', 'バランス運動', '自転車'], assistiveDevices: ['なし', '杖', '歩行器', '装具', '車いす'], homeExercises: ['ストレッチ', '散歩', '筋力トレーニング', 'バランス練習'] };

export function RecordPage() {
  const draft = useLiveQuery(() => db.drafts.get('record'), []);
  const staff = useLiveQuery(() => db.staff.toArray(), []);
  const { register, watch, reset, setValue, getValues, handleSubmit } = useForm<FormValues>({ defaultValues: defaults });
  const [saveMessage, setSaveMessage] = useState('下書きは自動保存されます');
  const initialized = useRef(false); const formValues = watch();
  useEffect(() => { if (!initialized.current && draft) { reset({ ...defaults, ...draft.data }); initialized.current = true; } if (!draft) initialized.current = true; }, [draft, reset]);
  const saveDraft = async () => { await db.drafts.put({ id: 'record', data: getValues(), updatedAt: new Date().toISOString() }); setSaveMessage('下書きを保存しました'); };
  useEffect(() => { if (!initialized.current) return; const id = window.setTimeout(() => void saveDraft(), 0); return () => window.clearTimeout(id); }, [formValues]);
  useEffect(() => { const id = window.setInterval(() => void saveDraft(), 30000); return () => window.clearInterval(id); }, []);
  const toggle = (field: keyof typeof multiOptions | 'staffIds', value: string | number) => { const current = ((getValues(field) ?? []) as (string | number)[]); setValue(field, (current.includes(value) ? current.filter(x => x !== value) : [...current, value]) as never, { shouldDirty: true }); };
  const selectOne = (label: string, field: keyof typeof choices) => <section className="record-section"><h2>{label}</h2><div className="option-grid">{choices[field].map(item => <label key={item} className={(formValues as unknown as Record<string,string>)[field] === item ? 'option selected' : 'option'}><input type="radio" value={item} {...register(field)} />{item}</label>)}</div></section>;
  const selectMany = (label: string, field: keyof typeof multiOptions | 'staffIds', options: { label: string; value: string | number }[]) => { const selected = ((formValues as Record<string, unknown>)[field] ?? []) as (string | number)[]; return <section className="record-section"><h2>{label}</h2><div className="option-grid">{options.map(({label: item, value}) => <button type="button" key={String(value)} className={selected.includes(value) ? 'option selected' : 'option'} onClick={() => toggle(field, value)}>{selected.includes(value) && <Check size={15}/>} {item}</button>)}</div></section>; };
  const saveRecord = async (data: FormValues) => { await db.records.put({ ...data, weather: data.weather ?? 'unset', updatedAt: new Date().toISOString() } as DailyRecord); await db.drafts.delete('record'); setSaveMessage('記録を保存しました'); };
  return <form className="record-form" onSubmit={handleSubmit(saveRecord)}>
    <small>DAILY RECORD</small><h1>今日の記録</h1><p className="draft-status"><CloudUpload size={16}/>{saveMessage}</p>
    <section className="record-section date-section"><label>利用日<input type="date" {...register('date')} /></label></section>
    {selectOne('利用前の体調', 'beforeCondition')}{selectOne('睡眠', 'sleep')}{selectOne('疲労', 'fatigue')}{selectOne('気分', 'mood')}{selectOne('痛みレベル', 'painLevel')}
    {selectMany('痛い場所', 'painAreas', multiOptions.painAreas.map(x => ({label:x,value:x})))}
    <section className="record-section"><h2>バイタル</h2><div className="vitals"><label>体温<input inputMode="decimal" placeholder="例 36.5 ℃" {...register('vitals.temperature', { valueAsNumber: true })}/></label><label>血圧<input placeholder="例 120 / 80" {...register('vitals.bloodPressure')}/></label><label>脈拍<input inputMode="numeric" placeholder="例 72 回/分" {...register('vitals.pulse', { valueAsNumber: true })}/></label><label>SpO2<input inputMode="numeric" placeholder="例 98 %" {...register('vitals.spo2', { valueAsNumber: true })}/></label></div></section>
    {selectMany('担当者', 'staffIds', (staff ?? []).map(x => ({label:`${x.name}（${x.role}）`,value:x.id!})))}{selectMany('実施運動', 'exercises', multiOptions.exercises.map(x => ({label:x,value:x})))}{selectOne('運動時間', 'exerciseMinutes')}{selectMany('使用した補助具', 'assistiveDevices', multiOptions.assistiveDevices.map(x => ({label:x,value:x})))}{selectOne('介助レベル', 'assistanceLevel')}
    <section className="record-section"><h2>今日の成果</h2><input placeholder="例 休まずに10分歩けた" {...register('achievement')} /></section><section className="record-section"><h2>指導されたこと</h2><input placeholder="例 姿勢を意識する" {...register('instructions')} /></section>
    {selectMany('自宅で行う運動', 'homeExercises', multiOptions.homeExercises.map(x => ({label:x,value:x})))}{selectOne('利用後の疲れ', 'afterFatigue')}{selectOne('利用後の痛み', 'afterPain')}{selectOne('満足度', 'satisfaction')}
    <button className="save record-save" type="submit"><Save size={19}/>記録を保存する</button>
  </form>;
}