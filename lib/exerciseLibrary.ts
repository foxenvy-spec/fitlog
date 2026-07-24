import { createClient } from './supabase/client'
import type { MuscleGroup } from './muscle-groups'

// อุปกรณ์เป็น free text ในตาราง exercise_library (ไม่ได้ล็อกด้วย check constraint)
// เก็บ union นี้ไว้เผื่ออยากใช้ช่วย autocomplete ตอนเพิ่มท่า custom ในอนาคต
export type Equipment = 'บาร์เบล' | 'ดัมเบล' | 'เครื่อง' | 'เคเบิล' | 'น้ำหนักตัว' | 'คีทเทิลเบล'

// รายการอุปกรณ์ทั้งหมดตามลำดับที่อยากให้แสดงในตัวกรอง (เช่น ExercisePicker) — เรียงจากที่ใช้บ่อยสุดไปน้อยสุด
export const EQUIPMENTS: Equipment[] = ['บาร์เบล', 'ดัมเบล', 'เครื่อง', 'เคเบิล', 'น้ำหนักตัว', 'คีทเทิลเบล']

// ป้ายชื่ออุปกรณ์ภาษาอังกฤษ — ใช้แสดงผล UI เท่านั้น ค่าที่เก็บใน DB ยังเป็นภาษาไทยเหมือนเดิม
// (ส่วนใหญ่ค่าไทยเป็นแค่คำทับศัพท์ เช่น บาร์เบล/ดัมเบล/เคเบิล/คีทเทิลเบล อยู่แล้ว)
const EQUIPMENT_LABELS_EN: Record<Equipment, string> = {
  'บาร์เบล': 'Barbell',
  'ดัมเบล': 'Dumbbell',
  'เครื่อง': 'Machine',
  'เคเบิล': 'Cable',
  'น้ำหนักตัว': 'Bodyweight',
  'คีทเทิลเบล': 'Kettlebell',
}

export function equipmentLabel(equipment: Equipment): string {
  return EQUIPMENT_LABELS_EN[equipment] ?? equipment
}

export interface ExerciseDef {
  id: string
  name: string
  nameTh: string
  muscleGroup: MuscleGroup
  secondaryMuscles: MuscleGroup[]
  equipment: Equipment
  icon: string
  aliases: string[]
  instructions: string[]
  imageUrl: string | null
  // slug ตามไลบรารี react-body-highlighter (เช่น 'chest', 'triceps', 'front-deltoids')
  // ใช้ render ไดอะแกรมคนไฮไลต์กล้ามเนื้อ — ละเอียดกว่า muscleGroup/secondaryMuscles ที่เป็นกลุ่มใหญ่ภาษาไทย
  highlighterMuscles: string[]
}

// แถวดิบตามคอลัมน์ในตาราง public.exercise_library (ดู supabase/migrations/007_exercise_library.sql)
interface ExerciseLibraryRow {
  id: string
  name: string
  name_th: string
  aliases: string[] | null
  primary_muscle: string
  secondary_muscles: string[] | null
  equipment: string
  icon: string | null
  instructions: string[] | null
  image_url: string | null
  highlighter_muscles: string[] | null
}

function mapRow(row: ExerciseLibraryRow): ExerciseDef {
  return {
    id: row.id,
    name: row.name,
    nameTh: row.name_th,
    muscleGroup: row.primary_muscle as MuscleGroup,
    secondaryMuscles: (row.secondary_muscles ?? []) as MuscleGroup[],
    equipment: row.equipment as Equipment,
    icon: row.icon ?? '🏋️',
    aliases: row.aliases ?? [],
    instructions: row.instructions ?? [],
    imageUrl: row.image_url ?? null,
    highlighterMuscles: row.highlighter_muscles ?? [],
  }
}

// ดึงท่าออกกำลังกายทั้งหมดจาก Library (ท่ามาตรฐาน is_custom=false ทุกคนอ่านได้ตาม RLS
// + ท่า custom ของผู้ใช้คนนั้นเอง ถ้ามี) เรียงตามชื่ออังกฤษเพื่อผลลัพธ์ที่นิ่ง
export async function fetchExerciseLibrary(): Promise<ExerciseDef[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('exercise_library').select('*').order('name')
  if (error) throw error
  return ((data ?? []) as ExerciseLibraryRow[]).map(mapRow)
}

// แคชแบบ shared promise — เรียกกี่ครั้งในหน้าเดียวกันก็ยิง query แค่ครั้งเดียว
// (react-query เองก็ dedupe ให้อยู่แล้วถ้าใช้ queryKey เดียวกัน แต่กันไว้เผื่อมีที่เรียกตรงๆ นอก React ด้วย)
let cachedPromise: Promise<ExerciseDef[]> | null = null

export function getExerciseLibrary(): Promise<ExerciseDef[]> {
  if (!cachedPromise) {
    cachedPromise = fetchExerciseLibrary().catch((err) => {
      cachedPromise = null // ให้ลองใหม่ได้ถ้าล้มเหลว แทนที่จะแคช error ค้างไว้ตลอด
      throw err
    })
  }
  return cachedPromise
}

// ล้างแคช — ใช้ตอน sign out หรือถ้าต้องการบังคับ refetch (เช่น หลังเพิ่มท่า custom ใหม่)
export function invalidateExerciseLibraryCache() {
  cachedPromise = null
}
