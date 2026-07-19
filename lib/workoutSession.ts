import type { ProgramExercise } from './types'
import { parseRangeToNumber, rirToRpe } from './importWorkoutExcel'

// แกะค่า "พัก" (free text เช่น "90s", "2-3 min", "1-2 นาที", "60") ให้เป็นวินาที
// เพื่อตั้งค่าเริ่มต้นให้ Rest Timer อัตโนมัติ — ไม่ต้องให้ผู้ใช้พิมพ์เอง
export function parseRestSeconds(raw: string | null, fallbackSec = 90): number {
  if (!raw) return fallbackSec
  const n = parseRangeToNumber(raw)
  if (n === null || n <= 0) return fallbackSec

  const isSeconds = /sec|วินาที/i.test(raw) || /\d\s*s\b/i.test(raw)
  // เช็ค "วินาที" (seconds) ก่อน "นาที" (minutes) เสมอ เพราะคำว่า "วินาที" มีคำว่า
  // "นาที" ซ้อนอยู่ข้างในเป็น substring — ถ้าเช็คนาทีก่อนจะจับคำว่าวินาทีผิดเป็นนาที
  const isMinutes = !isSeconds && /min|นาที/i.test(raw)

  if (isSeconds) return Math.round(n)
  if (isMinutes) return Math.round(n * 60)

  // ไม่มีหน่วยกำกับ — เดาจากขนาดตัวเลข: ตัวเลขเล็กๆ (<=10) มักหมายถึงนาที
  return Math.round(n <= 10 ? n * 60 : n)
}

export interface SessionSetState {
  setsDone: number
  reps: number | null
  weightKg: number | null
  rpe: number | null
  logged: boolean
}

// ค่าเริ่มต้นของแต่ละท่าตอนเปิดเซสชัน — ใช้ค่าเป้าหมายจากโปรแกรมเป็นจุดตั้งต้น
// ที่ผู้ใช้ปรับได้ระหว่างเล่นจริง (ต่างจาก "log all today" ที่บันทึกค่าเป้าหมายตรงๆ โดยไม่ให้ปรับ)
export function initSessionSet(ex: ProgramExercise): SessionSetState {
  return {
    setsDone: 0,
    reps: parseRangeToNumber(ex.target_reps),
    weightKg: ex.default_weight_kg,
    rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
    logged: false,
  }
}

export interface SessionSummary {
  exerciseCount: number
  totalSets: number
  totalVolumeKg: number
}

// สรุปผลตอนจบเซสชัน จากท่าที่ถูกบันทึกแล้วเท่านั้น (ท่าที่ข้ามไม่นับ)
export function computeSessionSummary(
  logged: Pick<SessionSetState, 'setsDone' | 'reps' | 'weightKg'>[]
): SessionSummary {
  return logged.reduce(
    (acc, s) => {
      const volume = s.setsDone && s.reps && s.weightKg ? s.setsDone * s.reps * s.weightKg : 0
      return {
        exerciseCount: acc.exerciseCount + 1,
        totalSets: acc.totalSets + s.setsDone,
        totalVolumeKg: acc.totalVolumeKg + volume,
      }
    },
    { exerciseCount: 0, totalSets: 0, totalVolumeKg: 0 }
  )
}

export interface MuscleLoadEntry {
  muscleGroup: string | null
  sets: number
  rpe: number | null
}

// รวม sets และหา RPE เฉลี่ย (ถ่วงน้ำหนักด้วยจำนวนเซ็ต) ต่อกลุ่มกล้ามเนื้อ จากท่าที่ log ในเซสชันนี้
// ใช้เป็น input ให้ computeSessionMuscleRecovery — ท่าที่ไม่มี muscle group หรือ 0 เซ็ตจะถูกข้าม
export function aggregateMuscleLoads(
  entries: MuscleLoadEntry[]
): Record<string, { sets: number; avgRpe: number | null }> {
  const totals: Record<string, { sets: number; rpeWeighted: number; rpeSets: number }> = {}

  entries.forEach(({ muscleGroup, sets, rpe }) => {
    if (!muscleGroup || sets <= 0) return
    const bucket = totals[muscleGroup] ?? { sets: 0, rpeWeighted: 0, rpeSets: 0 }
    bucket.sets += sets
    if (rpe !== null) {
      bucket.rpeWeighted += rpe * sets
      bucket.rpeSets += sets
    }
    totals[muscleGroup] = bucket
  })

  return Object.fromEntries(
    Object.entries(totals).map(([mg, t]) => [
      mg,
      { sets: t.sets, avgRpe: t.rpeSets > 0 ? Math.round((t.rpeWeighted / t.rpeSets) * 10) / 10 : null },
    ])
  )
}
