// ==================================================================
// VO2Max — ประมาณค่าความฟิตแบบ non-exercise จากชีพจรสูงสุด (max_heart_rate) และ
// ชีพจรขณะพัก (resting_heart_rate) ที่ผู้ใช้กรอกไว้ในโปรไฟล์ (ดู HeartRateSettings.tsx)
// ใช้สูตร Uth–Sørensen–Overgaard–Pedersen (2004): VO2max ≈ 15.3 × (HRmax / HRrest)
// เป็นค่าประมาณคร่าวๆ ไม่แม่นยำเท่าการทดสอบจริงในห้องแล็บ (เช่น Cooper test หรือวิ่งจับเวลา)
// แต่ไม่ต้องใช้ข้อมูลอื่นนอกจากชีพจร 2 ค่านี้ ซึ่งผู้ใช้กรอกไว้อยู่แล้วเพื่อคำนวณ HR Zone
// ==================================================================

export function computeVO2Max(maxHeartRate: number | null, restingHeartRate: number | null): number | null {
  if (!maxHeartRate || !restingHeartRate || maxHeartRate <= 0 || restingHeartRate <= 0) return null
  if (restingHeartRate >= maxHeartRate) return null // ค่าผิดปกติ กันหารแล้วได้ผลลัพธ์ไม่มีความหมาย
  return Math.round(15.3 * (maxHeartRate / restingHeartRate) * 10) / 10
}

export interface VO2MaxCategory {
  key: string
  label: string
}

// เกณฑ์อ้างอิงทั่วไป (ไม่ปรับตามอายุ/เพศ) ใช้แค่ให้ผู้ใช้เห็นภาพคร่าวๆ ว่าค่าที่ได้อยู่ระดับไหน
export function classifyVO2Max(vo2max: number): VO2MaxCategory {
  if (vo2max >= 55) return { key: 'excellent', label: 'ยอดเยี่ยม' }
  if (vo2max >= 45) return { key: 'good', label: 'ดีมาก' }
  if (vo2max >= 35) return { key: 'fair', label: 'ดี' }
  if (vo2max >= 25) return { key: 'belowAverage', label: 'ปานกลาง' }
  return { key: 'low', label: 'ต้องปรับปรุง' }
}
