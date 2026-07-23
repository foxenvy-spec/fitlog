// ==================================================================
// Cadence — อัตราก้าว/รอบขาเฉลี่ยระหว่างเซสชันคาร์ดิโอ ที่ผู้ใช้กรอกในฟอร์มบันทึกคาร์ดิโอ
// หน่วยขึ้นอยู่กับชนิดคาร์ดิโอ: วิ่ง/เดินเร็ว/กระโดดเชือก/ว่ายน้ำ ใช้ spm (steps per minute)
// ส่วนปั่นจักรยานใช้ rpm (revolutions per minute) — ใช้ cardio_type เดียวกับตาราง CARDIO_MET
// (ดู lib/dashboardStats.ts) เพื่อไม่ต้องดูแลรายชื่อประเภทคาร์ดิโอซ้ำสองที่
// ==================================================================

export type CadenceUnit = 'spm' | 'rpm'

export const CARDIO_CADENCE_UNIT: Record<string, CadenceUnit> = {
  ปั่นจักรยาน: 'rpm',
}
export const DEFAULT_CADENCE_UNIT: CadenceUnit = 'spm'

// คืนหน่วย cadence ที่ควรใช้ตามชนิดคาร์ดิโอ — ชนิดที่ไม่รู้จัก (พิมพ์เอง) fallback เป็น spm
export function cadenceUnitFor(cardioType: string | null | undefined): CadenceUnit {
  if (!cardioType) return DEFAULT_CADENCE_UNIT
  return CARDIO_CADENCE_UNIT[cardioType] ?? DEFAULT_CADENCE_UNIT
}

export function cadenceUnitLabel(unit: CadenceUnit): string {
  return unit === 'rpm' ? 'rpm' : 'spm'
}

export function cadenceFieldLabel(cardioType: string | null | undefined): string {
  const unit = cadenceUnitFor(cardioType)
  return unit === 'rpm' ? 'Cadence — รอบขา (rpm)' : 'Cadence — ก้าว/นาที (spm)'
}
