import type { Workout } from './types'

// volume ของ workout หนึ่งแถว — ใช้ total_volume_kg ถ้ามี (แม่นยำกว่าเพราะรวมจากทีละเซ็ตจริง)
// ไม่งั้น fallback ไปคูณ sets*reps*weight_kg (สำหรับแถวเก่าที่ยังไม่มี total_volume_kg)
export function workoutVolumeKg(w: Workout): number {
  return w.total_volume_kg ?? (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

export interface DaySummary {
  exerciseCount: number
  totalSets: number
  totalVolumeKg: number
  muscleGroups: string[]
  durationMin: number | null
}

// สรุปภาพรวมของวันหนึ่งๆ — โชว์ก่อนเห็นรายการละเอียด จะได้รู้ทันทีว่าวันนั้นหนักแค่ไหน
export function computeDaySummary(dayWorkouts: Workout[]): DaySummary {
  const strength = dayWorkouts.filter((w) => w.type === 'strength')
  const totalSets = strength.reduce((s, w) => s + (w.sets ?? 0), 0)
  const totalVolumeKg = strength.reduce((s, w) => s + workoutVolumeKg(w), 0)
  const muscleGroups = Array.from(new Set(strength.map((w) => w.muscle_group).filter((m): m is string => !!m)))

  // ไม่มีฟิลด์ duration ต่อวันเก็บตรงๆ — ประมาณจากช่วงเวลา created_at แรกสุดถึงล่าสุดของวันนั้น
  // (ใกล้เคียงเวลาที่ใช้ในเซสชันจริง เพราะแต่ละท่าถูกบันทึกทันทีตอนกดเสร็จระหว่างเทรน)
  const timestamps = dayWorkouts.map((w) => new Date(w.created_at).getTime()).filter((t) => !Number.isNaN(t))
  const durationMin =
    timestamps.length >= 2 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : null

  return { exerciseCount: dayWorkouts.length, totalSets, totalVolumeKg, muscleGroups, durationMin }
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export type ExerciseProgress =
  | { kind: 'pr'; deltaKg: number }
  | { kind: 'bestVolume' }
  | { kind: 'up'; deltaKg: number }
  | { kind: 'down'; deltaKg: number }
  | { kind: 'none' }

// เทียบท่านี้กับประวัติก่อนหน้า (ไม่รวมวันเดียวกัน) — ใช้บอกว่าเปิดย้อนมาดูวันนี้แล้ว "หนักกว่าเดิม" แค่ไหน
// priorPool ควรเป็น workouts ประเภท strength ของ exercise ต่างๆ ย้อนหลังพอสมควร (ยิ่งยาวยิ่งแม่น สำหรับเช็ค PR)
export function computeExerciseProgress(w: Workout, priorPool: Workout[]): ExerciseProgress {
  if (w.type !== 'strength' || !w.exercise_name) return { kind: 'none' }
  const prior = priorPool.filter(
    (p) => p.type === 'strength' && p.exercise_name === w.exercise_name && p.performed_at < w.performed_at
  )
  if (prior.length === 0) return { kind: 'none' }

  const thisWeight = w.weight_kg ?? 0
  const thisVolume = workoutVolumeKg(w)
  const prevBestWeight = Math.max(...prior.map((p) => p.weight_kg ?? 0))
  const prevBestVolume = Math.max(...prior.map(workoutVolumeKg))

  if (thisWeight > 0 && thisWeight > prevBestWeight) {
    return { kind: 'pr', deltaKg: Math.round((thisWeight - prevBestWeight) * 10) / 10 }
  }
  if (thisVolume > 0 && thisVolume > prevBestVolume) {
    return { kind: 'bestVolume' }
  }

  // ไม่ใช่สถิติใหม่ — เทียบกับครั้งล่าสุดก่อนหน้าแทน เพื่อโชว์แนวโน้มระยะสั้น
  const lastSession = prior.reduce((a, b) => (a.performed_at > b.performed_at ? a : b))
  const lastWeight = lastSession.weight_kg ?? 0
  if (thisWeight > lastWeight) return { kind: 'up', deltaKg: Math.round((thisWeight - lastWeight) * 10) / 10 }
  if (thisWeight < lastWeight) return { kind: 'down', deltaKg: Math.round((lastWeight - thisWeight) * 10) / 10 }
  return { kind: 'none' }
}
