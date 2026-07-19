// 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date.prototype.getDay())
export const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const
export const WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

export function todayDayOfWeek(): number {
  return new Date().getDay()
}

export function todayStr() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

// วันที่ N วันก่อนวันนี้ ในรูปแบบเดียวกับ todayStr() — ใช้ทำ .gte() cutoff
// เพื่อจำกัดขอบเขต query ไม่ให้โตไม่จำกัดตามอายุการใช้งานของผู้ใช้
export function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

// จับคู่วันที่ N (0-based ตามลำดับที่เจอในไฟล์) เข้ากับวันจันทร์-เสาร์ (1-6) เป็นค่าเริ่มต้น
// ข้ามวันอาทิตย์ไว้เป็นวันพักโดยปริยาย
export function defaultWeekdayForIndex(index: number): number {
  return (1 + (index % 6)) as number
}
