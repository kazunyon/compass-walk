import chestPressImage from '../../assets/strength-training/chest-press.jpg'
import hipAbductionImage from '../../assets/strength-training/hip-abduction.jpg'
import legExtensionImage from '../../assets/strength-training/leg-extension.jpg'
import legPressImage from '../../assets/strength-training/leg-press.jpg'
import rowingImage from '../../assets/strength-training/rowing.jpg'
import torsoFlexImage from '../../assets/strength-training/torso-flex.jpg'
import type { StrengthTrainingEntry, StrengthTrainingMachineId, StrengthTrainingMinutes } from '../../types'

export const strengthTrainingMinutes = [3, 4, 5, 6] as const

export const strengthTrainingMachines = [
  { id: 'leg-press', number: '①', label: '脚で押す', productName: 'コンパクト・レッグプレス', image: legPressImage },
  { id: 'hip-abduction', number: '②', label: '脚を開く・閉じる', productName: 'ヒップAB／ADD', image: hipAbductionImage },
  { id: 'leg-extension', number: '③', label: '膝の曲げ伸ばし', productName: 'レッグEXT／FLEX', image: legExtensionImage },
  { id: 'chest-press', number: '④', label: '腕で押す', productName: 'チェストプレス', image: chestPressImage },
  { id: 'torso-flex', number: '⑤', label: 'お腹・背中', productName: 'トーソFLEX', image: torsoFlexImage },
  { id: 'rowing', number: '⑥', label: '背中・腕を引く', productName: 'ローイングMF', image: rowingImage },
] as const satisfies readonly { id: StrengthTrainingMachineId, number: string, label: string, productName: string, image: string }[]

const machineIds = new Set<string>(strengthTrainingMachines.map(machine => machine.id))
const validMinutes = new Set<number>(strengthTrainingMinutes)

export function normalizeStrengthTraining(value: unknown): StrengthTrainingEntry[] {
  if (!Array.isArray(value)) return []
  const entries = value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const { machineId, minutes } = item as Partial<StrengthTrainingEntry>
    return typeof machineId === 'string' && machineIds.has(machineId) && typeof minutes === 'number' && validMinutes.has(minutes)
      ? [{ machineId: machineId as StrengthTrainingMachineId, minutes: minutes as StrengthTrainingMinutes }]
      : []
  })
  const latest = new Map(entries.map(entry => [entry.machineId, entry]))
  return strengthTrainingMachines.flatMap(machine => latest.get(machine.id) ?? [])
}

export const strengthTrainingTotal = (entries: StrengthTrainingEntry[] | undefined) =>
  (entries ?? []).reduce((total, entry) => total + entry.minutes, 0)

export function strengthTrainingText(entries: StrengthTrainingEntry[] | undefined) {
  const values = entries ?? []
  if (!values.length) return ''
  const details = values.map(entry => {
    const machine = strengthTrainingMachines.find(item => item.id === entry.machineId)
    return machine ? `${machine.number} ${machine.label} ${entry.minutes}分` : ''
  }).filter(Boolean)
  return `${details.join('、')}（合計${strengthTrainingTotal(values)}分）`
}
