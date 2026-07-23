const STORAGE_KEY = 'fitlog:onboardingBannerDismissed'

// เช็คว่าผู้ใช้เคยกดปิด first-run banner ไปแล้วหรือยัง (ปลอดภัยกับ SSR — คืนค่า false ถ้าไม่มี window)
// เก็บแค่ธงเดียว ไม่ต้องผูกกับ user id เพราะ banner โชว์ตาม "ยังไม่มีประวัติ/โปรแกรมเลย" (ดู hasAnyHistory
// ใน DashboardView) อยู่แล้ว — ถ้าผู้ใช้เริ่มบันทึกจริง banner ก็หายเองโดยไม่ต้องพึ่งธงนี้เลย ธงนี้มีไว้กันแค่
// กรณีผู้ใช้กดปิดเองโดยยังไม่ได้เริ่มอะไร ไม่อยากให้ค้างโผล่ซ้ำทุกครั้งที่เปิดแอป
export function isOnboardingBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissOnboardingBanner() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // localStorage อาจไม่พร้อมใช้งาน (private mode ฯลฯ) — ปล่อยผ่านเงียบๆ
  }
}
