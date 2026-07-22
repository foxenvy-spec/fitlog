'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout } from '@/lib/types'
import { todayDayOfWeek, todayStr, daysAgoStr } from '@/lib/weekdays'
import {
  computeCurrentStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  findNextProgramDay,
  getWeekRange,
  getPreviousWeekRange,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  suggestMuscleToTrain,
  recoveryRecommendationLabel,
  computeBestVolumeIncrease,
  computeGreetingContext,
  computeWorkoutMotivationLabel,
  type Insight,
  type MuscleRecommendation,
  type VolumeIncrease,
} from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { saveDisplayName } from '@/lib/profile'
import { computePushPullBalance, computeAIDailySummary } from '@/lib/aiCoach'
import { VOLUME_MUSCLES, RECOVERY_MUSCLES } from '@/lib/muscle-groups'
import { DEFAULT_DASHBOARD_PREFS, loadDashboardPrefs, saveDashboardPrefs, type DashboardPrefs } from '@/lib/dashboardPrefs'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import GoalRing from '@/components/GoalRing'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import InsightCard from '@/components/InsightCard'
import TodayMuscleHeatmap from '@/components/TodayMuscleHeatmap'
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
const WeeklyCardioVolume = dynamic(() => import('@/components/WeeklyCardioVolume'), {
  loading: () => <Skeleton className="h-56 w-full rounded-lg" />,
})
const DashboardSettings = dynamic(() => import('@/components/DashboardSettings'), { ssr: false })

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
  completedExerciseIds: string[]
  recoveryDates: Record<string, string | null>
  insights: Insight[]
  aiDailySummary: string
  // เฉลี่ย % ของเป้าหมายเซ็ต/สัปดาห์ ข้ามทุกกล้ามเนื้อใน VOLUME_MUSCLES (เพดานที่ 100%
  // ต่อกลุ่ม ก่อนเฉลี่ย) ใช้ตัวเลขเดียวสรุปภาพรวมสำหรับ hero card — รายละเอียดรายกล้ามเนื้อ
  // ยังดูได้เต็ม ๆ ที่ WeeklyVolume ด้านล่าง
  weeklyGoalPct: number
  // ใช้ประกอบ dynamic greeting ด้านบนสุด — กล้ามเนื้อที่ฟื้นตัวมากที่สุด (สำหรับ "X ฟื้นตัวเต็มที่แล้ว")
  // และกลุ่มที่วอลุ่มเพิ่มขึ้นเด่นที่สุดสัปดาห์นี้ (สำหรับ "วอลุ่มเพิ่มขึ้น X%")
  muscleRecommendation: MuscleRecommendation | null
  bestVolumeIncrease: VolumeIncrease | null
  // ใช้กับการ์ด Weekly Goal แบบ motivation — จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ เทียบกับเป้าหมาย
  // (เป้าหมายนับจากจำนวนวันที่ตั้งโปรแกรมไว้เอง ถ้ายังไม่ตั้งเลยใช้ 3 เป็นค่าเริ่มต้น)
  thisWeekWorkoutDays: number
  weeklyWorkoutGoal: number
}

async function fetchDashboardData(supabase: ReturnType<typeof createClient>): Promise<DashboardData> {
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
  const bestVolumeIncrease = computeBestVolumeIncrease(thisWeekSets, lastWeekSets)

  // จำนวนครั้งที่ฝึกแล้วสัปดาห์นี้ (นับวันที่ต่างกัน ไม่ใช่จำนวนแถว) — ใช้ distinctDates ที่ดึงมาแล้ว
  // สำหรับคำนวณ streak ด้านบน (ย้อนหลัง 400 วัน ครอบคลุมสัปดาห์นี้แน่นอน) ไม่ต้อง query ซ้ำ
  const thisWeekWorkoutDays = distinctDates.filter((d) => d >= thisWeekStart && d <= thisWeekEnd).length
  // เป้าหมายจำนวนครั้ง/สัปดาห์ นับจากจำนวนวันที่ผู้ใช้ตั้งโปรแกรมไว้เอง (program_days) — สะท้อน
  // ตารางฝึกจริงของแต่ละคน ถ้ายังไม่ตั้งโปรแกรมเลย ใช้ 3 เป็นค่าเริ่มต้นทั่วไป
  const weeklyWorkoutGoal = typedDays.length > 0 ? typedDays.length : 3

  const currentDay = typedDays.find((d) => d.day_of_week === dow) ?? null

  const { data: exRows } = currentDay
    ? await supabase.from('program_exercises').select('*').eq('program_day_id', currentDay.id).order('position')
    : { data: null as ProgramExercise[] | null }

  const todayExercises = (exRows as ProgramExercise[]) ?? []
  let completedCount = 0
  let completedExerciseIds: string[] = []
  if (todayExercises.length > 0) {
    const { data: completions } = await supabase
      .from('program_completions')
      .select('program_exercise_id')
      .eq('completed_at', today)
      .in(
        'program_exercise_id',
        todayExercises.map((e) => e.id)
      )
    completedExerciseIds = (completions ?? []).map((c) => (c as { program_exercise_id: string }).program_exercise_id)
    completedCount = completedExerciseIds.length
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
    completedExerciseIds,
    recoveryDates,
    insights,
    aiDailySummary,
    weeklyGoalPct,
    muscleRecommendation,
    bestVolumeIncrease,
    thisWeekWorkoutDays,
    weeklyWorkoutGoal,
  }
}

export default function DashboardPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const today = todayStr()

  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // ค่าเริ่มต้นคงที่ (ไม่ขึ้นกับเวลา) เพื่อให้ตรงกับ HTML ที่ server render มาเป๊ะๆ —
  // แล้วค่อยคำนวณคำทักทายจริงหลัง mount ฝั่ง client เท่านั้น เพราะ server (UTC) กับ
  // เครื่องผู้ใช้ (เวลาไทย) คำนวณ new Date().getHours() ได้คนละค่า ถ้าคำนวณตรงๆ ตอน
  // render จะทำให้ข้อความไม่ตรงกันระหว่าง server กับ client (hydration mismatch)
  const [greetingText, setGreetingText] = useState('สวัสดี')

  useEffect(() => {
    setPrefs(loadDashboardPrefs())
    setGreetingText(greeting())
  }, [])

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: () => fetchDashboardData(supabase),
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
  // ประโยคทักทายแบบมีบริบท — ลองมีเรื่อง "วันนี้ทำอะไรต่อ" ก่อน ถ้าไม่มีค่อยลองมี "อะไรดีขึ้นบ้างสัปดาห์นี้"
  const greetingContext = useMemo(
    () =>
      data
        ? computeGreetingContext(scheduledDay?.title ?? null, data.muscleRecommendation, data.bestVolumeIncrease)
        : { headline: null, detail: null },
    [data, scheduledDay]
  )
  const totals = useMemo(() => computeTodayTotals(data?.todayWorkouts ?? []), [data?.todayWorkouts])
  const progressPct =
    data && data.todayExercises.length > 0 ? Math.round((data.completedCount / data.todayExercises.length) * 100) : null
  const nextExerciseName = useMemo(() => {
    if (!data || data.todayExercises.length === 0) return null
    const done = new Set(data.completedExerciseIds)
    const remaining = [...data.todayExercises].sort((a, b) => a.position - b.position).find((e) => !done.has(e.id))
    return remaining?.exercise_name ?? null
  }, [data])
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
    <div className="space-y-6">
      {/* greeting + settings */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs text-muted">👋 {greetingText}</p>
          <p className="font-display text-lg tracked uppercase text-ink mt-0.5">
            {data.profileDisplayName || emailDisplayName(data.email)}
          </p>
          {greetingContext.headline && (
            <p className="font-display text-sm tracked uppercase text-amber mt-1.5">{greetingContext.headline}</p>
          )}
          {greetingContext.detail && <p className="text-[11px] text-muted mt-1">{greetingContext.detail}</p>}
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

      {/* card 1: today's workout */}
      <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
        <div className="px-5 py-5">
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
            <div className="mt-3 flex items-center gap-4">
              <GoalRing pct={progressPct} size={56} strokeWidth={6} ariaLabel="ความคืบหน้าวันนี้" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted">
                  <span className="text-ink font-mono">
                    {data.completedCount}/{data.todayExercises.length}
                  </span>{' '}
                  Exercises
                </p>
                {nextExerciseName && progressPct < 100 ? (
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    Next: <span className="text-ink">{nextExerciseName}</span>
                  </p>
                ) : progressPct >= 100 ? (
                  <p className="text-[11px] text-amber mt-0.5">ครบทุกท่าแล้ว 🎉</p>
                ) : null}
              </div>
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
      </div>

      {/* quick start actions — วางไว้ใต้ Today's Workout เสมอ กันผู้ใช้ใหม่ที่ยังไม่มีโปรแกรม/ประวัติ
          ไม่รู้จะกดอะไรต่อ ต่างจาก quick actions ชุดล่างที่เป็นทางลัดทั่วไป (บันทึก/เทมเพลต/สถิติ) —
          ชุดนี้เน้น 3 ทางเริ่มต้นที่ใช้บ่อยที่สุดตอนเปิดแอปครั้งแรก */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction href="/log" label="บันทึกอิสระ" icon="➕" />
        <QuickAction href="/templates" label="เลือกโปรแกรม" icon="📋" />
        <QuickAction href="/coach" label="ถาม AI" icon="🤖" />
      </div>

      {/* muscles trained today — heat-map chips built from today's workout rows */}
      <TodayMuscleHeatmap todayWorkouts={data.todayWorkouts} />

      {/* card 2: recovery */}
      {prefs.showRecovery && (
        <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
          <a href="/recovery" className="block px-5 py-5 active:bg-surface2 transition">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] tracked uppercase text-muted">Recovery</p>
            </div>

            {(() => {
              const recoveryPctMap: Record<string, number> = {}
              RECOVERY_MUSCLES.forEach((mg) => {
                recoveryPctMap[mg] = computeRecoveryPct(data.recoveryDates[mg] ?? null, mg)
              })
              const recommendation = suggestMuscleToTrain(recoveryPctMap)
              return (
                <>
                  {recommendation &&
                    (() => {
                      const recColor = recoveryStatusColor(recommendation.pct)
                      return (
                        <div
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 mb-3"
                          style={{ backgroundColor: recColor + '1A' }}
                        >
                          <span className="text-sm">💪</span>
                          <p className="text-xs text-ink whitespace-pre-line">
                            {recoveryRecommendationLabel(recoveryLabelPct)}{' '}
                            <span className="font-display tracked uppercase" style={{ color: recColor }}>
                              {recommendation.muscleGroup}
                            </span>{' '}
                            <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
                          </p>
                        </div>
                      )
                    })()}
                  <div className="grid grid-cols-2 gap-2">
                    {RECOVERY_MUSCLES.map((mg) => {
                      const pct = recoveryPctMap[mg]
                      const color = recoveryStatusColor(pct)
                      return (
                        <div
                          key={mg}
                          className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2.5 py-2"
                        >
                          <span className="flex items-center gap-1.5 text-xs text-ink">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            {mg}
                          </span>
                          <span className="font-mono text-xs shrink-0" style={{ color }}>
                            {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-right text-xs text-amber">View Detail →</p>
                </>
              )
            })()}
          </a>
        </div>
      )}

      {/* card 4: weekly goal */}
      <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] tracked uppercase text-muted">Weekly Goal</p>
            <span className="font-mono text-xs text-ink">{data.weeklyGoalPct}%</span>
          </div>
          <div
            className="h-2 rounded-full bg-surface2 overflow-hidden"
            role="progressbar"
            aria-valuenow={data.weeklyGoalPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Weekly Goal"
          >
            <AnimatedBarFill pct={data.weeklyGoalPct} color="#E8A33D" />
          </div>

          <div className="flex items-start gap-2.5 mt-3">
            <span className="text-xl leading-none shrink-0">🔥</span>
            <div>
              <p className="text-sm text-ink">
                <span className="font-mono font-medium">{data.thisWeekWorkoutDays}</span> ครั้งสัปดาห์นี้
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {computeWorkoutMotivationLabel(data.thisWeekWorkoutDays, data.weeklyWorkoutGoal)}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-muted mt-2.5">
            <span className="text-ink font-mono">{data.streak}</span> Day Streak
          </p>
        </div>
      </div>

      {/* card 5 (optional): AI coach */}
      {prefs.showAICoach && (
        <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
          <a href="/coach" className="block px-5 py-5 active:bg-surface2 transition">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] tracked uppercase text-muted">✨ AI Coach</p>
              <span className="text-muted text-xs">ดูรายละเอียด →</span>
            </div>
            <p className="text-xs text-ink whitespace-pre-line">{data.aiDailySummary}</p>
          </a>
        </div>
      )}

      <WorkoutHeatmap />

      {/* Next up in program — below the heatmap so the hero cards above stay focused
          on "what do I do now" (workout, recovery, goal). PR history/suggestions now
          live on the Statistics page alongside the rest of the analytics. */}
      {next && (
        <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-[11px] text-muted">
              Next up: <span className="text-ink">{next.day.title}</span>
            </p>
            <span className="text-[11px] font-mono text-muted">
              {next.daysAway === 1 ? 'พรุ่งนี้' : `อีก ${next.daysAway} วัน`}
            </span>
          </div>
        </div>
      )}

      {data.insights.length > 0 && (
        <div className="space-y-2">
          {data.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      <WeeklyVolume />
      <WeeklyCardioVolume />

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

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a
      href={href}
      className="rounded-lg bg-surface border border-line shadow-elevated flex flex-col items-center justify-center gap-1 py-3.5 text-muted hover:text-amber hover:border-amber/50 transition focus-visible:text-amber"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-[10px] font-display tracked uppercase">{label}</span>
    </a>
  )
}
