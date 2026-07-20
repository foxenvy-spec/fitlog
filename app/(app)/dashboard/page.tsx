'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import {
  computeCurrentStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  computeRecoveryReadyInHours,
  estimateCaloriesToday,
  findNextProgramDay,
  suggestNextPR,
  relativeDayLabel,
  getWeekRange,
  getPreviousWeekRange,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  suggestMuscleToTrain,
  recoveryRecommendationLabel,
  type PRSuggestion,
  type Insight,
} from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { saveDisplayName } from '@/lib/profile'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import type { ExerciseDef } from '@/lib/exerciseLibrary'
import { computePushPullBalance, computeAIDailySummary } from '@/lib/aiCoach'
import { VOLUME_MUSCLES, RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import GoalRing from '@/components/GoalRing'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCard from '@/components/InsightCard'
import ErrorState from '@/components/ErrorState'
import Skeleton from '@/components/Skeleton'

// Below-the-fold widgets are code-split out of the initial dashboard bundle.
// Each fetches its own data independently, so there's no reason to block
// first paint of the hero card on their JS or their network round-trip.
const WorkoutHeatmap = dynamic(() => import('@/components/WorkoutHeatmap'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
})
const WeeklyVolume = dynamic(() => import('@/components/WeeklyVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
})
const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

function statCells(prefs: DashboardPrefs, bodyWeightKg: number | null) {
  const cells = ['volume', 'duration']
  if (prefs.showCalories) cells.push('calories')
  if (prefs.showBodyWeight && bodyWeightKg !== null) cells.push('weight')
  return cells
}

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'สวัสดีตอนเช้า'
  if (h < 17) return 'สวัสดีตอนบ่าย'
  return 'สวัสดีตอนเย็น'
}

// Fallback เมื่อผู้ใช้ยังไม่ได้ตั้ง display_name เอง — ตัดจาก email เหมือนพฤติกรรมเดิม
function emailDisplayName(email: string | undefined | null) {
  if (!email) return 'นักยก'
  const prefix = email.split('@')[0]
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

interface DashboardData {
  email: string | null
  profileDisplayName: string | null
  todayWorkouts: Workout[]
  streak: number
  programDays: ProgramDay[]
  todayExercises: ProgramExercise[]
  completedCount: number
  recoveryDates: Record<string, string | null>
  prSuggestion: PRSuggestion | null
  lastWorkoutDate: string | null
  lastWorkoutTitle: string | null
  lastWorkoutDurationMin: number | null
  bodyWeightKg: number | null
  insights: Insight[]
  aiDailySummary: string
  // เฉลี่ย % ของเป้าหมายเซ็ต/สัปดาห์ ข้ามทุกกล้ามเนื้อใน VOLUME_MUSCLES (เพดานที่ 100%
  // ต่อกลุ่ม ก่อนเฉลี่ย) ใช้ตัวเลขเดียวสรุปภาพรวมสำหรับ hero card — รายละเอียดรายกล้ามเนื้อ
  // ยังดูได้เต็ม ๆ ที่ WeeklyVolume ด้านล่าง
  weeklyGoalPct: number
}

async function fetchDashboardData(supabase: ReturnType<typeof createClient>, exercises: ExerciseDef[]): Promise<DashboardData> {
  const dow = todayDayOfWeek()
  const today = todayStr()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()
  const { start: lastWeekStart } = getPreviousWeekRange()

  // Streak นับต่อเนื่องจะขาดทันทีถ้าเว้นเกิน 1 วัน (ดู computeCurrentStreak) ดังนั้นย้อนหลัง
  // 400 วัน (เกินหนึ่งปี) ก็เกินพอสำหรับ streak ที่มีความหมายจริง — กัน query โตไม่จำกัดตาม
  // อายุการใช้งานของผู้ใช้ (ก่อนหน้านี้ query นี้ดึง performed_at ของทุกแถวที่เคยบันทึกทั้งหมด)
  const STREAK_LOOKBACK_DAYS = 400
  const streakCutoff = daysAgoStr(STREAK_LOOKBACK_DAYS)

  const [
    { data: todayRows },
    { data: allDates },
    { data: dayRows },
    { data: recentStrength },
    { data: latestMetric },
    { data: twoWeeksStrength },
    weeklyVolumeTargets,
    { data: profileRow },
  ] = await Promise.all([
    supabase.from('workouts').select('*').eq('performed_at', today).order('created_at'),
    supabase
      .from('workouts')
      .select('performed_at')
      .gte('performed_at', streakCutoff)
      .order('performed_at', { ascending: false }),
    supabase.from('program_days').select('*').order('day_of_week'),
    supabase
      .from('workouts')
      .select('muscle_group, performed_at, exercise_name, type')
      .eq('type', 'strength')
      .order('performed_at', { ascending: false })
      .limit(1000),
    supabase.from('body_metrics').select('weight_kg').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from('workouts')
      .select('muscle_group, sets, performed_at')
      .eq('type', 'strength')
      .gte('performed_at', lastWeekStart)
      .lte('performed_at', thisWeekEnd),
    // เป้าหมายเซ็ต/สัปดาห์ของผู้ใช้เอง (ตั้งได้ต่อคน) รวมกับ default แล้ว — ดู lib/weeklyVolumeTargets.ts
    fetchWeeklyVolumeTargets(supabase),
    // ชื่อที่แสดงบน Dashboard ที่ผู้ใช้ตั้งเอง (ถ้ามี) — ดู lib/profile.ts
    user
      ? supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null as { display_name: string | null } | null }),
  ])

  const todayList = (todayRows as Workout[]) ?? []

  const distinctDates = Array.from(new Set(((allDates as { performed_at: string }[]) ?? []).map((r) => r.performed_at)))
  const streak = computeCurrentStreak(distinctDates)
  const lastWorkoutDate = distinctDates.filter((d) => d < today).sort().reverse()[0] ?? null
  const bodyWeightKg = (latestMetric as { weight_kg: number | null } | null)?.weight_kg ?? null

  const typedDays = (dayRows as ProgramDay[]) ?? []

  const strengthRows =
    (recentStrength as { muscle_group: string | null; performed_at: string; exercise_name: string | null }[]) ?? []
  const recoveryDates: Record<string, string | null> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    const match = strengthRows.find((r) => r.muscle_group === mg)
    recoveryDates[mg] = match?.performed_at ?? null
  })

  const twoWeeksRows =
    (twoWeeksStrength as { muscle_group: string | null; sets: number | null; performed_at: string }[]) ?? []
  const thisWeekSets: Record<string, number> = {}
  const lastWeekSets: Record<string, number> = {}
  twoWeeksRows.forEach((r) => {
    if (!r.muscle_group) return
    const bucket = r.performed_at >= thisWeekStart ? thisWeekSets : lastWeekSets
    bucket[r.muscle_group] = (bucket[r.muscle_group] ?? 0) + (r.sets ?? 0)
  })
  const weeklyGoalPct = Math.round(
    VOLUME_MUSCLES.reduce((sum, mg) => {
      const target = weeklyVolumeTargets[mg]
      const pct = target > 0 ? Math.min(100, ((thisWeekSets[mg] ?? 0) / target) * 100) : 0
      return sum + pct
    }, 0) / VOLUME_MUSCLES.length
  )

  const volumeInsights = computeVolumeTrendInsights(thisWeekSets, lastWeekSets)
  const imbalanceInsights = computeImbalanceInsights(thisWeekSets, VOLUME_MUSCLES)
  const missedInsights = computeMissedMuscleInsights(recoveryDates)
  const insights = [...imbalanceInsights, ...volumeInsights, ...missedInsights].slice(0, 3)

  const recoveryPctForSummary: Record<string, number> = {}
  RECOVERY_MUSCLES.forEach((mg) => {
    recoveryPctForSummary[mg] = computeRecoveryPct(recoveryDates[mg] ?? null, mg)
  })
  const muscleRecommendation = suggestMuscleToTrain(recoveryPctForSummary)
  const pushPullBalance = computePushPullBalance(thisWeekSets)

  const lastExerciseName = strengthRows.find((r) => r.exercise_name)?.exercise_name ?? null
  const currentDay = typedDays.find((d) => d.day_of_week === dow) ?? null

  // ทั้งสาม query นี้ไม่ได้ขึ้นกับกัน (คนละตาราง คนละเงื่อนไข) เดิมเรียง await ทีละตัว
  // เสีย network round-trip ไปฟรีๆ ยิงพร้อมกันแทน
  const [{ data: exerciseHistory }, { data: exRows }, { data: lastWorkoutRows }] = await Promise.all([
    lastExerciseName
      ? supabase.from('workouts').select('*').eq('type', 'strength').eq('exercise_name', lastExerciseName)
      : Promise.resolve({ data: null as Workout[] | null }),
    currentDay
      ? supabase.from('program_exercises').select('*').eq('program_day_id', currentDay.id).order('position')
      : Promise.resolve({ data: null as ProgramExercise[] | null }),
    lastWorkoutDate
      ? supabase.from('workouts').select('*').eq('performed_at', lastWorkoutDate).order('created_at')
      : Promise.resolve({ data: null as Workout[] | null }),
  ])

  const prSuggestion = lastExerciseName
    ? suggestNextPR(lastExerciseName, (exerciseHistory as Workout[]) ?? [], exercises)
    : null

  // ชื่อ "Last workout" เดาจากโปรแกรมที่ตั้งไว้สำหรับวันในสัปดาห์นั้น (heuristic เดียวกับที่ใช้กับ
  // การ์ด "Today's Workout" ด้านบน) ถ้าวันนั้นไม่มีโปรแกรมตรงกัน ถือว่าเป็นการบันทึกอิสระ
  const lastWorkoutEntries = (lastWorkoutRows as Workout[]) ?? []
  const lastWorkoutTotals = computeTodayTotals(lastWorkoutEntries)
  const lastWorkoutDow = lastWorkoutDate ? new Date(lastWorkoutDate + 'T00:00:00').getDay() : null
  const lastWorkoutProgramDay =
    lastWorkoutDow !== null ? typedDays.find((d) => d.day_of_week === lastWorkoutDow) ?? null : null
  const lastWorkoutTitle = lastWorkoutDate ? lastWorkoutProgramDay?.title ?? 'บันทึกอิสระ' : null

  const todayExercises = (exRows as ProgramExercise[]) ?? []
  let completedCount = 0
  if (todayExercises.length > 0) {
    const { data: completions } = await supabase
      .from('program_completions')
      .select('program_exercise_id')
      .eq('completed_at', today)
      .in(
        'program_exercise_id',
        todayExercises.map((e) => e.id)
      )
    completedCount = completions?.length ?? 0
  }

  // % ความคืบหน้าของแผนวันนี้ ใช้ทั้งโชว์ตัวเลขในข้อความแนะนำ และตัดสินว่า "ฝึกวันนี้ไปแล้ว" หรือยัง
  // ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% ถ้ามี log อย่างน้อย 1 รายการ ไม่งั้นเป็น null (ยังไม่ได้ฝึกอะไรเลย)
  const progressPctForLabel =
    todayExercises.length > 0
      ? Math.round((completedCount / todayExercises.length) * 100)
      : todayList.length > 0
        ? 100
        : null
  const aiDailySummary = computeAIDailySummary(muscleRecommendation, pushPullBalance, progressPctForLabel)

  return {
    email: user?.email ?? null,
    profileDisplayName: (profileRow as { display_name: string | null } | null)?.display_name ?? null,
    todayWorkouts: todayList,
    streak,
    programDays: typedDays,
    todayExercises,
    completedCount,
    recoveryDates,
    prSuggestion,
    lastWorkoutDate,
    lastWorkoutTitle,
    lastWorkoutDurationMin: lastWorkoutTotals.durationMin,
    bodyWeightKg,
    insights,
    aiDailySummary,
    weeklyGoalPct,
  }
}

export default function DashboardPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const today = todayStr()

  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
  }, [])

  const { data: exercises = [] } = useExerciseLibrary()

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['dashboard', today, exercises.length],
    queryFn: () => fetchDashboardData(supabase, exercises),
  })

  function updatePrefs(next: DashboardPrefs) {
    setPrefs(next)
    saveDashboardPrefs(next)
  }

  async function handleSaveDisplayName(name: string) {
    await saveDisplayName(supabase, name)
    queryClient.invalidateQueries({ queryKey: ['dashboard', today] })
  }

  function retry() {
    queryClient.invalidateQueries({ queryKey: ['dashboard', today] })
  }

  const dow = todayDayOfWeek()
  const scheduledDay = useMemo(
    () => data?.programDays.find((d) => d.day_of_week === dow) ?? null,
    [data?.programDays, dow]
  )
  const next = useMemo(() => (data ? findNextProgramDay(data.programDays, dow) : null), [data, dow])
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])
  const progressPct =
    data && data.todayExercises.length > 0 ? Math.round((data.completedCount / data.todayExercises.length) * 100) : null
  const calories = useMemo(
    () => estimateCaloriesToday(data?.todayWorkouts ?? [], totals.durationMin, data?.bodyWeightKg ?? null),
    [data?.todayWorkouts, totals.durationMin, data?.bodyWeightKg]
  )
  const cells = useMemo(() => statCells(prefs, data?.bodyWeightKg ?? null), [prefs, data?.bodyWeightKg])

  const workoutTitle = scheduledDay?.title ?? ((data?.todayWorkouts.length ?? 0) > 0 ? 'บันทึกอิสระ' : null)
  // % ความคืบหน้าที่ใช้กับข้อความแนะนำกล้ามเนื้อ (recoveryRecommendationLabel) — เหมือน progressPct
  // ของ ring ด้านบน แต่ถ้าวันนี้ไม่มีแผนกำหนดไว้ (บันทึกอิสระ) ให้ถือว่า 100% เมื่อมี log อย่างน้อย 1 รายการ
  const recoveryLabelPct =
    progressPct !== null ? progressPct : (data?.todayWorkouts.length ?? 0) > 0 ? 100 : null

  if (isLoading || !data) {
    return <DashboardSkeleton />
  }

  if (isError) {
    return <ErrorState title="โหลด Dashboard ไม่สำเร็จ" message="ไม่สามารถโหลด Dashboard ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่" onRetry={retry} />
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-surface border border-line overflow-hidden">
        {/* greeting + streak */}
        <div className="px-4 pt-4 pb-3.5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">👋 {greeting()}</p>
            <p className="font-display text-lg tracked uppercase text-ink mt-0.5">
              {data.profileDisplayName || emailDisplayName(data.email)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="ปรับแต่ง Dashboard"
            className="shrink-0 text-muted hover:text-amber transition p-1 -mr-1 -mt-1"
          >
            ⚙️
          </button>
        </div>

        <Divider />

        {/* today's workout */}
        <div className="px-4 py-3.5">
          <p className="text-[10px] tracked uppercase text-muted">Today&apos;s Workout</p>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="font-display text-lg tracked uppercase text-ink truncate">
              {workoutTitle ?? 'ยังไม่ได้ตั้งโปรแกรม'}
            </p>
            {scheduledDay ? (
              <a
                href="/session"
                className="shrink-0 text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-3 py-1.5 active:scale-[0.99] transition"
              >
                {totals.entryCount > 0 ? '▶ ไปต่อ' : '▶ เริ่มเลย'}
              </a>
            ) : (
              <a
                href="/log"
                className="shrink-0 text-[11px] font-display tracked uppercase text-bg bg-steel rounded-lg px-3 py-1.5 active:scale-[0.99] transition"
              >
                + บันทึก
              </a>
            )}
          </div>

          {progressPct !== null ? (
            <div className="mt-2.5 flex items-center gap-3">
              <GoalRing pct={progressPct} size={56} strokeWidth={6} label="เสร็จแล้ว" />
              <p className="text-xs text-muted">
                <span className="text-ink font-mono">
                  {data.completedCount}/{data.todayExercises.length}
                </span>{' '}
                Exercises เสร็จแล้ว
              </p>
            </div>
          ) : scheduledDay ? (
            <p className="text-[11px] text-muted mt-1.5">
              <a href="/program" className="hover:text-amber hover:underline">
                ดูแผนทั้งหมด
              </a>
            </p>
          ) : !scheduledDay ? (
            <p className="text-[11px] text-muted mt-1.5">
              ยังไม่มีโปรแกรมวันนี้ —{' '}
              <a href="/program" className="text-amber hover:underline">
                ตั้งโปรแกรม
              </a>{' '}
              หรือ{' '}
              <a href="/templates" className="text-amber hover:underline">
                เริ่มจากเทมเพลต
              </a>
            </p>
          ) : null}
        </div>

        <Divider />

        {/* weekly goal / streak / volume hero */}
        <div className="px-4 pt-3.5 pb-3.5">
          <p className="text-[10px] tracked uppercase text-muted mb-2">Weekly Goal</p>
          <div className="flex items-center gap-4">
            <GoalRing pct={data.weeklyGoalPct} size={52} strokeWidth={6} ariaLabel="Weekly Goal" />
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] tracked uppercase text-muted">Streak</p>
                <p className="font-mono text-lg text-ink mt-0.5">
                  {data.streak} <span className="text-muted text-xs font-body">วัน</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] tracked uppercase text-muted">Volume</p>
                <p className="font-mono text-lg text-ink mt-0.5">
                  {totals.volumeKg > 0 ? Math.round(toDisplay(totals.volumeKg)).toLocaleString('th-TH') : '–'}
                  <span className="text-muted text-xs font-body"> {unit}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {(prefs.showCalories || (prefs.showBodyWeight && data.bodyWeightKg !== null)) && (
          <>
            <Divider />
            <div className={`grid ${GRID_COLS[cells.length - 1] ?? 'grid-cols-2'} divide-x divide-line`}>
              <StatCell label="Duration" value={totals.durationMin !== null ? `${totals.durationMin}` : '–'} unit="นาที" />
              {prefs.showCalories && (
                <StatCell label="Calories" value={calories > 0 ? String(calories) : '–'} unit="kcal" />
              )}
              {prefs.showBodyWeight && data.bodyWeightKg !== null && (
                <StatCell label="Weight" value={toDisplay(data.bodyWeightKg).toLocaleString('th-TH', { maximumFractionDigits: 1 })} unit={unit} />
              )}
            </div>
          </>
        )}

        {/* recovery */}
        {prefs.showRecovery && (
          <>
            <Divider />
            <a href="/recovery" className="block px-4 py-3.5 active:bg-surface2 transition">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] tracked uppercase text-muted">Recovery</p>
                <span className="text-muted text-xs">ดูทั้งหมด →</span>
              </div>

              {(() => {
                const recoveryPctMap: Record<string, number> = {}
                RECOVERY_MUSCLES.forEach((mg) => {
                  recoveryPctMap[mg] = computeRecoveryPct(data.recoveryDates[mg] ?? null, mg)
                })
                const recommendation = suggestMuscleToTrain(recoveryPctMap)
                return (
                  <>
                    {recommendation && (() => {
                      const recColor = recoveryStatusColor(recommendation.pct)
                      return (
                        <div
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 mb-2.5"
                          style={{ backgroundColor: recColor + '1A' }}
                        >
                          <span className="text-sm">💪</span>
                          <p className="text-xs text-ink">
                            {recoveryRecommendationLabel(recoveryLabelPct)}{' '}
                            <span className="font-display tracked uppercase" style={{ color: recColor }}>
                              {recommendation.muscleGroup}
                            </span>{' '}
                            <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
                          </p>
                        </div>
                      )
                    })()}
                    <div className="space-y-1.5">
                      {RECOVERY_MUSCLES.map((mg) => {
                        const pct = recoveryPctMap[mg]
                        const color = recoveryStatusColor(pct)
                        const hoursLeft = computeRecoveryReadyInHours(data.recoveryDates[mg] ?? null, mg)
                        return (
                          <div key={mg} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-16 shrink-0 text-xs text-muted">{mg}</span>
                              <div
                                className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"
                                role="progressbar"
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`ระดับการฟื้นตัวของ${mg}`}
                              >
                                <AnimatedBarFill pct={pct} color={color} />
                              </div>
                              <span className="w-9 shrink-0 text-[10px] font-mono text-right" style={{ color }}>
                                {pct}%
                              </span>
                            </div>
                            {hoursLeft !== null && (
                              <p className="pl-[4.625rem] text-[9px] text-muted">พร้อมฝึกในอีก ~{hoursLeft} ชม.</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </a>
          </>
        )}

        {/* AI coach */}
        {prefs.showAICoach && (
          <>
            <Divider />
            <a href="/coach" className="block px-4 py-3.5 active:bg-surface2 transition">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] tracked uppercase text-muted">✨ AI Coach</p>
                <span className="text-muted text-xs">ดูรายละเอียด →</span>
              </div>
              <p className="text-xs text-ink">{data.aiDailySummary}</p>
            </a>
          </>
        )}
      </div>

      <WorkoutHeatmap />

      {/* Next PR / Last Workout / Next up in program — moved below the heatmap so the
          hero card above stays focused on "what do I do now" (workout, goal, recovery, coach) */}
      <div className="rounded-lg bg-surface border border-line overflow-hidden">
        {prefs.showPR && (
          <>
            {data.prSuggestion ? (
              <a
                href={`/exercises/${encodeURIComponent(data.prSuggestion.exerciseName)}`}
                className="block px-4 py-3.5 active:bg-surface2 transition"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] tracked uppercase text-muted">Next PR</p>
                  <span className="text-muted text-xs">โปรไฟล์ท่า →</span>
                </div>
                <p className="font-display text-base tracked uppercase text-ink mb-2">{data.prSuggestion.exerciseName}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] tracked uppercase text-muted">Last</p>
                    <p className="font-mono text-base text-muted">
                      {format(data.prSuggestion.lastWeight)} × {data.prSuggestion.lastReps}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] tracked uppercase text-muted">Target</p>
                    <p className="font-mono text-base text-amber">
                      {format(data.prSuggestion.targetWeight)} × {data.prSuggestion.targetReps}
                    </p>
                  </div>
                </div>
              </a>
            ) : (
              <div className="px-4 py-3.5">
                <p className="text-[10px] tracked uppercase text-muted mb-1.5">Next PR</p>
                <p className="text-[11px] text-muted">
                  ยังไม่มีประวัติท่าเวท —{' '}
                  <a href="/log" className="text-amber hover:underline">
                    บันทึกเซ็ตแรก
                  </a>
                </p>
              </div>
            )}
          </>
        )}

        {prefs.showPR && <Divider />}

        {/* last workout */}
        <div className="px-4 py-3.5">
          <p className="text-[10px] tracked uppercase text-muted">Last Workout</p>
          <p className="text-sm text-ink mt-0.5">
            {data.lastWorkoutDate ? (
              <>
                {data.lastWorkoutTitle}
                <span className="text-muted">
                  {' • '}
                  {relativeDayLabel(data.lastWorkoutDate)}
                  {data.lastWorkoutDurationMin !== null && <> • {data.lastWorkoutDurationMin} นาที</>}
                </span>
              </>
            ) : (
              'ยังไม่มีประวัติ'
            )}
          </p>
        </div>

        {next && (
          <>
            <Divider />
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-[11px] text-muted">
                Next up: <span className="text-ink">{next.day.title}</span>
              </p>
              <span className="text-[11px] font-mono text-muted">
                {next.daysAway === 1 ? 'พรุ่งนี้' : `อีก ${next.daysAway} วัน`}
              </span>
            </div>
          </>
        )}
      </div>

      {data.insights.length > 0 && (
        <div className="space-y-2">
          {data.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      <WeeklyVolume />

      {/* quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction href="/log" label="บันทึก" icon="✚" />
        <QuickAction href="/templates" label="เทมเพลต" icon="📋" />
        <QuickAction href="/stats" label="สถิติ" icon="📈" />
      </div>

      {settingsOpen && (
        <DashboardSettings
          open={settingsOpen}
          prefs={prefs}
          onChange={updatePrefs}
          onClose={() => setSettingsOpen(false)}
          displayName={data.profileDisplayName ?? ''}
          displayNamePlaceholder={emailDisplayName(data.email)}
          onSaveDisplayName={handleSaveDisplayName}
        />
      )}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-line" />
}

function StatCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[10px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-xl text-ink mt-0.5">{value}</p>
      <p className="text-[10px] text-muted">{unit}</p>
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a
      href={href}
      className="rounded-lg bg-surface border border-line flex flex-col items-center justify-center gap-1 py-3.5 text-muted hover:text-amber hover:border-amber/50 transition focus-visible:text-amber"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-[10px] font-display tracked uppercase">{label}</span>
    </a>
  )
}
