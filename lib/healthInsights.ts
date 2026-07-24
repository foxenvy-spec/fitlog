import type { Insight } from './dashboardStats'

export type Zone = 'Low' | 'Standard' | 'High'
export type Direction = 'lowerBetter' | 'higherBetter' | 'neutral'

export function zoneOf(value: number, low: number, high: number): Zone {
  if (value < low) return 'Low'
  if (value > high) return 'High'
  return 'Standard'
}

// จัดกลุ่มตัวชี้วัดเป็น "ดีมาก / มาตรฐาน / ควรปรับปรุง" ตามโซนและทิศทางที่ดีของแต่ละตัว
// (เช่น ไขมันยิ่งต่ำยิ่งดี, กล้ามเนื้อยิ่งสูงยิ่งดี, น้ำหนัก/BMI ควรอยู่ในช่วงมาตรฐาน)
export function classifyMetric(zone: Zone, direction: Direction): 'good' | 'standard' | 'needsWork' {
  if (zone === 'Standard') return 'standard'
  if (direction === 'neutral') return 'needsWork'
  if (direction === 'lowerBetter') return zone === 'Low' ? 'good' : 'needsWork'
  return zone === 'High' ? 'good' : 'needsWork'
}

export interface ScoredMetric {
  label: string
  status: 'good' | 'standard' | 'needsWork'
}

export function summarizeHealthScore(items: ScoredMetric[]) {
  const good = items.filter((i) => i.status === 'good').length
  const standard = items.filter((i) => i.status === 'standard').length
  const needsWork = items.filter((i) => i.status === 'needsWork').length
  const total = items.length
  // นับ "ดีมาก" และ "มาตรฐาน" รวมกันเป็นคะแนนของวงแหวนสรุป (ทั้งสองแบบถือว่าอยู่ในเกณฑ์โอเค)
  const score = total > 0 ? good + standard : 0
  return { good, standard, needsWork, total, score }
}

// สร้าง insight จากการเปลี่ยนแปลงของค่าล่าสุดเทียบกับค่าแรกในช่วงที่เลือกดู (7/30/90 วัน)
// ใช้เกณฑ์ %เปลี่ยนแปลงขั้นต่ำกันสัญญาณรบกวนจากความคลาดเคลื่อนเล็กน้อยของเครื่องชั่ง
export function computeHealthTrendInsights(params: {
  weight?: { first: number; last: number }
  bodyFatPct?: { first: number; last: number }
  skeletalMuscle?: { first: number; last: number }
  bodyFatKg?: { first: number; last: number }
  minPct?: number
}): Insight[] {
  const minPct = params.minPct ?? 1.5
  const insights: Insight[] = []

  const pctChange = (first: number, last: number) => (first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0)

  if (params.bodyFatPct) {
    const pct = pctChange(params.bodyFatPct.first, params.bodyFatPct.last)
    if (pct <= -minPct) {
      insights.push({
        id: 'trend-bodyfat-down',
        kind: 'positive',
        icon: '🔥',
        title: 'แนวโน้มดีขึ้น',
        detail: `ไขมันในร่างกายลดลง ${Math.abs(pct).toFixed(1)}% จากช่วงที่แล้ว`,
      })
    } else if (pct >= minPct) {
      insights.push({
        id: 'trend-bodyfat-up',
        kind: 'warning',
        icon: '⚠️',
        title: 'ไขมันในร่างกายเพิ่มขึ้น',
        detail: `เพิ่มขึ้น ${pct.toFixed(1)}% จากช่วงที่แล้ว ลองทบทวนอาหารและการฝึก`,
      })
    }
  }

  if (params.skeletalMuscle) {
    const pct = pctChange(params.skeletalMuscle.first, params.skeletalMuscle.last)
    if (pct >= minPct) {
      insights.push({
        id: 'trend-muscle-up',
        kind: 'positive',
        icon: '💪',
        title: 'กล้ามเนื้อเพิ่มขึ้น',
        detail: `กล้ามเนื้อโครงร่างเพิ่มขึ้น ${pct.toFixed(1)}% รักษาโปรแกรมแบบนี้ต่อเนื่อง`,
      })
    } else if (pct <= -minPct) {
      insights.push({
        id: 'trend-muscle-down',
        kind: 'warning',
        icon: '⚠️',
        title: 'กล้ามเนื้อลดลง',
        detail: `กล้ามเนื้อโครงร่างลดลง ${Math.abs(pct).toFixed(1)}% ลองเพิ่มการฝึกแรงต้าน`,
      })
    }
  }

  if (params.weight) {
    const pct = pctChange(params.weight.first, params.weight.last)
    if (Math.abs(pct) >= minPct) {
      insights.push({
        id: 'trend-weight',
        kind: 'positive',
        icon: pct < 0 ? '📉' : '📈',
        title: pct < 0 ? 'น้ำหนักลดลง' : 'น้ำหนักเพิ่มขึ้น',
        detail: `น้ำหนักเปลี่ยนแปลง ${pct.toFixed(1)}% จากช่วงที่แล้ว`,
      })
    }
  }

  return insights.slice(0, 4)
}
