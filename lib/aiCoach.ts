import type { Workout } from './types'
import { EXERCISES } from './exercises'
import type { Insight, MuscleRecommendation } from './dashboardStats'

// ==================================================================
// AI Coach — วิเคราะห์สมดุลกล้ามเนื้อ + แนะนำ Progressive Overload
// ทั้งหมดเป็น rule-based บนข้อมูลที่ผู้ใช้บันทึกเอง (ไม่ได้เรียก AI ภายนอก)
// ตั้งชื่อ "AI Coach" เพราะให้คำแนะนำเชิงสรุป/ตัดสินใจแทนการโชว์ตัวเลขดิบ
// ==================================================================

// ==================== Push / Pull Balance ====================
// จัดกลุ่มกล้ามเนื้อ อก+ไหล่ เป็นฝั่ง "ดัน" (Push) และ หลัง เป็นฝั่ง "ดึง" (Pull)
// เพื่อประเมินสมดุลระหว่างกล้ามเนื้อฝั่งหน้า/หลังลำตัว — ไม่สมดุลเรื้อรัง
// (ดันเยอะกว่าดึงมาก) สัมพันธ์กับท่าทางไหล่ห่อและความเสี่ยงบาดเจ็บไหล่ในวงการเวทเทรนนิ่ง
export const PUSH_MUSCLES = ['อก', 'ไหล่'] as const
export const PULL_MUSCLES = ['หลัง'] as const

export type BalanceStatus = 'balanced' | 'push_dominant' | 'pull_dominant' | 'insufficient_data'

export interface PushPullBalance {
  pushSets: number
  pullSets: number
  ratio: number | null // pushSets ÷ pullSets ปัดสองตำแหน่ง — null ถ้าข้อมูลยังไม่พอ
  status: BalanceStatus
}

const BALANCE_TOLERANCE = 0.15 // ยอมรับส่วนต่าง ±15% ว่ายัง "สมดุล"
const MIN_SETS_FOR_BALANCE = 6 // ต้องมีอย่างน้อยฝั่งละกี่เซ็ตต่อสัปดาห์ถึงจะฟันธงได้ ไม่งั้นข้อมูลน้อยเกินจะสรุป

export function computePushPullBalance(setsByMuscle: Record<string, number>): PushPullBalance {
  const pushSets = PUSH_MUSCLES.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0)
  const pullSets = PULL_MUSCLES.reduce((sum, mg) => sum + (setsByMuscle[mg] ?? 0), 0)

  if (pushSets < MIN_SETS_FOR_BALANCE || pullSets < MIN_SETS_FOR_BALANCE) {
    return { pushSets, pullSets, ratio: null, status: 'insufficient_data' }
  }

  const ratio = Math.round((pushSets / pullSets) * 100) / 100
  let status: BalanceStatus = 'balanced'
  if (ratio > 1 + BALANCE_TOLERANCE) status = 'push_dominant'
  else if (ratio < 1 - BALANCE_TOLERANCE) status = 'pull_dominant'

  return { pushSets, pullSets, ratio, status }
}

// แปลง PushPullBalance เป็น Insight การ์ดเดียวกับที่ dashboard ใช้อยู่แล้ว
// คืนค่า null เมื่อสมดุลดีอยู่แล้ว หรือข้อมูลยังไม่พอฟันธง (ไม่ต้องเตือนเปล่าๆ)
export function pushPullInsight(balance: PushPullBalance): Insight | null {
  if (balance.status === 'insufficient_data' || balance.status === 'balanced') return null

  const diffPct = Math.round(
    (Math.abs(balance.pushSets - balance.pullSets) / Math.max(balance.pushSets, balance.pullSets)) * 100
  )

  if (balance.status === 'push_dominant') {
    return {
      id: 'balance-push-pull',
      kind: 'warning',
      icon: '⚖️',
      title: 'Push มากกว่า Pull',
      detail: `เซ็ตดัน (อก/ไหล่) ${balance.pushSets} เทียบดึง (หลัง) ${balance.pullSets} ต่างกัน ${diffPct}% — เพิ่มท่าดึงเพื่อสมดุลไหล่/ท่าทาง`,
    }
  }

  return {
    id: 'balance-push-pull',
    kind: 'warning',
    icon: '⚖️',
    title: 'Pull มากกว่า Push',
    detail: `เซ็ตดึง (หลัง) ${balance.pullSets} เทียบดัน (อก/ไหล่) ${balance.pushSets} ต่างกัน ${diffPct}% — เพิ่มท่าดันเพื่อสมดุล`,
  }
}

// ==================== Progressive Overload แนะนำ (ใช้ RPE) ====================
// ต่างจาก suggestNextPR เดิม (เพิ่มน้ำหนักตายตัวทุกครั้ง) — ฟังก์ชันนี้ดู RPE ของเซสชันล่าสุด
// ถ้ามีบันทึกไว้ เพื่อตัดสินใจว่าควรเพิ่มน้ำหนัก / เพิ่ม reps ก่อน / หรือพัก (deload)
// แนวคิด: RPE ต่ำ = ยังมีแรงเหลือเยอะ ควรเพิ่มน้ำหนัก, RPE กลางๆ = เพิ่ม reps ก่อนค่อยขึ้นน้ำหนัก,
// RPE สูงต่อเนื่องหลายครั้ง = สัญญาณเหนื่อยสะสม ควรลดน้ำหนักลงเล็กน้อยกันบาดเจ็บ
export type OverloadAction = 'increase_weight' | 'increase_reps' | 'deload'

export interface OverloadPlan {
  exerciseName: string
  action: OverloadAction
  currentWeight: number
  currentReps: number
  targetWeight: number
  targetReps: number
  avgRpe: number | null
  rationale: string
}

const RPE_LOW_THRESHOLD = 7
const RPE_HIGH_THRESHOLD = 9
const RECENT_SESSION_COUNT = 3

// allEntries ควรเป็น workouts ทั้งหมดของ exerciseName นั้น (type='strength') — เรียงลำดับใหม่ในฟังก์ชันนี้เอง
export function computeProgressiveOverload(exerciseName: string, allEntries: Workout[]): OverloadPlan | null {
  const sorted = allEntries
    .filter((w) => w.type === 'strength' && w.exercise_name === exerciseName && w.weight_kg !== null && w.reps !== null)
    .sort((a, b) =>
      a.performed_at === b.performed_at ? a.created_at.localeCompare(b.created_at) : a.performed_at < b.performed_at ? -1 : 1
    )

  if (sorted.length === 0) return null

  const last = sorted[sorted.length - 1]
  const currentWeight = last.weight_kg ?? 0
  const currentReps = last.reps ?? 0

  const recent = sorted.slice(-RECENT_SESSION_COUNT)
  const rpeValues = recent.map((w) => w.rpe).filter((r): r is number => r !== null && r !== undefined)
  const avgRpe = rpeValues.length > 0 ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10 : null

  const known = EXERCISES.find((ex) => ex.name === exerciseName || ex.nameTh === exerciseName)
  const weightIncrement = known?.equipment === 'ดัมเบล' ? 1 : 2.5

  if (avgRpe === null) {
    return {
      exerciseName,
      action: 'increase_weight',
      currentWeight,
      currentReps,
      targetWeight: Math.round((currentWeight + weightIncrement) * 10) / 10,
      targetReps: currentReps,
      avgRpe: null,
      rationale: 'ยังไม่มีบันทึก RPE — แนะนำเพิ่มน้ำหนักทีละขั้นแบบมาตรฐาน ลองใส่ RPE ครั้งหน้าเพื่อคำแนะนำที่แม่นขึ้น',
    }
  }

  if (avgRpe <= RPE_LOW_THRESHOLD) {
    return {
      exerciseName,
      action: 'increase_weight',
      currentWeight,
      currentReps,
      targetWeight: Math.round((currentWeight + weightIncrement) * 10) / 10,
      targetReps: currentReps,
      avgRpe,
      rationale: `RPE เฉลี่ย ${avgRpe} จาก ${recent.length} ครั้งล่าสุด ยังเบา — เพิ่มน้ำหนักได้`,
    }
  }

  if (avgRpe >= RPE_HIGH_THRESHOLD) {
    return {
      exerciseName,
      action: 'deload',
      currentWeight,
      currentReps,
      targetWeight: Math.round(currentWeight * 0.9 * 10) / 10,
      targetReps: currentReps,
      avgRpe,
      rationale: `RPE เฉลี่ย ${avgRpe} จาก ${recent.length} ครั้งล่าสุด หนักต่อเนื่อง — ลดน้ำหนักลงเล็กน้อยเพื่อพักฟื้นและกันบาดเจ็บ`,
    }
  }

  return {
    exerciseName,
    action: 'increase_reps',
    currentWeight,
    currentReps,
    targetWeight: currentWeight,
    targetReps: currentReps + 1,
    avgRpe,
    rationale: `RPE เฉลี่ย ${avgRpe} จาก ${recent.length} ครั้งล่าสุด กำลังดี — ลองเพิ่ม reps ก่อนขึ้นน้ำหนัก`,
  }
}

// ==================== สรุปคำแนะนำประจำวันแบบประโยคเดียว ====================
// รวม recovery recommendation (จาก dashboardStats) เข้ากับสถานะ push/pull balance
// ให้ออกมาเป็นประโยคเดียวอ่านง่าย ใช้เป็น hero message ของหน้า AI Coach
export function computeAIDailySummary(
  muscleRecommendation: MuscleRecommendation | null,
  balance: PushPullBalance
): string {
  if (!muscleRecommendation) {
    return 'ยังไม่มีข้อมูลพอให้วิเคราะห์ — ลองบันทึกการฝึกสัก 2-3 ครั้งก่อน'
  }

  let msg = `วันนี้ควรเล่น ${muscleRecommendation.muscleGroup} (ฟื้นตัวแล้ว ${muscleRecommendation.pct}%)`

  if (balance.status === 'push_dominant') {
    msg += ' — และควรแทรกท่าดึง (หลัง) เพิ่ม เพราะสัปดาห์นี้ฝั่งดันเยอะกว่า'
  } else if (balance.status === 'pull_dominant') {
    msg += ' — และควรแทรกท่าดัน (อก/ไหล่) เพิ่ม เพราะสัปดาห์นี้ฝั่งดึงเยอะกว่า'
  }

  return msg
}
