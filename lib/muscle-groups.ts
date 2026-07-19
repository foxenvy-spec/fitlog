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
