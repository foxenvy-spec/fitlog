import type { ExerciseDef, Equipment } from './exerciseLibrary'
import type { MuscleGroup } from './muscle-groups'
import { makeAdhocExercise } from './workoutSession'
import type { ProgramExercise } from './types'

// ==================================================================
// Rule-based workout generator — เลือกท่าจากคลังท่าที่มีอยู่แล้วตามกลุ่มกล้ามเนื้อ
// ไม่เรียก AI ภายนอก (ต่างจาก ai-coach-insight ที่เรียก Gemini) — ทำงานทันที ฟรี
// การันตีว่าใช้ได้เสมอแม้ไม่มี GEMINI_API_KEY หรือโควต้าหมด
// ตั้งใจให้เป็น "baseline" ที่ทำงานได้ด้วยตัวเองก่อน — ค่อยพิจารณาเพิ่ม AI ปรุงแต่งทับเป็น phase ถัดไป
// ==================================================================

const DEFAULT_EXERCISE_COUNT = 4
const DEFAULT_SETS = 3
const DEFAULT_TARGET_REPS = '8-12'
const DEFAULT_REST = '90s'

// ให้น้ำหนักเรียงลำดับอุปกรณ์ที่อยาก "เจอก่อน" ในโปรแกรมที่ generate — ท่าเครื่อง/บาร์เบลใหญ่ๆ
// (มักเป็นท่า compound) มาก่อน ท่าเคเบิล/ดัมเบล/น้ำหนักตัว (มักเป็นท่า isolation) ไว้ท้ายๆ
// เพื่อให้โปรแกรมที่ได้มีจังหวะ compound-first แบบเดียวกับที่โปรแกรมเทรนทั่วไปนิยมทำ
const EQUIPMENT_PRIORITY: Record<Equipment, number> = {
  'บาร์เบล': 0,
  'เครื่อง': 1,
  'เคเบิล': 2,
  'ดัมเบล': 3,
  'คีทเทิลเบล': 4,
  'น้ำหนักตัว': 5,
}

export interface GeneratedExercise {
  exerciseDef: ExerciseDef
  sets: number
  targetReps: string
  rest: string
  // เหตุผลที่เลือกท่านี้ — มีเฉพาะเวอร์ชันที่ Gemini ปรุงแต่งทับ (source: 'ai') เท่านั้น
  rationale?: string
}

export interface GeneratedWorkout {
  muscleGroup: MuscleGroup
  exercises: GeneratedExercise[]
  // 'rule' = สุ่ม/เลือกจากคลังท่าล้วนๆ (ฟรี, ทันที) — 'ai' = Gemini เลือก/เรียงทับรายการ rule-based เดิม
  source: 'rule' | 'ai'
}

// สับลำดับแบบ Fisher-Yates — ใช้สุ่มเลือกท่าภายในกลุ่มอุปกรณ์เดียวกัน (กันไม่ให้ได้โปรแกรมเดิมทุกครั้ง)
function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// สร้างโปรแกรมท่าสำหรับกล้ามเนื้อกลุ่มหนึ่ง — เลือกจากคลังท่าที่มี muscleGroup ตรงกัน
// เรียงตามอุปกรณ์ (compound ก่อน isolation) แล้วสุ่มภายในกลุ่มอุปกรณ์เดียวกันเพื่อความหลากหลาย
// avoidNames: ชื่อท่าที่เพิ่งเล่นไปเมื่อเร็วๆ นี้ (เช่น เซสชันล่าสุด) — พยายามเลี่ยงก่อน ถ้าเลี่ยงแล้ว
// ท่าไม่พอ (คลังท่ากลุ่มนั้นมีน้อย) จะยอมใช้ท่าที่เพิ่งเล่นไปซ้ำได้ ดีกว่าคืนโปรแกรมที่มีท่าไม่ครบ
export function generateWorkoutForMuscle(
  muscleGroup: MuscleGroup,
  exercises: ExerciseDef[],
  opts: { count?: number; avoidNames?: string[] } = {}
): GeneratedWorkout {
  const count = opts.count ?? DEFAULT_EXERCISE_COUNT
  const avoid = new Set((opts.avoidNames ?? []).map((n) => n.trim().toLowerCase()))

  const candidates = exercises.filter((ex) => ex.muscleGroup === muscleGroup)

  const byEquipmentGroup = new Map<Equipment, ExerciseDef[]>()
  candidates.forEach((ex) => {
    const arr = byEquipmentGroup.get(ex.equipment) ?? []
    arr.push(ex)
    byEquipmentGroup.set(ex.equipment, arr)
  })

  const orderedEquipments = Array.from(byEquipmentGroup.keys()).sort(
    (a, b) => (EQUIPMENT_PRIORITY[a] ?? 99) - (EQUIPMENT_PRIORITY[b] ?? 99)
  )

  // เรียงท่าทั้งหมด: กลุ่มอุปกรณ์ compound ก่อน, สุ่มลำดับภายในกลุ่มอุปกรณ์เดียวกัน
  const sortedCandidates = orderedEquipments.flatMap((eq) => shuffle(byEquipmentGroup.get(eq) ?? []))

  // รอบแรก: เลี่ยงท่าที่เพิ่งเล่นไป + เลี่ยงชื่อซ้ำ
  const picked: ExerciseDef[] = []
  const pickedNames = new Set<string>()
  for (const ex of sortedCandidates) {
    if (picked.length >= count) break
    const key = ex.name.trim().toLowerCase()
    if (pickedNames.has(key)) continue
    if (avoid.has(key)) continue
    picked.push(ex)
    pickedNames.add(key)
  }

  // รอบสอง: ถ้ายังไม่ครบ (คลังท่ากลุ่มนี้มีน้อย หรือ avoid list กว้างเกินไป) เติมจากท่าที่เหลือ
  if (picked.length < count) {
    for (const ex of sortedCandidates) {
      if (picked.length >= count) break
      const key = ex.name.trim().toLowerCase()
      if (pickedNames.has(key)) continue
      picked.push(ex)
      pickedNames.add(key)
    }
  }

  return {
    muscleGroup,
    source: 'rule',
    exercises: picked.map((exerciseDef) => ({
      exerciseDef,
      sets: DEFAULT_SETS,
      targetReps: DEFAULT_TARGET_REPS,
      rest: DEFAULT_REST,
    })),
  }
}

// สลับท่าเดียวในโปรแกรมที่มีอยู่แล้ว — ใช้ตอนผู้ใช้เจอท่าที่เล่นไม่ได้ (เช่น ยิมไม่มีอุปกรณ์นี้) โดยไม่ต้อง
// โละทั้งโปรแกรมทิ้งแบบสุ่มใหม่หมด (ต่างจาก generateWorkoutForMuscle ที่สุ่มใหม่ทั้งชุด) —
// เลี่ยงท่าที่อยู่ในโปรแกรมเดิมอยู่แล้วทุกท่า (กันสลับแล้วซ้ำกับท่าอื่นในโปรแกรมเดียวกัน)
// ถ้าคลังท่าของกล้ามเนื้อนี้ไม่มีท่าอื่นเหลือแล้ว (exhausted) คืนค่า null ให้ฝั่ง UI แจ้งผู้ใช้แทน
// ไม่สุ่มคืนท่าซ้ำแบบเงียบๆ
export function swapExerciseAt(
  workout: GeneratedWorkout,
  index: number,
  exercises: ExerciseDef[]
): GeneratedWorkout | null {
  const current = workout.exercises[index]
  if (!current) return null

  const usedNames = new Set(workout.exercises.map((g) => g.exerciseDef.name.trim().toLowerCase()))

  const candidates = exercises.filter(
    (ex) => ex.muscleGroup === workout.muscleGroup && !usedNames.has(ex.name.trim().toLowerCase())
  )
  if (candidates.length === 0) return null

  const replacement = candidates[Math.floor(Math.random() * candidates.length)]

  const nextExercises = workout.exercises.slice()
  nextExercises[index] = {
    ...current,
    exerciseDef: replacement,
    // เอา rationale เดิมออก เพราะเป็นเหตุผลที่ Gemini ให้ไว้สำหรับท่าเก่า ไม่ใช่ท่าใหม่นี้
    rationale: undefined,
  }

  return { ...workout, exercises: nextExercises }
}

// รายชื่อท่า+อุปกรณ์ของกล้ามเนื้อกลุ่มนี้ทั้งหมด — ส่งให้ /api/generate-workout เป็น "รายการท่าที่เลือกได้"
// (ส่งกว้างกว่าที่ rule-based เลือกไว้ตอนแรก เพื่อให้ Gemini มีตัวเลือกมากพอจะปรุงแต่งได้จริง)
export function candidateExercisesForMuscle(
  muscleGroup: MuscleGroup,
  exercises: ExerciseDef[]
): { name: string; equipment: Equipment }[] {
  return exercises
    .filter((ex) => ex.muscleGroup === muscleGroup)
    .map((ex) => ({ name: ex.name, equipment: ex.equipment }))
}

// แปลงผลลัพธ์ที่ /api/generate-workout ตรวจสอบมาแล้ว (ชื่อท่าตรงกับ candidates เป๊ะเสมอ — ดู
// route.ts ฝั่ง server) กลับเป็น GeneratedWorkout — หาท่าจาก exercise library ด้วยชื่อเดียวกัน
// ถ้าหาไม่เจอ (ไม่ควรเกิดขึ้นเพราะ server validate แล้ว แต่กันเหนียวไว้) ข้ามท่านั้นไปเงียบๆ
export function mapAiExercisesToWorkout(
  muscleGroup: MuscleGroup,
  aiExercises: { name: string; rationale: string }[],
  exercises: ExerciseDef[]
): GeneratedWorkout {
  const byName = new Map(exercises.map((ex) => [ex.name, ex]))
  const mapped: GeneratedExercise[] = []
  aiExercises.forEach((a) => {
    const exerciseDef = byName.get(a.name)
    if (!exerciseDef) return
    mapped.push({
      exerciseDef,
      sets: DEFAULT_SETS,
      targetReps: DEFAULT_TARGET_REPS,
      rest: DEFAULT_REST,
      rationale: a.rationale || undefined,
    })
  })
  return { muscleGroup, source: 'ai', exercises: mapped }
}

// แปลง GeneratedWorkout เป็น ProgramExercise[] แบบ adhoc (ไม่ผูกกับ program_exercises จริงในฐานข้อมูล)
// ใช้ id ขึ้นต้นด้วย "gen-" (ผ่าน makeAdhocExercise เติม "adhoc:" ให้อีกชั้น) เพื่อไม่ให้ชนกับ
// adhoc exercise อื่นที่มาจาก "เพิ่มท่าเอง" ระหว่างเซสชัน (ใช้ workout id จริงเป็น id)
export function toAdhocProgramExercises(workout: GeneratedWorkout): ProgramExercise[] {
  return workout.exercises.map((g, i) =>
    makeAdhocExercise({
      id: `gen-${workout.source}-${i}-${g.exerciseDef.id}`,
      exerciseName: g.exerciseDef.name,
      muscleGroup: workout.muscleGroup,
      position: i,
      sets: g.sets,
      targetReps: g.targetReps,
      rest: g.rest,
      rationale: g.rationale || 'สร้างอัตโนมัติจาก AI Coach (rule-based)',
    })
  )
}
