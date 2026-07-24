export type WeightUnit = 'kg' | 'lb'

const KG_PER_LB = 0.45359237
const LB_PER_KG = 1 / KG_PER_LB // ≈ 2.2046226218

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

// ปัดเลขให้อ่านง่าย: ทศนิยม 1 ตำแหน่ง แต่ถ้าลงตัวพอดีก็ไม่โชว์ ".0" ห้อยท้าย
// (เช่น 100 กก. แปลงเป็น 220.5 lb แต่ 0 กก. ก็ยังเป็น "0" ไม่ใช่ "0.0")
export function formatWeightNumber(value: number, decimals = 1): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals)
}

// แปลงค่าน้ำหนักที่เก็บเป็น kg (ตามที่ DB เก็บเสมอ) ไปเป็นหน่วยที่ผู้ใช้เลือกแสดง
// ปัดเหลือ 2 ตำแหน่งทศนิยม กัน floating point เพี้ยน (เช่น 62.5kg ไม่ให้กลายเป็น 137.7889...lb)
export function kgToUnit(kg: number, unit: WeightUnit): number {
  const raw = unit === 'lb' ? kgToLb(kg) : kg
  return Math.round(raw * 100) / 100
}

// แปลงค่าที่ผู้ใช้พิมพ์ในหน่วยที่เลือกไว้ กลับเป็น kg สำหรับเก็บลง DB
// (DB/สคีมายังเก็บเป็น weight_kg เหมือนเดิมทุกที่ ไม่ต้อง migrate อะไร — หน่วยเป็นแค่ชั้น
// การแสดงผล/กรอกข้อมูลเท่านั้น)
export function unitToKg(value: number, unit: WeightUnit): number {
  const kg = unit === 'lb' ? lbToKg(value) : value
  return Math.round(kg * 100) / 100
}

export function formatWeight(kg: number | null | undefined, unit: WeightUnit, decimals = 1): string {
  if (kg === null || kg === undefined) return '—'
  return `${formatWeightNumber(kgToUnit(kg, unit), decimals)} ${unit}`
}

// Drop Set quick-button (session-page.tsx) — ลดน้ำหนักปัจจุบันลงตาม pct (เช่น 10, 20) แล้วปัดเข้า
// step เดียวกับ NumberStepper น้ำหนักปกติ (2.5kg / 5lb) กันได้ตัวเลขแปลกๆ ที่กด stepper ต่อเองไม่ลง
// รอบ เช่น 63.86kg ทำงานในหน่วยที่ผู้ใช้เลือกแสดงอยู่ (unit) แล้วค่อยแปลงกลับเป็น kg สำหรับเก็บ state
// เพราะ step ที่ "อ่านง่าย" (2.5/5) นิยามไว้ในหน่วยแสดงผล ไม่ใช่หน่วย kg เสมอไป
export function dropSetWeightKg(currentKg: number, pct: number, unit: WeightUnit): number {
  const step = unit === 'lb' ? 5 : 2.5
  const currentInUnit = kgToUnit(currentKg, unit)
  const reduced = currentInUnit * (1 - pct / 100)
  const rounded = Math.max(0, Math.round(reduced / step) * step)
  return unitToKg(rounded, unit)
}
