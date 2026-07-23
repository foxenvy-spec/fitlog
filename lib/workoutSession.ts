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

// เซ็ตที่กด "เซ็ตนี้เสร็จแล้ว" ไปจริงๆ ระหว่างเทรน — เก็บ reps/น้ำหนักแยกทีละเซ็ต
// (ก่อนหน้านี้ session flow เก็บ reps/weight เป็นค่าเดียวใช้ซ้ำทุกเซ็ต ทำให้ข้อมูลไม่ตรงกับที่ทำจริง
// เช่น drop set หรือเซ็ตท้ายๆ ที่ reps ตกลง — ตอนนี้แต่ละเซ็ตที่กดเสร็จจะจำค่าจริงตอนกดไว้)
export interface SessionSet {
  reps: number
  weightKg: number
}

export interface SessionSetState {
  // เซ็ตที่ทำเสร็จแล้วจริงในเซสชันนี้ ทีละเซ็ต — ความยาว array คือจำนวนเซ็ตที่ทำ (แทน setsDone เดิม)
  setsLog: SessionSet[]
  // ค่า reps/น้ำหนักที่กำลังจะใช้กับ "เซ็ตถัดไป" ที่ยังไม่กดเสร็จ (draft ก่อนกด ✅)
  reps: number | null
  weightKg: number | null
  rpe: number | null
  logged: boolean
  // ผู้ใช้กด "ข้ามท่านี้" ไปแล้วในเซสชันนี้ — ต่างจาก logged=false เฉยๆ (แค่ยังไม่ถึงคิว)
  // ใช้แยกแยะว่าท่านี้ถูก "จบดูแล้ว" รอบนี้หรือยัง สำหรับตอนหาท่าถัดไปที่ยังไม่ถูกดู (ดู nextUnvisitedIndex)
  skipped: boolean
  // id ของแถวใน workouts ที่บันทึกไปแล้วสำหรับท่านี้ในเซสชันนี้ — ใช้เช็คว่าถ้ากดบันทึกซ้ำ
  // (เช่น กดย้อนกลับมาแก้ท่าที่ทำไปแล้วผ่าน progress chips) ต้อง UPDATE แถวเดิม ไม่ใช่ INSERT ซ้ำ
  workoutId: string | null
}

// ค่าเริ่มต้นของแต่ละท่าตอนเปิดเซสชัน — ใช้ค่าเป้าหมายจากโปรแกรมเป็นจุดตั้งต้น
// ที่ผู้ใช้ปรับได้ระหว่างเล่นจริง (ต่างจาก "log all today" ที่บันทึกค่าเป้าหมายตรงๆ โดยไม่ให้ปรับ)
export function initSessionSet(ex: ProgramExercise): SessionSetState {
  return {
    setsLog: [],
    reps: parseRangeToNumber(ex.target_reps),
    weightKg: ex.default_weight_kg,
    rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
    logged: false,
    skipped: false,
    workoutId: null,
  }
}

export interface LoggedWorkoutRow {
  id: string
  exercise_name: string
  rpe: number | null
}

export interface LoggedSetRow {
  workout_id: string
  set_number: number
  reps: number
  weight_kg: number
}

// สร้าง state เริ่มต้นของ "ทุกท่า" ในเซสชัน โดยดึงท่าที่บันทึกไปแล้ว "วันนี้" กลับมาด้วย
// (เดิมหน้า session เรียก initSessionSet เปล่าๆ ทุกครั้งที่โหลดหน้า ทำให้ถ้าปิดแอพ/รีเฟรช
// หลังบันทึกบางท่าไปแล้ว ระบบลืมว่าทำไปแล้ว ต้องมานับ/กดใหม่ตั้งแต่ต้น)
// loggedWorkouts/loggedSets มาจากตาราง workouts + workout_sets ของ "วันนี้" เท่านั้น
export function initSessionStates(
  exercises: ProgramExercise[],
  loggedWorkouts: LoggedWorkoutRow[],
  loggedSets: LoggedSetRow[]
): Record<string, SessionSetState> {
  const setsByWorkout = new Map<string, LoggedSetRow[]>()
  loggedSets.forEach((s) => {
    const arr = setsByWorkout.get(s.workout_id) ?? []
    arr.push(s)
    setsByWorkout.set(s.workout_id, arr)
  })

  // เผื่อกรณีแผนวันนี้มีชื่อท่าซ้ำกัน (เช่น superset เล่นท่าเดิม 2 ช่วง) — จับคู่ตามลำดับที่เจอ
  // ไม่ใช่ตามชื่อเฉยๆ เพื่อไม่ให้ท่าที่ซ้ำชื่อกันแย่งแถวเดียวกัน
  const byName = new Map<string, LoggedWorkoutRow[]>()
  loggedWorkouts.forEach((w) => {
    const arr = byName.get(w.exercise_name) ?? []
    arr.push(w)
    byName.set(w.exercise_name, arr)
  })

  return Object.fromEntries(
    exercises.map((ex) => {
      const match = byName.get(ex.exercise_name)?.shift()
      if (!match) return [ex.id, initSessionSet(ex)]

      const sets = (setsByWorkout.get(match.id) ?? [])
        .slice()
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => ({ reps: s.reps, weightKg: s.weight_kg }))
      const last = sets[sets.length - 1] ?? null

      const state: SessionSetState = {
        setsLog: sets,
        reps: last ? last.reps : parseRangeToNumber(ex.target_reps),
        weightKg: last ? last.weightKg : ex.default_weight_kg,
        rpe: match.rpe ?? rirToRpe(parseRangeToNumber(ex.target_rir)),
        logged: true,
        skipped: false,
        workoutId: match.id,
      }
      return [ex.id, state]
    })
  )
}

// หา index ท่าที่ควรเปิดขึ้นมาให้ตอนกลับเข้าเซสชัน — ท่าแรกที่ยังไม่ได้บันทึก
// ถ้าทำครบทุกท่าแล้ว ให้ชี้ไปท่าสุดท้าย (กันกรณี exercises ว่างเปล่าด้วย)
export function firstUnfinishedIndex(
  exercises: ProgramExercise[],
  states: Record<string, Pick<SessionSetState, 'logged'>>
): number {
  const idx = exercises.findIndex((ex) => !states[ex.id]?.logged)
  return idx === -1 ? Math.max(0, exercises.length - 1) : idx
}

// หาท่า "ถัดไป" ที่ยังไม่ถูกบันทึกหรือข้าม ไล่วนจาก currentIndex+1 กลับมาครบรอบ (wrap around)
// คืน null เมื่อทุกท่าถูกบันทึก/ข้ามไปหมดแล้วเท่านั้น — เพื่อไม่ให้เซสชันจบก่อนเวลาแค่เพราะ
// ผู้ใช้กดผ่าน progress chips ไปทำท่าที่อยู่ท้าย array ก่อน (ตำแหน่งใน array ไม่ได้แปลว่าคือท่าสุดท้ายที่เหลือ)
export function nextUnvisitedIndex(
  exercises: ProgramExercise[],
  states: Record<string, Pick<SessionSetState, 'logged' | 'skipped'>>,
  currentIndex: number
): number | null {
  const n = exercises.length
  for (let offset = 1; offset <= n; offset++) {
    const i = (currentIndex + offset) % n
    const s = states[exercises[i].id]
    if (!s?.logged && !s?.skipped) return i
  }
  return null
}

export interface SessionSummary {
  exerciseCount: number
  totalSets: number
  totalVolumeKg: number
}

// สรุปผลตอนจบเซสชัน จากท่าที่ถูกบันทึกแล้วเท่านั้น (ท่าที่ข้ามไม่นับ)
// volume รวมจากค่าจริงทีละเซ็ต (reps x weight ต่อเซ็ต) ไม่ใช่ setsDone * ค่าเดียวเหมือนเดิม
// เพื่อให้ตรงกับที่ทำจริงแม้ reps/น้ำหนักจะไม่เท่ากันทุกเซ็ต (เช่น drop set)
export function computeSessionSummary(logged: Pick<SessionSetState, 'setsLog'>[]): SessionSummary {
  return logged.reduce(
    (acc, s) => {
      const volume = s.setsLog.reduce((sum, set) => sum + set.reps * set.weightKg, 0)
      return {
        exerciseCount: acc.exerciseCount + 1,
        totalSets: acc.totalSets + s.setsLog.length,
        totalVolumeKg: acc.totalVolumeKg + volume,
      }
    },
    { exerciseCount: 0, totalSets: 0, totalVolumeKg: 0 }
  )
}

export interface SkippedExercise {
  id: string
  exerciseName: string
  muscleGroup: string | null
}

// ท่าที่อยู่ในแผนวันนี้แต่ไม่ได้ log เลย (กด "ข้าม" หรือออกจากเซสชันก่อนถึงคิว)
// ใช้โชว์สรุปตอนจบเซสชัน แยกจาก computeSessionSummary ที่นับเฉพาะท่าที่ทำจริง
export function getSkippedExercises(
  exercises: ProgramExercise[],
  states: Record<string, Pick<SessionSetState, 'logged'>>
): SkippedExercise[] {
  return exercises
    .filter((ex) => !states[ex.id]?.logged)
    .map((ex) => ({ id: ex.id, exerciseName: ex.exercise_name, muscleGroup: ex.muscle_group }))
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
