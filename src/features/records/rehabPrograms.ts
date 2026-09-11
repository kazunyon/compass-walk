import exerciseBikeImage from '../../assets/rehab-programs/exercise-bike.jpg'
import hotPackImage from '../../assets/rehab-programs/hot-pack.jpg'
import parallelBarsImage from '../../assets/rehab-programs/parallel-bars.jpg'
import stairTrainingImage from '../../assets/rehab-programs/stair-training.jpg'
import upperLimbPulleyImage from '../../assets/rehab-programs/upper-limb-pulley.jpg'
import type { RehabProgramEntry, RehabProgramId } from '../../types'

export const rehabPrograms = [
  { id: 'exercise-bike', label: '自転車運動', min: 5, max: 10, image: exerciseBikeImage, exercise: '自転車' },
  { id: 'parallel-bars', label: '平行棒歩行', min: 5, max: 8, image: parallelBarsImage, exercise: '歩行練習' },
  { id: 'stair-training', label: '階段昇降訓練', min: 5, max: 10, image: stairTrainingImage, exercise: '歩行練習' },
  { id: 'hot-pack', label: '温熱療法（ホットパック）', min: 10, max: 20, image: hotPackImage },
  { id: 'upper-limb-pulley', label: '上肢プーリー', description: 'ひもを左右交互に引く', min: 3, max: 6, image: upperLimbPulleyImage, exercise: '筋力トレーニング' },
] as const satisfies readonly { id: RehabProgramId, label: string, description?: string, min: number, max: number, image: string, exercise?: string }[]

export function normalizeRehabPrograms(value: unknown): RehabProgramEntry[] {
  if (!Array.isArray(value)) return []
  const entries = new Map<RehabProgramId, RehabProgramEntry>()
  value.forEach(item => {
    if (!item || typeof item !== 'object') return
    const { programId, minutes } = item as Partial<RehabProgramEntry>
    const program = rehabPrograms.find(candidate => candidate.id === programId)
    if (program && typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= program.min && minutes <= program.max) {
      entries.set(program.id, { programId: program.id, minutes })
    }
  })
  return rehabPrograms.flatMap(program => entries.get(program.id) ?? [])
}

export const rehabProgramsTotal = (entries: RehabProgramEntry[] | undefined) =>
  (entries ?? []).reduce((total, entry) => total + entry.minutes, 0)

export function rehabProgramsText(entries: RehabProgramEntry[] | undefined) {
  const values = entries ?? []
  if (!values.length) return ''
  const details = values.map(entry => {
    const program = rehabPrograms.find(item => item.id === entry.programId)
    return program ? `${program.label} ${entry.minutes}分` : ''
  }).filter(Boolean)
  return `${details.join('、')}（合計${rehabProgramsTotal(values)}分）`
}
