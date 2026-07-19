import { computeRecoveryPct, WEEKLY_VOLUME_TARGETS } from './dashboardStats'
import { RECOVERY_MUSCLES } from './muscle-groups'
import type { MuscleGroup } from './muscle-groups'

export type RecoveryTier = 'green' | 'yellow' | 'orange' | 'red'

// เกณฑ์สีเป็นค่าอ้างอิงคร่าวๆ สำหรับจัดกลุ่ม ไม่ใช่ค่าทางสรีรวิทยาที่แม่นยำ
export function tierForPct(pct: number): RecoveryTier {
  if (pct >= 75) return 'green'
  if (pct >= 55) return 'yellow'
  if (pct >= 30) return 'orange'
  return 'red'
}

export interface MuscleSessionLoad {
  sets: number
  avgRpe: number | null
}

export interface MuscleRecoveryScore {
  muscleGroup: MuscleGroup
  pct: number
  tier: RecoveryTier
  trainedToday: boolean
}

/**
 * ประเมิน "ความพร้อมสำหรับการฝึกครั้งถัดไป" (ไม่ใช่ "ฟื้นตัวไปแล้วกี่ %") ทันทีหลังจบเซสชัน
 * กลุ่มกล้ามเนื้อที่เพิ่งฝึกวันนี้: ประเมินจาก sets เทียบเป้าหมายรายสัปดาห์ (WEEKLY_VOLUME_TARGETS) x ความหนัก (RPE)
 * กลุ่มที่ไม่ได้ฝึกวันนี้: ใช้ตัวเลข % ฟื้นตัวแบบวันต่อวันเดิม (computeRecoveryPct) ให้สอดคล้องกับหน้า Recovery ของแอป
 *
 * หมายเหตุ: ยังไม่ได้รวมปัจจัยการนอน (Sleep) เพราะแอปยังไม่มีข้อมูลการนอนให้ใช้จริง
 */
export function computeSessionMuscleRecovery(
  trainedToday: Record<string, MuscleSessionLoad>,
  priorLastTrainedDate: Record<string, string | null>
): { overall: number; byMuscle: MuscleRecoveryScore[] } {
  const byMuscle: MuscleRecoveryScore[] = RECOVERY_MUSCLES.map((mg) => {
    const load = trainedToday[mg]

    if (load && load.sets > 0) {
      const weeklyTarget = WEEKLY_VOLUME_TARGETS[mg] ?? 8
      const loadRatio = load.sets / weeklyTarget
      // RPE เฉลี่ย 4 = เบา, 10 = สุดตัว — map เป็น factor 0.5–1.0
      const intensityFactor = Math.min(1, Math.max(0.5, (load.avgRpe ?? 7) / 10))
      const fatigue = Math.min(90, Math.max(15, loadRatio * 100 * intensityFactor))
      const pct = Math.round(Math.min(100, Math.max(10, 100 - fatigue)))
      return { muscleGroup: mg, pct, tier: tierForPct(pct), trainedToday: true }
    }

    const pct = computeRecoveryPct(priorLastTrainedDate[mg] ?? null, mg)
    return { muscleGroup: mg, pct, tier: tierForPct(pct), trainedToday: false }
  })

  const overall = byMuscle.length > 0 ? Math.round(byMuscle.reduce((sum, m) => sum + m.pct, 0) / byMuscle.length) : 100

  return { overall, byMuscle }
}
