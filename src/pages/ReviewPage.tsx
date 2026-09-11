import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, CalendarCheck2, CalendarX2, Dumbbell, Printer, Repeat2, Target, Timer } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import db from '../db'
import type { DailyRecord } from '../types'
import { strengthTrainingMachines } from '../features/records/strengthTraining'
import { rehabPrograms } from '../features/records/rehabPrograms'

const periods = [['今月', 1], ['3か月', 3], ['6か月', 6], ['1年', 12]] as const
const pain: Record<string, number> = { 'なし': 0, '軽い': 1, '中くらい': 2, '強い': 3 }
const condition: Record<string, number> = { '悪い': 1, 'あまり良くない': 2, 'ふつう': 3, '良い': 4, 'とても良い': 5 }
const satisfaction: Record<string, number> = { '不満': 1, 'ふつう': 2, '満足': 3, 'とても満足': 4 }

const fmt = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
const dateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const bloodPressure = (value: string | undefined) => {
  const values = value?.match(/\d+(?:\.\d+)?/g)?.slice(0, 2).map(Number) ?? []
  return values.length === 2 && values.every(Number.isFinite)
    ? { systolic: values[0], diastolic: values[1] }
    : {}
}

function avg(records: DailyRecord[], field: keyof DailyRecord, score: Record<string, number>) {
  const values = records.map(record => score[String(record[field] ?? '')]).filter((value): value is number => value !== undefined)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null
}

type VitalChartProps = {
  title: string
  unit: string
  data: Record<string, string | number | undefined>[]
  lines: { key: string, label: string, color: string }[]
}

function VitalChart({ title, unit, data, lines }: VitalChartProps) {
  const hasData = data.some(point => lines.some(line => point[line.key] !== undefined))
  return <div className="vital-chart-item">
    <h3>{title}<small>{unit}</small></h3>
    {hasData ? <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0ebe6" />
        <XAxis dataKey="date" fontSize={10} minTickGap={12} />
        <YAxis fontSize={10} domain={['auto', 'auto']} />
        <Tooltip />
        {lines.length > 1 ? <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11 }} /> : null}
        {lines.map(line => <Line
          key={line.key}
          type="monotone"
          dataKey={line.key}
          name={line.label}
          stroke={line.color}
          strokeWidth={3}
          dot={{ r: 3 }}
          connectNulls
        />)}
      </LineChart>
    </ResponsiveContainer> : <p className="vital-chart-empty">この項目の記録はありません</p>}
  </div>
}

type TimeSummaryItem = { name: string, count: number, minutes: number }

function TimeSummaryCard({ title, label, items, tone }: {
  title: string
  label: string
  items: TimeSummaryItem[]
  tone: 'strength' | 'rehab'
}) {
  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0)
  const totalCount = items.reduce((sum, item) => sum + item.count, 0)
  const maxMinutes = Math.max(...items.map(item => item.minutes), 1)
  const Icon = tone === 'strength' ? Dumbbell : Timer

  return <section className={`review-card time-dashboard ${tone}`}>
    <div className="time-dashboard-heading">
      <span className="time-dashboard-icon"><Icon aria-hidden="true" /></span>
      <div>
        <small>{label}</small>
        <h2>{title}</h2>
      </div>
    </div>
    <div className="time-dashboard-kpis">
      <div><span>合計時間</span><b>{totalMinutes}<small>分</small></b></div>
      <div><span>実施回数</span><b>{totalCount}<small>回</small></b></div>
    </div>
    <div className="time-dashboard-list">
      {items.map(item => <div className="time-dashboard-row" key={item.name}>
        <div className="time-dashboard-row-heading">
          <b>{item.name}</b>
          <span>{item.count}回</span>
        </div>
        <div className="time-dashboard-bar">
          <span style={{ width: `${item.minutes / maxMinutes * 100}%` }} />
        </div>
        <strong>{item.minutes}<small>分</small></strong>
      </div>)}
    </div>
  </section>
}

export function ReviewPage() {
  const [months, setMonths] = useState(1)
  const location = useLocation()
  const schedules = useLiveQuery(() => db.schedules.toArray(), [])
  const records = useLiveQuery(() => db.records.orderBy('date').toArray(), [])

  useEffect(() => {
    if (location.hash !== '#vitals') return
    const frame = window.requestAnimationFrame(() => document.getElementById('vitals')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash])

  const data = useMemo(() => {
    const allRecords = records ?? []
    const allSchedules = schedules ?? []
    const today = new Date()
    const from = new Date(today)
    from.setMonth(from.getMonth() - (months - 1))
    from.setDate(1)
    const fromKey = dateKey(from)
    const todayKey = dateKey(today)
    const rs = allRecords.filter(record => record.date >= fromKey && record.date <= todayKey)
    const ss = allSchedules.filter(schedule => schedule.date >= fromKey && schedule.date <= todayKey)
    const chart = rs.map(record => ({
      date: fmt(record.date),
      pain: pain[record.painLevel ?? ''],
      condition: condition[record.beforeCondition ?? ''],
      satisfaction: satisfaction[record.satisfaction ?? ''],
      id: record.id,
    }))
    const vitals = rs.map(record => ({
      date: fmt(record.date),
      temperature: finite(record.vitals?.temperature),
      pulse: finite(record.vitals?.pulse),
      spo2: finite(record.vitals?.spo2),
      ...bloodPressure(record.vitals?.bloodPressure),
    }))
    const strengthTally: Record<string, { count: number, minutes: number }> = {}
    const programTally: Record<string, { count: number, minutes: number }> = {}
    const words: Record<string, number> = {}
    rs.forEach(record => {
      record.strengthTraining?.forEach(entry => {
        const current = strengthTally[entry.machineId] ?? { count: 0, minutes: 0 }
        strengthTally[entry.machineId] = { count: current.count + 1, minutes: current.minutes + entry.minutes }
      })
      record.rehabPrograms?.forEach(entry => {
        const current = programTally[entry.programId] ?? { count: 0, minutes: 0 }
        programTally[entry.programId] = { count: current.count + 1, minutes: current.minutes + entry.minutes }
      })
      if (record.achievement?.trim()) words[record.achievement.trim()] = (words[record.achievement.trim()] ?? 0) + 1
    })
    const latest = rs.at(-1) ?? allRecords.at(-1)
    return {
      rs,
      ss,
      chart,
      vitals,
      strengthTraining: strengthTrainingMachines.flatMap(machine => {
        const result = strengthTally[machine.id]
        return result ? [{ name: `${machine.number}${machine.label}`, ...result }] : []
      }),
      rehabPrograms: rehabPrograms.flatMap(program => {
        const result = programTally[program.id]
        return result ? [{ name: program.label, ...result }] : []
      }),
      achievements: Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 3),
      goal: latest?.homeExercises?.length ? `自宅で「${latest.homeExercises.join('・')}」を続ける` : '自宅で行う運動を記録しましょう',
    }
  }, [months, records, schedules])

  const counts = {
    visit: data.ss.filter(schedule => schedule.type === 'regular').length,
    absence: data.ss.filter(schedule => schedule.type === 'absence').length,
    makeup: data.ss.filter(schedule => schedule.type === 'makeup').length,
  }
  const scores = [
    ['痛み', avg(data.rs, 'painLevel', pain), 3, '低いほど負担が少ない状態です'],
    ['体調', avg(data.rs, 'beforeCondition', condition), 5, '高いほど良好な状態です'],
    ['満足度', avg(data.rs, 'satisfaction', satisfaction), 4, '高いほど満足度が高い状態です'],
  ] as const

  return <>
    <section className="review-head">
      <small>REVIEW</small>
      <h1>振り返り</h1>
      <p>記録をもとに、からだと運動の変化を見てみましょう。</p>
      <div className="periods">{periods.map(([label, period]) => <button className={months === period ? 'selected' : ''} onClick={() => setMonths(period)} key={period}>{label}</button>)}</div>
      <button className="print-button" onClick={() => window.print()}><Printer size={16} />印刷</button>
    </section>
    <div className="count-grid">
      <div><CalendarCheck2 /><b>{counts.visit}</b><span>利用回数</span></div>
      <div><CalendarX2 /><b>{counts.absence}</b><span>休み回数</span></div>
      <div><Repeat2 /><b>{counts.makeup}</b><span>振替回数</span></div>
    </div>
    <section className="review-card vital-charts" id="vitals">
      <h2>バイタルの推移</h2>
      <p className="chart-intro">選択した期間に記録した数値を表示します。</p>
      <div className="vital-chart-grid">
        <VitalChart title="体温" unit="℃" data={data.vitals} lines={[{ key: 'temperature', label: '体温', color: '#d07863' }]} />
        <VitalChart title="血圧" unit="mmHg" data={data.vitals} lines={[{ key: 'systolic', label: '上', color: '#176b5a' }, { key: 'diastolic', label: '下', color: '#63a88d' }]} />
        <VitalChart title="脈拍" unit="回/分" data={data.vitals} lines={[{ key: 'pulse', label: '脈拍', color: '#7567aa' }]} />
        <VitalChart title="SpO₂" unit="%" data={data.vitals} lines={[{ key: 'spo2', label: 'SpO₂', color: '#287ba8' }]} />
      </div>
      <p className="chart-caption">数値は記録内容をそのまま表示しています。気になる変化がある場合は医療・介護の担当者へご相談ください。</p>
    </section>
    {!data.rs.length ? <section className="empty-state">
      <Activity />
      <h2>この期間の記録はありません</h2>
      <p>記録を保存すると、ここに変化が表示されます。</p>
      <Link className="primary" to="/record">記録を入力する</Link>
    </section> : <>
      <section className="review-card">
        <h2>体調の推移</h2>
        <div className="score-notes">{scores.map(([name, value, max, hint]) => <div key={name}><b>{name} {value ?? '—'}<small> / {max}</small></b><span>{value === null ? '記録がありません' : hint}</span></div>)}</div>
        <div className="chart"><ResponsiveContainer width="100%" height={235}><LineChart data={data.chart}><CartesianGrid strokeDasharray="3 3" stroke="#e0ebe6" /><XAxis dataKey="date" fontSize={11} /><YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} fontSize={11} /><Tooltip /><Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: 12 }} /><Line type="monotone" dataKey="pain" name="痛み" stroke="#d07863" strokeWidth={3} connectNulls /><Line type="monotone" dataKey="condition" name="体調" stroke="#176b5a" strokeWidth={3} connectNulls /><Line type="monotone" dataKey="satisfaction" name="満足度" stroke="#7567aa" strokeWidth={3} connectNulls /></LineChart></ResponsiveContainer></div>
        <p className="chart-caption">痛みは低いほど、体調・満足度は高いほど良い状態です。期間内に{data.rs.length}件の記録があります。</p>
      </section>
      {data.strengthTraining.length ? <TimeSummaryCard title="筋トレ機器別の合計時間" label="STRENGTH TRAINING" items={data.strengthTraining} tone="strength" /> : null}
      {data.rehabPrograms.length ? <TimeSummaryCard title="運動・療法別の合計時間" label="REHABILITATION" items={data.rehabPrograms} tone="rehab" /> : null}
      <section className="review-card">
        <h2>よく記録された成果</h2>
        {data.achievements.length ? <ol className="achievement-list">{data.achievements.map(([text, count]) => <li key={text}><b>{text}</b><span>{count}回記録</span></li>)}</ol> : <p>「今日の成果」を記録すると、よくできたことがここにまとまります。</p>}
      </section>
      <section className="goal-card"><Target /><div><small>現在の目標</small><b>{data.goal}</b><p>最近の自宅運動から表示しています。</p></div></section>
      <section className="review-card record-list"><h2>この期間の記録</h2>{data.rs.slice().reverse().slice(0, 5).map(record => <Link to={`/records/${record.id}`} key={record.id}><span>{fmt(record.date)}</span><b>{record.achievement || record.exercises?.join('・') || '記録を見る'}</b></Link>)}</section>
    </>}
  </>
}
