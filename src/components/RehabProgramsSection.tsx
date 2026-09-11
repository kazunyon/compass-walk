import { ChevronDown, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { normalizeRehabPrograms, rehabPrograms, rehabProgramsTotal } from '../features/records/rehabPrograms'
import type { RehabProgramEntry, RehabProgramId } from '../types'

type Props = {
  value: RehabProgramEntry[]
  onChange: (value: RehabProgramEntry[]) => void
}

export function RehabProgramsSection({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const total = rehabProgramsTotal(value)
  const setMinutes = (programId: RehabProgramId, minutes?: number) => {
    onChange(normalizeRehabPrograms([
      ...value.filter(entry => entry.programId !== programId),
      ...(minutes === undefined ? [] : [{ programId, minutes }]),
    ]))
  }

  return <section className="record-section rehab-programs-section">
    <button className="rehab-programs-toggle" type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span><b>運動・療法</b><small>{value.length ? `${value.length}項目・合計${total}分` : '未選択'}</small></span>
      <ChevronDown className={open ? 'open' : ''} size={22} />
    </button>
    {!open && value.length > 0 ? <div className="rehab-programs-summary">{value.map(entry => {
      const program = rehabPrograms.find(item => item.id === entry.programId)
      return program ? <span key={entry.programId}>{program.label} {entry.minutes}分</span> : null
    })}</div> : null}
    {open ? <>
      <p className="rehab-programs-help">行った項目を選び、－／＋で時間を調整してください。</p>
      <div className="rehab-programs-grid">
        {rehabPrograms.map(program => {
          const selected = value.find(entry => entry.programId === program.id)
          return <article className={selected ? 'rehab-program-card selected' : 'rehab-program-card'} key={program.id}>
            <img src={program.image} alt={`${program.label}のイメージ`} loading="lazy" />
            <div className="rehab-program-name"><b>{program.label}</b>{'description' in program ? <small>{program.description}</small> : null}<small>{program.min}～{program.max}分</small></div>
            {selected ? <>
              <div className="rehab-program-stepper">
                <button type="button" aria-label={`${program.label}を1分減らす`} disabled={selected.minutes <= program.min} onClick={() => setMinutes(program.id, selected.minutes - 1)}><Minus size={18} /></button>
                <output aria-live="polite">{selected.minutes}<small>分</small></output>
                <button type="button" aria-label={`${program.label}を1分増やす`} disabled={selected.minutes >= program.max} onClick={() => setMinutes(program.id, selected.minutes + 1)}><Plus size={18} /></button>
              </div>
              <button className="rehab-program-remove" type="button" onClick={() => setMinutes(program.id)}>記録を解除</button>
            </> : <button className="rehab-program-start" type="button" onClick={() => setMinutes(program.id, program.min)}>記録する</button>}
          </article>
        })}
      </div>
      <p className="rehab-programs-image-note">写真は運動・療法を見分けるためのイメージです。</p>
    </> : null}
  </section>
}
