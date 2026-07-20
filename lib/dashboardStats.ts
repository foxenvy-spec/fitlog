import type { ProgramDay, Workout } from './types'
import { todayStr } from './weekdays'
import type { ExerciseDef } from './exerciseLibrary'

export function computeCurrentStreak(performedDates: string[]): number {
  const days = Array.from(new Set(performedDates)).sort()
  if (days.length === 0) return 0

  const lastDate = new Date(days[days.length - 1] + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  const diffFromToday = Math.round((today.getTime() - lastDate.getTime()) / 86400000)
  if (diffFromToday > 1) return 0

  let streak = 1
  for (let i = days.length - 1; i > 0; i--) {
    const cur = new Date(days[i] + 'T00:00:00')
    const prev = new Date(days[i - 1] + 'T00:00:00')
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000)
    if (diff === 1) streak++
    else break
  }
  return streak
}

export interface TodayTotals {
  volumeKg: number
  sets: number
  durationMin: number | null
  entryCount: number
}

// รวมข้อมูลของวันนี้จากรายการ workouts ที่บันทึกไว้
// duration เป็นค่าประมาณ: ถ้ามีหลายรายการ ใช้ช่วงเวลาตั้งแต่รายการแรกถึงรายการสุดท้าย
// ถ้ามีคาร์ดิโอที่ระบุเวลาไว้ ใช้ค่าที่มากกว่าระหว่างสองแบบ
export function computeTodayTotals(todayWorkouts: Workout[]): TodayTotals {
  const strength = todayWorkouts.filter((w) => w.type === 'strength')
  const cardio = todayWorkouts.filter((w) => w.type === 'cardio')

  const volumeKg = strength.reduce((sum, w) => {
    if (w.total_volume_kg !== null && w.total_volume_kg !== undefined) return sum + w.total_volume_kg
    if (w.sets && w.reps && w.weight_kg) return sum + w.sets * w.reps * w.weight_kg
    return sum
  }, 0)

  const sets = strength.reduce((sum, w) => sum + (w.sets ?? 1), 0)

  const cardioDuration = cardio.reduce((sum, w) => sum + (w.duration_min ?? 0), 0)

  let spanDuration: number | null = null
  if (todayWorkouts.length >= 2) {
    const times = todayWorkouts.map((w) => new Date(w.created_at).getTime())
    spanDuration = Math.round((Math.max(...times) - Math.min(...times)) / 60000)
  }

  const durationMin =
    spanDuration !== null ? Math.max(spanDuration, cardioDuration) : cardioDuration > 0 ? cardioDuration : null

  return { volumeKg, sets, durationMin, entryCount: todayWorkouts.length }
}

export interface NextProgramDay {
  day: ProgramDay
  daysAway: number
}

// หาโปรแกรมวันถัดไปที่ตั้งชื่อไว้ (ไล่จากพรุ่งนี้ไปสูงสุด 7 วัน วนกลับมาที่วันนี้ได้ถ้าไม่มีวันอื่น)
export function findNextProgramDay(days: ProgramDay[], fromDow: number): NextProgramDay | null {
  if (days.length === 0) return null
  for (let offset = 1; offset <= 7; offset++) {
    const dow = (fromDow + offset) % 7
    const match = days.find((d) => d.day_of_week === dow)
    if (match) return { day: match, daysAway: offset }
  }
  return null
}

// ==================== แคลอรี่ (ค่าประมาณ) ====================
// ใช้สูตรมาตรฐาน kcal/นาที = (MET x 3.5 x น้ำหนักตัว กก.) / 200
// MET เป็นค่าอ้างอิงทั่วไป ไม่ใช่ค่าที่วัดจริงรายบุคคล
const CARDIO_MET: Record<string, number> = {
  วิ่ง: 9.0,
  ปั่นจักรยาน: 7.5,
  ว่ายน้ำ: 7.0,
  เดินเร็ว: 4.3,
  กระโดดเชือก: 10.0,
}
const DEFAULT_CARDIO_MET = 6.0
const STRENGTH_MET = 5.0
const DEFAULT_BODYWEIGHT_KG = 70

function kcalForMinutes(met: number, minutes: number, bodyWeightKg: number) {
  return (met * 3.5 * bodyWeightKg) / 200 * minutes
}

export function estimateCaloriesToday(
  todayWorkouts: Workout[],
  strengthSessionMinutes: number | null,
  bodyWeightKg: number | null
): number {
  const weight = bodyWeightKg ?? DEFAULT_BODYWEIGHT_KG
  const cardio = todayWorkouts.filter((w) => w.type === 'cardio')

  const cardioKcal = cardio.reduce((sum, w) => {
    const met = w.cardio_type ? CARDIO_MET[w.cardio_type] ?? DEFAULT_CARDIO_MET : DEFAULT_CARDIO_MET
    return sum + kcalForMinutes(met, w.duration_min ?? 0, weight)
  }, 0)

  const strengthKcal = strengthSessionMinutes ? kcalForMinutes(STRENGTH_MET, strengthSessionMinutes, weight) : 0

  return Math.round(cardioKcal + strengthKcal)
}

// ==================== Recovery ต่อกลุ่มกล้ามเนื้อ (ค่าประมาณ) ====================
// แนวคิด: ยิ่งเว้นระยะจากครั้งล่าสุดที่ฝึกกลุ่มนั้นนานเท่าไร แถบจะยิ่งเต็ม (พร้อมฝึกอีกครั้ง)
// recoveryWindowDays เป็นค่าอ้างอิงทั่วไปของกล้ามเนื้อแต่ละกลุ่ม ไม่ใช่ค่าทางสรีรวิทยาที่แม่นยำรายบุคคล
export const RECOVERY_WINDOW_DAYS: Record<string, number> = {
  อก: 2,
  หลัง: 3,
  ขา: 3,
  ไหล่: 2,
  แขน: 1.5,
  แกนกลางลำตัว: 1,
  ทั้งตัว: 2.5,
  อื่นๆ: 2,
}

export function computeRecoveryPct(lastTrainedDate: string | null, muscleGroup: string): number {
  if (!lastTrainedDate) return 100
  const last = new Date(lastTrainedDate + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  const daysSince = Math.round((today.getTime() - last.getTime()) / 86400000)
  const windowDays = RECOVERY_WINDOW_DAYS[muscleGroup] ?? 2
  return Math.max(0, Math.min(100, Math.round((daysSince / windowDays) * 100)))
}

// สี badge ตามสถานะการฟื้นตัว: แดง (ยังไม่พร้อม) / เหลือง (ปานกลาง) / เขียว (พร้อมฝึกแล้ว)
// เกณฑ์: 0-40% แดง, 41-75% เหลือง, 76-100% เขียว
export function recoveryStatusColor(pct: number): string {
  if (pct >= 76) return '#7A9B57' // moss
  if (pct >= 41) return '#E8A33D' // amber
  return '#C1503A' // rust
}

// ประมาณจำนวนชั่วโมงที่เหลือก่อนกล้ามเนื้อกลุ่มนั้นจะฟื้นตัวเต็มที่ (100%)
// ใช้เวลาจริง ณ ตอนนี้ (ไม่ใช่แค่ระดับวัน) เพื่อให้ตัวเลขชั่วโมงมีความหมาย เช่น "พร้อมฝึกในอีก ~18 ชม."
// คืนค่า null ถ้าฟื้นตัวเต็มที่แล้ว หรือไม่มีประวัติการฝึกกลุ่มนี้ (ไม่ต้องโชว์ข้อความ)
export function computeRecoveryReadyInHours(lastTrainedDate: string | null, muscleGroup: string): number | null {
  if (!lastTrainedDate) return null
  const windowDays = RECOVERY_WINDOW_DAYS[muscleGroup] ?? 2
  const lastMidnight = new Date(lastTrainedDate + 'T00:00:00')
  const hoursSince = (Date.now() - lastMidnight.getTime()) / 3_600_000
  const hoursRemaining = Math.round(windowDays * 24 - hoursSince)
  return hoursRemaining > 0 ? hoursRemaining : null
}

// ==================== แนะนำกลุ่มกล้ามเนื้อที่ควรฝึกวันนี้ ====================
// เลือกจากกลุ่มกล้ามเนื้อที่ recovery % สูงที่สุด (ฟื้นตัวมากที่สุด = พร้อมฝึกที่สุด)
// ในบรรดากลุ่มที่ recoveryPctByMuscle มีข้อมูลให้
export interface MuscleRecommendation {
  muscleGroup: string
  pct: number
}

export function suggestMuscleToTrain(recoveryPctByMuscle: Record<string, number>): MuscleRecommendation | null {
  const entries = Object.entries(recoveryPctByMuscle)
  if (entries.length === 0) return null
  const [muscleGroup, pct] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best), entries[0])
  return { muscleGroup, pct }
}

// ข้อความนำหน้าคำแนะนำกล้ามเนื้อ — ถ้าวันนี้ทำครบทุกท่าตามแผนแล้ว การพูดว่า "วันนี้ควรเล่น" จะทำให้เข้าใจผิด
// ว่ายังมีอะไรต้องทำอีกวันนี้ ทั้งที่จริงๆ เป็นคำแนะนำสำหรับเซสชันถัดไป
// ถ้ายังทำไม่ครบ (0-99%) ต้องแยกให้ชัดระหว่าง "% ที่ทำได้วันนี้" กับ "กล้ามเนื้อที่แนะนำครั้งหน้า"
// เพราะเป็นคนละเรื่องกัน (progressPct คือความคืบหน้าของแผนวันนี้ ส่วนกล้ามเนื้อที่ต่อท้ายคือคำแนะนำ
// จาก recovery score แยกกันไปเลย) — แยกเป็นคนละบรรทัด (\n) พร้อม emoji ต่างกัน ให้เห็นชัดว่าเป็นคนละเรื่อง
// progressPct: null = ไม่มีแผนวันนี้ (บันทึกอิสระ ยังไม่ได้ล็อกอะไรเลย)
export function recoveryRecommendationLabel(progressPct: number | null): string {
  if (progressPct === null) return 'วันนี้ควรเล่น'
  if (progressPct >= 100) return 'ฝึกวันนี้ไปแล้ว ✅ ครั้งหน้าแนะนำเล่น'
  return `🟢 วันนี้ทำได้ ${progressPct}% ของเป้าหมายแล้ว\n🎯 ครั้งหน้าแนะนำเล่น`
}

// ==================== Next PR แนะนำ ====================
export interface PRSuggestion {
  exerciseName: string
  lastWeight: number
  lastReps: number
  targetWeight: number
  targetReps: number
}

export function suggestNextPR(exerciseName: string, allTimeEntries: Workout[], exercises: ExerciseDef[] = []): PRSuggestion | null {
  const entries = allTimeEntries.filter((w) => w.type === 'strength' && w.exercise_name === exerciseName && w.weight_kg)
  if (entries.length === 0) return null

  const best = entries.reduce((max, w) => ((w.weight_kg ?? 0) > (max.weight_kg ?? 0) ? w : max), entries[0])
  const lastWeight = best.weight_kg ?? 0
  const lastReps = best.reps ?? 0

  const known = exercises.find((ex) => ex.name === exerciseName || ex.nameTh === exerciseName)
  const increment = known?.equipment === 'ดัมเบล' ? 1 : 2.5

  return {
    exerciseName,
    lastWeight,
    lastReps,
    targetWeight: Math.round((lastWeight + increment) * 10) / 10,
    targetReps: lastReps,
  }
}

// ==================== วอลุ่มรายสัปดาห์ต่อกลุ่มกล้ามเนื้อ ====================
// ค่าเป้าหมายเป็นแนวทางทั่วไปจากหลักการฝึกเพื่อไฮเปอร์โทรฟี (เซ็ตทำงาน/สัปดาห์ต่อกลุ่มกล้ามเนื้อ)
// ไม่ใช่คำแนะนำทางการแพทย์หรือค่าที่เหมาะกับทุกคน ปรับได้ตามโปรแกรมจริง
//
// นี่คือค่า "default" ที่ใช้ตอนผู้ใช้ยังไม่ได้ตั้งเป้าหมายของตัวเอง (ดูตาราง
// weekly_volume_targets ใน supabase/migrations/005_weekly_volume_targets.sql และ
// lib/weeklyVolumeTargets.ts ซึ่งรวมค่าที่ผู้ใช้ตั้งเองเข้ากับ default พวกนี้)
export const DEFAULT_WEEKLY_VOLUME_TARGETS: Record<string, number> = {
  อก: 10,
  หลัง: 10,
  ขา: 12,
  ไหล่: 8,
  แขน: 8,
  แกนกลางลำตัว: 6,
}

// ชื่อเดิม คงไว้เพื่อไม่กระทบจุดอื่น (เช่น lib/recoveryScore.ts) ที่ยังใช้เป็นค่าคงที่ทั่วไป
// ไม่ใช่เป้าหมายเฉพาะผู้ใช้ — ที่ dashboard/WeeklyVolume ให้ใช้ค่าที่รวมกับ DB แล้วจาก
// lib/weeklyVolumeTargets.ts แทน
export const WEEKLY_VOLUME_TARGETS = DEFAULT_WEEKLY_VOLUME_TARGETS

export function getWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const dow = (reference.getDay() + 6) % 7 // Mon=0..Sun=6
  const monday = new Date(reference)
  monday.setDate(reference.getDate() - dow)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const toIso = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  return { start: toIso(monday), end: toIso(sunday) }
}

// สัปดาห์ก่อนหน้า ใช้เทียบวอลุ่มเพื่อดูเทรนด์ (สัปดาห์นี้ vs สัปดาห์ที่แล้ว)
export function getPreviousWeekRange(reference: Date = new Date()): { start: string; end: string } {
  const { start } = getWeekRange(reference)
  const monday = new Date(start + 'T00:00:00')
  const prevMonday = new Date(monday)
  prevMonday.setDate(monday.getDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setDate(prevMonday.getDate() + 6)
  const toIso = (d: Date) => {
    const offset = d.getTimezoneOffset()
    const local = new Date(d.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  return { start: toIso(prevMonday), end: toIso(prevSunday) }
}

// ==================== Insight Card ====================
// การ์ดที่ "คิด" แทนการโชว์ตัวเลขเฉยๆ — สรุปเทรนด์วอลุ่มที่ดีขึ้น หรือเตือนกลุ่มกล้ามเนื้อที่ถูกลืม
export interface Insight {
  id: string
  kind: 'positive' | 'warning'
  icon: string
  title: string
  detail: string
}

// เทียบเซ็ตต่อกลุ่มกล้ามเนื้อของสัปดาห์นี้กับสัปดาห์ที่แล้ว แจ้งเฉพาะกลุ่มที่วอลุ่มเพิ่มขึ้นชัดเจน (>=15%)
export function computeVolumeTrendInsights(
  thisWeekSets: Record<string, number>,
  lastWeekSets: Record<string, number>,
  minLastWeekSets = 3,
  minPctIncrease = 15
): Insight[] {
  const insights: Insight[] = []
  Object.keys(thisWeekSets).forEach((mg) => {
    const cur = thisWeekSets[mg] ?? 0
    const prev = lastWeekSets[mg] ?? 0
    if (prev < minLastWeekSets || cur <= 0) return
    const pct = Math.round(((cur - prev) / prev) * 100)
    if (pct >= minPctIncrease) {
      insights.push({
        id: `volume-${mg}`,
        kind: 'positive',
        icon: '💡',
        title: `${mg} Volume +${pct}%`,
        detail: 'เยี่ยมมาก ทำได้ดีขึ้นจากสัปดาห์ที่แล้ว',
      })
    }
  })
  return insights.sort((a, b) => (a.title < b.title ? -1 : 1))
}

// เตือนกลุ่มกล้ามเนื้อที่ฝึกน้อยกว่ากลุ่มอื่นๆ อย่างมีนัยสำคัญในสัปดาห์นี้ (เทียบสัมพัทธ์กันเอง ไม่ใช่เทียบเป้าหมายคงที่)
// ต่างจาก volumeStatus ตรงที่จับ "ไม่สมดุลระหว่างกลุ่ม" ได้ แม้จะยังไม่ต่ำกว่าเป้าหมายที่ตั้งไว้ก็ตาม
export function computeImbalanceInsights(
  thisWeekSets: Record<string, number>,
  muscles: readonly string[],
  minPctBelowAverage = 40,
  minTotalSets = 12
): Insight[] {
  const total = muscles.reduce((sum, mg) => sum + (thisWeekSets[mg] ?? 0), 0)
  if (total < minTotalSets) return []

  const insights: Insight[] = []
  muscles.forEach((mg) => {
    const own = thisWeekSets[mg] ?? 0
    const others = muscles.filter((m) => m !== mg)
    const othersAvg = others.reduce((sum, m) => sum + (thisWeekSets[m] ?? 0), 0) / others.length
    if (othersAvg <= 0) return
    const pctOfAvg = (own / othersAvg) * 100
    if (pctOfAvg <= 100 - minPctBelowAverage) {
      insights.push({
        id: `imbalance-${mg}`,
        kind: 'warning',
        icon: '⚖️',
        title: `${mg}คุณฝึกน้อยกว่าส่วนอื่น`,
        detail: `น้อยกว่าค่าเฉลี่ยกลุ่มอื่นในสัปดาห์นี้ ${Math.round(100 - pctOfAvg)}%`,
      })
    }
  })
  return insights.sort((a, b) => (a.id < b.id ? -1 : 1))
}
export function computeMissedMuscleInsights(
  recoveryDates: Record<string, string | null>,
  thresholdDays = 7
): Insight[] {
  const today = new Date(todayStr() + 'T00:00:00')
  const insights: Insight[] = []
  Object.entries(recoveryDates).forEach(([mg, dateStr]) => {
    if (!dateStr) return
    const last = new Date(dateStr + 'T00:00:00')
    const daysSince = Math.round((today.getTime() - last.getTime()) / 86400000)
    if (daysSince >= thresholdDays) {
      insights.push({
        id: `missed-${mg}`,
        kind: 'warning',
        icon: '⚠️',
        title: `ไม่ได้ฝึก ${mg}`,
        detail: `${daysSince} วันแล้ว`,
      })
    }
  })
  return insights.sort((a, b) => (a.detail < b.detail ? 1 : -1))
}

export type VolumeStatus = 'behind' | 'onTrack' | 'met'

// เทียบเซ็ตที่ทำแล้วกับเป้าหมายที่ปรับตามสัดส่วนวันที่ผ่านไปแล้วของสัปดาห์ (ไม่รอถึงวันอาทิตย์ถึงจะเตือน)
export function volumeStatus(setsDone: number, weeklyTarget: number, dayOfWeek1to7: number): VolumeStatus {
  if (setsDone >= weeklyTarget) return 'met'
  const proratedTarget = (weeklyTarget * dayOfWeek1to7) / 7
  if (setsDone >= proratedTarget * 0.8) return 'onTrack'
  return 'behind'
}
export function relativeDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'วันนี้'
  if (diff === 1) return 'เมื่อวาน'
  if (diff > 1) return `${diff} วันที่แล้ว`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
