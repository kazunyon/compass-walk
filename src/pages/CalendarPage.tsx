import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, MapPin, RefreshCw, RotateCcw, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import db from '../db'
import type { VisitType, Weather } from '../types'
import { LocationNotFoundError, resolveLocationName } from '../features/weather/locationApi'
import { weatherData, weatherIcons, weatherLabels, weatherValue } from '../features/weather/weatherTypes'
import { getWeatherForDate } from '../features/weather/weatherService'
import { applyRegularScheduleChanges } from '../sync'

const labels: Record<VisitType, string> = {
  regular: '通常利用',
  makeup: '振替利用',
  absence: '休み',
  cancelled: 'キャンセル',
}

const weekdays = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
] as const

export function CalendarPage() {
  const [m, setM] = useState(new Date())
  const [sel, setSel] = useState<string | null>(null)
  const [type, setType] = useState<VisitType>('regular')
  const [weather, setWeather] = useState<Weather>('unset')
  const [setting, setSetting] = useState(false)
  const [fetchMessage, setFetchMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [locationBusy, setLocationBusy] = useState(false)
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(() => new Set())
  const weatherRequestInFlight = useRef(false)
  const key = format(m, 'yyyy-MM')
  const ss = useLiveQuery(
    () => db.schedules.filter(x => x != null && typeof x.date === 'string' && x.date.startsWith(key)).toArray(),
    [key],
  ) ?? []
  const records = useLiveQuery(
    () => db.records.filter(x => x != null && typeof x.date === 'string' && x.date.startsWith(key)).toArray(),
    [key],
  ) ?? []
  const cached = useLiveQuery(
    () => db.weatherCache.filter(x => x != null && typeof x.date === 'string' && x.date.startsWith(key)).toArray(),
    [key],
  ) ?? []
  const location = useLiveQuery(() => db.weatherLocations.get('default'), []) ?? undefined
  const start = startOfWeek(startOfMonth(m))
  const end = addDays(endOfMonth(m), 6 - endOfMonth(m).getDay())
  const days = eachDayOfInterval({ start, end })
  const get = (d: string) => ss.find(x => x.date === d)
  const getRecord = (d: string) => records.find(x => x.date === d)
  const getCached = (d: string) => cached.find(x => x.date === d)
  const display = (d: string) => {
    const record = getRecord(d)
    return weatherData(record?.weather)?.source === 'manual'
      ? weatherValue(record?.weather)
      : weatherValue(getCached(d) ?? record?.weather)
  }

  function open(date: string) {
    setSel(date)
    setType(get(date)?.type ?? 'regular')
    setWeather(display(date))
    setFetchMessage('')
  }

  function openLocationSettings() {
    setLocationError('')
    setSetting(true)
  }

  async function save() {
    if (!sel) return
    const now = new Date().toISOString()
    const old = get(sel)
    const oldRecord = getRecord(sel)
    await db.transaction('rw', db.schedules, db.records, async () => {
      await db.schedules.put({ ...old, date: sel, type, updatedAt: now })
      if (weather !== 'unset' || oldRecord) {
        await db.records.put({ ...oldRecord, date: sel, weather: { value: weather, source: 'manual' }, updatedAt: now })
      }
    })
    setSel(null)
  }

  async function refresh() {
    if (weatherRequestInFlight.current) return
    if (!sel || !location) {
      setFetchMessage('利用場所を設定すると天気を取得できます。')
      return
    }
    weatherRequestInFlight.current = true
    setBusy(true)
    setFetchMessage('')
    try {
      const next = await getWeatherForDate(location, sel, true)
      const old = getRecord(sel)
      if (weatherData(old?.weather)?.source !== 'manual') setWeather(next.value)
      setFetchMessage(
        weatherData(old?.weather)?.source === 'manual'
          ? '天気を更新しました。手動変更した天気は保持しています。'
          : '天気を更新しました。',
      )
    } catch {
      setFetchMessage('天気を取得できませんでした。現在の天気を保持しました。')
    } finally {
      weatherRequestInFlight.current = false
      setBusy(false)
    }
  }

  async function bulk() {
    if (selectedWeekdays.size === 0) return
    const now = new Date().toISOString()
    const additions = []
    const datesToDelete: string[] = []
    for (const d of eachDayOfInterval({ start: startOfMonth(m), end: endOfMonth(m) })) {
      const day = d.getDay()
      if (day < 1 || day > 5) continue
      const date = format(d, 'yyyy-MM-dd')
      const schedule = get(date)
      if (selectedWeekdays.has(day)) {
        if (!schedule) additions.push({ date, type: 'regular' as const, updatedAt: now })
      } else if (schedule?.type === 'regular') datesToDelete.push(date)
    }
    await applyRegularScheduleChanges(additions, datesToDelete)
  }

  function toggleWeekday(day: number) {
    setSelectedWeekdays(current => {
      const next = new Set(current)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  async function saveLocation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (locationBusy) return
    const form = e.currentTarget
    const nameInput = form.elements.namedItem('name')
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) {
      setLocationError('場所名を入力してください。')
      if (nameInput instanceof HTMLInputElement) nameInput.focus()
      return
    }

    setLocationBusy(true)
    setLocationError('')
    try {
      const resolved = await resolveLocationName(name)
      await db.transaction('rw', db.weatherLocations, db.weatherCache, async () => {
        await db.weatherLocations.put({ id: 'default', ...resolved })
        await db.weatherCache.clear()
      })
      setSetting(false)
    } catch (error) {
      setLocationError(
        error instanceof LocationNotFoundError
          ? '場所が見つかりませんでした。都道府県名または市区町村名で入力してください。'
          : '場所を確認できませんでした。通信状態を確認して、もう一度お試しください。',
      )
    } finally {
      setLocationBusy(false)
    }
  }

  const today = new Date()
  return <>
    <section>
      <small>利用予定・天気</small>
      <h1>カレンダー</h1>
      <p>日付を押すと、予定と天気を登録・変更できます。</p>
    </section>
    <button className="today" onClick={openLocationSettings}>
      <MapPin size={18}/>{location?.name ?? '利用場所未設定'}（天気設定）
    </button>
    <div className="controls">
      <button onClick={() => setM(addMonths(m, -1))} aria-label="前月"><ChevronLeft/></button>
      <b>{format(m, 'yyyy年 M月', { locale: ja })}</b>
      <button onClick={() => setM(addMonths(m, 1))} aria-label="翌月"><ChevronRight/></button>
    </div>
    <button className="today" onClick={() => setM(new Date())}><RotateCcw size={18}/>今月へ戻る</button>
    <div className="bulk-settings">
      <p className="bulk-title">通常利用の曜日を選ぶ</p>
      <div className="weekday-options" role="group" aria-label="通常利用で登録する曜日">
        {weekdays.map(({ value, label }) => {
          const selected = selectedWeekdays.has(value)
          return <button
            type="button"
            className={`weekday-option ${selected ? 'selected' : ''}`}
            aria-pressed={selected}
            onClick={() => toggleWeekday(value)}
            key={value}
          >{label}</button>
        })}
      </div>
      <button className="bulk" onClick={() => void bulk()} disabled={selectedWeekdays.size === 0}>
        <RefreshCw/>選んだ曜日でこの月を更新
      </button>
    </div>
    <p className="hint">選んでいない曜日の通常利用は解除します。休みなどの個別変更は残ります。</p>
    <div className="cal">
      <div className="week">{'日月火水木金土'.split('').map(x => <b key={x}>{x}</b>)}</div>
      <div className="days">
        {days.map(d => {
          const date = format(d, 'yyyy-MM-dd')
          const x = get(date)
          const w = display(date)
          return <button
            aria-label={`${format(d, 'M月d日')} ${x ? labels[x.type] : '予定なし'} ${weatherLabels[w]}`}
            className={`${!isSameMonth(d, m) ? 'off ' : ''}${x?.type ?? ''} ${isSameDay(d, today) ? 'is-today' : ''}`}
            onClick={() => open(date)}
            key={date}
          >
            <span>{format(d, 'd')}</span>
            {x && <small>{labels[x.type].replace('利用', '')}</small>}
            {w !== 'unset' && <i className={`weather-icon weather-${w}`} aria-label={weatherLabels[w]}>{weatherIcons[w]}</i>}
          </button>
        })}
      </div>
    </div>
    {sel && <div className="shade" onClick={() => setSel(null)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="予定を編集" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={() => setSel(null)} aria-label="閉じる"><X/></button>
        <p>{format(new Date(sel + 'T00:00:00'), 'M月d日（E）', { locale: ja })}</p>
        <h2>利用予定</h2>
        <div className="choices">
          {(Object.keys(labels) as VisitType[]).map(x => <button className={`choice ${x} ${type === x ? 'selected' : ''}`} onClick={() => setType(x)} key={x}>{labels[x]}</button>)}
        </div>
        <h2>天気</h2>
        <div className="weather-choices">
          {(Object.keys(weatherLabels) as Weather[]).map(x => <button className={weather === x ? 'selected' : ''} onClick={() => setWeather(x)} key={x}><span className={`weather-icon weather-${x}`}>{weatherIcons[x]}</span>{weatherLabels[x]}</button>)}
        </div>
        {(() => {
          const d = weatherData(getCached(sel))
          return d && <p className="weather-detail">最高：{d.temperatureMax ?? '—'}℃　最低：{d.temperatureMin ?? '—'}℃　降水確率：{d.precipitationProbability ?? '—'}％</p>
        })()}
        <button className="today" onClick={() => void refresh()} disabled={busy}><RefreshCw size={18}/>{busy ? '取得中…' : '天気を更新'}</button>
        {fetchMessage && <p className="weather-message" role="status">{fetchMessage}</p>}
        <button className="save" onClick={save}>この内容を保存</button>
      </div>
    </div>}
    {setting && <div className="shade" onClick={() => setSetting(false)}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="利用場所を設定" onSubmit={saveLocation} onClick={e => e.stopPropagation()}>
        <button className="close" type="button" onClick={() => setSetting(false)} aria-label="閉じる"><X/></button>
        <h2>利用場所・天気設定</h2>
        <p>場所名から天気予報の地点を設定します。都道府県名・市区町村名のどちらでも登録できます。</p>
        <label htmlFor="location-name">場所名</label>
        <input
          id="location-name"
          name="name"
          defaultValue={location?.name}
          placeholder="例：埼玉県、さいたま市見沼区"
          autoComplete="address-level2"
          aria-describedby={locationError ? 'location-error location-help' : 'location-help'}
          aria-invalid={locationError ? true : undefined}
          required
        />
        <p id="location-help" className="hint location-help">都道府県名または市区町村名を入力してください。</p>
        {locationError && <p id="location-error" className="weather-message location-error" role="alert">{locationError}</p>}
        <p className="hint">場所検索：国土地理院／天気：Open-Meteo。APIキーは不要です。</p>
        <button className="save" type="submit" disabled={locationBusy}>{locationBusy ? '場所を確認中…' : '利用場所を保存'}</button>
      </form>
    </div>}
  </>
}
