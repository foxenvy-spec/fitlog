export const MUSCLE_GROUPS = [
  'อก',
  'หลัง',
  'ขา',
  'ไหล่',
  'แขน',
  'แกนกลางลำตัว',
  'ทั้งตัว',
  'อื่นๆ',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  'อก': '#C1503A',
  'หลัง': '#6C8CA8',
  'ขา': '#E8A33D',
  'ไหล่': '#8B7FC7',
  'แขน': '#5FA88C',
  'แกนกลางลำตัว': '#C77FA8',
  'ทั้งตัว': '#B0A088',
  'อื่นๆ': '#9498A0',
}

// กลุ่มกล้ามเนื้อหลักที่ใช้เทียบวอลุ่มรายสัปดาห์ (ไม่รวม 'ทั้งตัว'/'อื่นๆ' ซึ่งกำกวมเกินกว่าจะเทียบได้ตรงๆ)
export const VOLUME_MUSCLES = ['อก', 'หลัง', 'ขา', 'ไหล่', 'แขน', 'แกนกลางลำตัว'] as const

// กลุ่มกล้ามเนื้อที่ใช้ติดตาม "recovery" (ไม่รวมแกนกลางลำตัว — ไม่ได้ติดตามความล้าแบบเดียวกัน)
export const RECOVERY_MUSCLES = ['อก', 'หลัง', 'ขา', 'ไหล่', 'แขน'] as const

// ป้ายชื่อภาษาอังกฤษ — สำหรับตอนแสดงผล UI เท่านั้น (ไม่ใช่ค่าที่เก็บใน DB
// ซึ่งยังเป็นภาษาไทยเหมือนเดิมทุกที่ เพื่อไม่กระทบข้อมูลเก่าที่บันทึกไว้แล้ว)
export const MUSCLE_GROUP_LABELS_EN: Record<MuscleGroup, string> = {
  'อก': 'Chest',
  'หลัง': 'Back',
  'ขา': 'Legs',
  'ไหล่': 'Shoulders',
  'แขน': 'Arms',
  'แกนกลางลำตัว': 'Core',
  'ทั้งตัว': 'Full Body',
  'อื่นๆ': 'Other',
}

export type MuscleLabelLang = 'th' | 'en'

// คืนป้ายชื่อกลุ่มกล้ามเนื้อตามภาษาที่เลือก ใช้แทนการอ้าง mg ตรงๆ ในจุดที่โชว์ผู้ใช้
export function muscleGroupLabel(mg: MuscleGroup, lang: MuscleLabelLang): string {
  return lang === 'en' ? MUSCLE_GROUP_LABELS_EN[mg] : mg
}

// ============================================================
// เดากล้ามเนื้อมัดรอง (secondary muscles) จากชื่อท่า — ใช้เป็น fallback
// ตอนที่ท่านั้นจับคู่กับ Exercise Library ไม่ได้ หรือจับคู่ได้แต่ยังไม่มีใครกรอก
// secondary_muscles ไว้ในฐานข้อมูล เพื่อไม่ให้ผู้ใช้เห็นแต่มัดหลักเปล่าๆ
// หมายเหตุ: เป็นการเดาแบบคร่าวๆ จากรูปแบบท่าออกกำลังกายทั่วไป ไม่ใช่ค่าที่แม่นยำ 100%
// ถ้ามีข้อมูลจริงจาก Exercise Library (มัดรองที่ผู้ใช้/แอดมินกรอกไว้) ให้ใช้ค่านั้นก่อนเสมอ
// ============================================================

interface SecondaryMuscleRule {
  keywords: RegExp
  secondary: MuscleGroup[]
}

// เรียงจากเฉพาะเจาะจง → กว้าง เพราะจะหยุดที่กฎแรกที่ match
const SECONDARY_MUSCLE_RULES: SecondaryMuscleRule[] = [
  // ท่า isolation ที่แทบไม่มีมัดรอง — เช็คก่อนกฎกว้างๆ ด้านล่าง (เช่น "leg curl" ต้องไม่โดนกฎ "curl" ทั่วไปหรือ "leg" ทั่วไป)
  { keywords: /leg curl|leg extension|calf raise|lateral raise|side raise|ราบข้าง|ยกข้าง|น่อง/, secondary: [] },
  { keywords: /bicep|hammer curl|tricep|pushdown|kickback|กล้ามแขนหน้า|กล้ามแขนหลัง/, secondary: [] },
  { keywords: /plank|แพลงก์|ครันช์|crunch|sit[\s-]?up|หน้าท้อง/, secondary: [] },

  // อก
  { keywords: /fly|flye|cross[\s-]?over|กางแขน|ผีเสื้อ/, secondary: ['ไหล่'] },
  { keywords: /push[\s-]?up|วิดพื้น/, secondary: ['ไหล่', 'แขน'] },
  { keywords: /bench|incline|decline|chest press|dumbbell press|barbell press|smith.*press|floor press|อก/, secondary: ['ไหล่', 'แขน'] },

  // ไหล่
  { keywords: /overhead press|military press|shoulder press|ohp|อัดไหล่|ดันไหล่/, secondary: ['แขน'] },

  // หลัง
  { keywords: /pull[\s-]?up|chin[\s-]?up|ดึงข้อ/, secondary: ['แขน'] },
  { keywords: /pulldown|pull[\s-]?down|ดึงลง/, secondary: ['แขน'] },
  { keywords: /\brow\b|พาย|โรว์/, secondary: ['แขน'] },
  { keywords: /deadlift|ดึงพื้น|ดึงดิน/, secondary: ['ขา', 'แกนกลางลำตัว'] },

  // ขา
  { keywords: /squat|สควอท/, secondary: ['แกนกลางลำตัว'] },
  { keywords: /lunge|ก้าวย่อ/, secondary: ['แกนกลางลำตัว'] },
]

// ค่า fallback สุดท้ายถ้าไม่เจอ keyword ไหนเลย — จับคู่มัดรองที่พบบ่อยตามมัดหลัก
const DEFAULT_SECONDARY_BY_PRIMARY: Record<MuscleGroup, MuscleGroup[]> = {
  'อก': ['ไหล่', 'แขน'],
  'หลัง': ['แขน'],
  'ขา': ['แกนกลางลำตัว'],
  'ไหล่': ['แขน'],
  'แขน': [],
  'แกนกลางลำตัว': [],
  'ทั้งตัว': ['แกนกลางลำตัว'],
  'อื่นๆ': [],
}

export function guessSecondaryMuscles(exerciseName: string, primaryMuscle: MuscleGroup): MuscleGroup[] {
  const name = exerciseName.toLowerCase()
  const rule = SECONDARY_MUSCLE_RULES.find((r) => r.keywords.test(name))
  if (rule) return rule.secondary.filter((mg) => mg !== primaryMuscle)
  return DEFAULT_SECONDARY_BY_PRIMARY[primaryMuscle].filter((mg) => mg !== primaryMuscle)
}
