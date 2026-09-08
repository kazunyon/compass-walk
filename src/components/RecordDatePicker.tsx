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
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import db from '../db'

type Props = {
  value: string
  onChange: (date: string) => void
}

const asLocalDate = (value: string) => new Date(`${value}T00:00:00`)

export function RecordDatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => asLocalDate(value))
  const rootRef = useRef<HTMLDivElement>(null)
  const monthKey = format(month, 'yyyy-MM')
  const schedules = useLiveQuery(
    () => db.schedules.filter(item => item != null && typeof item.date === 'string' && item.date.startsWith(monthKey)).toArray(),
    [monthKey],
  ) ?? []
  const regularDates = new Set(schedules.filter(item => item.type === 'regular').map(item => item.date))
  const start = startOfWeek(startOfMonth(month))
  const end = addDays(endOfMonth(month), 6 - endOfMonth(month).getDay())
  const days = eachDayOfInterval({ start, end })
  const selected = asLocalDate(value)
  const today = new Date()

  useEffect(() => {
    setMonth(asLocalDate(value))
  }, [value])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="record-date-picker" ref={rootRef}>
    <button
      type="button"
      className="record-date-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`利用日 ${format(selected, 'yyyy年M月d日')}`}
      onClick={() => setOpen(current => !current)}
    >
      <span>{format(selected, 'yyyy/MM/dd')}</span>
      <CalendarDays size={18}/>
    </button>
    {open && <div className="record-date-popover" role="dialog" aria-label="利用日を選択">
      <div className="record-date-month">
        <b>{format(month, 'yyyy年 M月', { locale: ja })}</b>
        <div>
          <button type="button" onClick={() => setMonth(current => addMonths(current, -1))} aria-label="前月"><ChevronLeft size={20}/></button>
          <button type="button" onClick={() => setMonth(current => addMonths(current, 1))} aria-label="翌月"><ChevronRight size={20}/></button>
        </div>
      </div>
      <div className="record-date-week">{'日月火水木金土'.split('').map(day => <b key={day}>{day}</b>)}</div>
      <div className="record-date-days">
        {days.map(day => {
          const date = format(day, 'yyyy-MM-dd')
          const regular = regularDates.has(date)
          return <button
            type="button"
            key={date}
            className={`${!isSameMonth(day, month) ? 'off ' : ''}${regular ? 'regular ' : ''}${isSameDay(day, selected) ? 'selected ' : ''}${isSameDay(day, today) ? 'is-today' : ''}`}
            aria-label={`${format(day, 'M月d日')}${regular ? ' 通常利用' : ''}${isSameDay(day, selected) ? ' 選択中' : ''}`}
            aria-pressed={isSameDay(day, selected)}
            onClick={() => {
              onChange(date)
              setOpen(false)
            }}
          >
            <span>{format(day, 'd')}</span>
            {regular && <small>通常</small>}
          </button>
        })}
      </div>
      <p className="record-date-legend"><span/>通常予定</p>
    </div>}
  </div>
}
