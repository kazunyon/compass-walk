import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { normalizeStrengthTraining, strengthTrainingMachines, strengthTrainingMinutes, strengthTrainingTotal } from '../features/records/strengthTraining'
import type { StrengthTrainingEntry, StrengthTrainingMachineId, StrengthTrainingMinutes } from '../types'

type Props = {
  value: StrengthTrainingEntry[]
  onChange: (value: StrengthTrainingEntry[]) => void
}

export function StrengthTrainingSection({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const total = strengthTrainingTotal(value)
  const selectMinutes = (machineId: StrengthTrainingMachineId, minutes: StrengthTrainingMinutes) => {
    const selected = value.find(entry => entry.machineId === machineId)
    onChange(normalizeStrengthTraining(selected?.minutes === minutes
      ? value.filter(entry => entry.machineId !== machineId)
      : [...value.filter(entry => entry.machineId !== machineId), { machineId, minutes }]))
  }

  return <section className="record-section strength-training-section">
    <button className="strength-training-toggle" type="button" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span><b>筋トレ</b><small>{value.length ? `${value.length}台・合計${total}分` : '未選択'}</small></span>
      <ChevronDown className={open ? 'open' : ''} size={22} />
    </button>
    {!open && value.length > 0 ? <div className="strength-training-summary">{value.map(entry => {
      const machine = strengthTrainingMachines.find(item => item.id === entry.machineId)
      return machine ? <span key={entry.machineId}>{machine.number} {entry.minutes}分</span> : null
    })}</div> : null}
    {open ? <>
      <p className="strength-training-help">行った機器の時間を選んでください。もう一度押すと解除できます。</p>
      <div className="strength-training-grid">
        {strengthTrainingMachines.map(machine => {
          const selected = value.find(entry => entry.machineId === machine.id)
          return <article className={selected ? 'strength-training-card selected' : 'strength-training-card'} key={machine.id}>
            <img src={machine.image} alt={`${machine.label}筋トレ機器のイメージ`} loading="lazy" />
            <div className="strength-training-name"><b>{machine.number} {machine.label}</b><small>{machine.productName}</small></div>
            <div className="strength-training-times" aria-label={`${machine.label}の時間`}>
              {strengthTrainingMinutes.map(minutes => <button
                type="button"
                aria-pressed={selected?.minutes === minutes}
                className={selected?.minutes === minutes ? 'selected' : ''}
                onClick={() => selectMinutes(machine.id, minutes)}
                key={minutes}
              >{minutes}分</button>)}
            </div>
          </article>
        })}
      </div>
      <p className="strength-training-image-note">写真は機器を見分けるためのイメージです。</p>
    </> : null}
  </section>
}
