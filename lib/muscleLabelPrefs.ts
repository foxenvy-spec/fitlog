import type { MuscleLabelLang } from './muscle-groups'

const STORAGE_KEY = 'fitlog:muscleLabelLang'
const DEFAULT_LANG: MuscleLabelLang = 'th'

// อ่านค่าภาษาที่ใช้แสดงชื่อหมวดหมู่กล้ามเนื้อ (th/en) จาก localStorage
// ปลอดภัยกับ SSR — คืนค่า default ถ้าไม่มี window หรือค่าที่เก็บไว้ไม่ถูกต้อง
export function loadMuscleLabelLang(): MuscleLabelLang {
  if (typeof window === 'undefined') return DEFAULT_LANG
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'en' || raw === 'th' ? raw : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG
  }
}

export function saveMuscleLabelLang(lang: MuscleLabelLang) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // localStorage อาจไม่พร้อมใช้งาน (private mode ฯลฯ) — ปล่อยผ่านเงียบๆ
  }
}
