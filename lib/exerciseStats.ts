import type { Workout } from './types'

// ==================== สถิติรายท่า (Exercise Profile) ====================
// รวมข้อมูลของท่าเดียวจากประวัติ workouts ทั้งหมด เพื่อโชว์เป็น "โปรไฟล์" ของท่านั้นๆ

// สูตร Epley สำหรับประมาณ 1RM จากน้ำหนักและจำนวนครั้งที่ทำได้ — เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง
export function estimate1RM(weightKg: number, reps: number): number {
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

export interface SessionSummary {
  id: string
  date: string
  sets: number | null
  reps: number | null
  weightKg: number | null
  volumeKg: number
  estimated1RM: number | null
}

export interface ExerciseStats {
  exerciseName: string
  totalSessions: number
  totalVolumeKg: number
  averageWeightKg: number | null
  bestWeightKg: number | null
  bestWeightDate: string | null
  best1RM: number | null
  best1RMDate: string | null
  progressPoints: { date: string; label: string; oneRM: number }[]
  last10Sessions: SessionSummary[]
}

function shortLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// entries ควรเป็น workouts ที่กรอง exercise_name เดียวกันไว้แล้ว (type='strength')
// เรียงลำดับใหม่ภายในฟังก์ชันนี้เอง ไม่ต้องเรียงมาก่อน
export function computeExerciseStats(exerciseName: string, entries: Workout[]): ExerciseStats {
  const sorted = [...entries]
    .filter((w) => w.type === 'strength')
    .sort((a, b) => (a.performed_at === b.performed_at ? a.created_at.localeCompare(b.created_at) : a.performed_at < b.performed_at ? -1 : 1))

  const totalSessions = sorted.length
  let totalVolumeKg = 0
  let weightSum = 0
  let weightCount = 0
  let bestWeightKg: number | null = null
  let bestWeightDate: string | null = null
  let best1RM: number | null = null
  let best1RMDate: string | null = null
  const progressPoints: { date: string; label: string; oneRM: number }[] = []

  sorted.forEach((w) => {
    const vol = w.total_volume_kg ?? (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
    totalVolumeKg += vol

    if (w.weight_kg !== null) {
      weightSum += w.weight_kg
      weightCount += 1
      if (bestWeightKg === null || w.weight_kg > bestWeightKg) {
        bestWeightKg = w.weight_kg
        bestWeightDate = w.performed_at
      }
    }

    if (w.weight_kg !== null && w.reps) {
      const oneRM = estimate1RM(w.weight_kg, w.reps)
      progressPoints.push({ date: w.performed_at, label: shortLabel(w.performed_at), oneRM })
      if (best1RM === null || oneRM > best1RM) {
        best1RM = oneRM
        best1RMDate = w.performed_at
      }
    }
  })

  const last10Sessions: SessionSummary[] = [...sorted]
    .reverse()
    .slice(0, 10)
    .map((w) => ({
      id: w.id,
      date: w.performed_at,
      sets: w.sets,
      reps: w.reps,
      weightKg: w.weight_kg,
      volumeKg: w.total_volume_kg ?? (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0),
      estimated1RM: w.weight_kg !== null && w.reps ? estimate1RM(w.weight_kg, w.reps) : null,
    }))

  return {
    exerciseName,
    totalSessions,
    totalVolumeKg: Math.round(totalVolumeKg),
    averageWeightKg: weightCount > 0 ? Math.round((weightSum / weightCount) * 10) / 10 : null,
    bestWeightKg,
    bestWeightDate,
    best1RM,
    best1RMDate,
    progressPoints,
    last10Sessions,
  }
}
