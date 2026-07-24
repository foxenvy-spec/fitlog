'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, Workout } from '@/lib/types'
import {
  generateWorkoutForMuscle,
  toAdhocProgramExercises,
  candidateExercisesForMuscle,
  mapAiExercisesToWorkout,
  type GeneratedWorkout,
} from '@/lib/workoutGenerator'
import { GENERATED_SESSION_STORAGE_KEY, type StoredGeneratedSession } from '@/lib/generatedSession'
import { MUSCLE_GROUPS, VOLUME_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import {
  computeRecoveryPct,
  suggestMuscleToTrain,
  computeImbalanceInsights,
  getWeekRange,
  getScheduledMuscleForDay,
  getNextScheduledMuscle,
  type Insight,
} from '@/lib/dashboardStats'
import {
  computePushPullBalance,
  pushPullInsight,
  computeProgressiveOverload,
  computeAIDailySummary,
  buildSkippedExerciseInsight,
  type PushPullBalance,
  type OverloadPlan,
} from '@/lib/aiCoach'
import Skeleton from '@/components/Skeleton'
import InsightCard from '@/components/InsightCard'
import ErrorState from '@/components/ErrorState'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'

const MAX_OVERLOAD_EXERCISES = 3

const ACTION_LABEL: Record<OverloadPlan['action'], { text: string; color: string }> = {
  increase_weight: { text: 'เพิ่มน้ำหนัก', color: 'text-amber' },
  increase_reps: { text: 'เพิ่ม Reps', color: 'text-ink' },
  deload: { text: 'ลดน้ำหนัก (Deload)', color: 'text-rusttext' },
}

interface CoachData {
  dailySummary: string
  balance: PushPullBalance
  balanceInsights: Insight[]
  overloadPlans: OverloadPlan[]
  skippedInsight: Insight | null
  skippedExerciseNames: string[]
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  todayProgressPct: number | null
  // ถ้าตารางโปรแกรมประจำสัปดาห์ระบุกล้ามเนื้อของวันนี้/ครั้งหน้าไว้ชัดเจน (ดู getScheduledMuscleForDay) —
  // ใช้บอก Gemini ว่าคำแนะนำนี้มาจากตาราง ไม่ใช่จาก recovery % ล้วนๆ ให้เรียบเรียงคำพูดได้ตรงบริบทขึ้น
  scheduledMuscle: string | null
}

function topExerciseNames(rows: { exercise_name: string | null }[], limit: number): string[] {
  const counts: Record<string, number> = {}
  rows.forEach((r) => {
    if (!r.exercise_name) return
    counts[r.exercise_name] = (counts[r.exercise_name] ?? 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}

export default function CoachPage() {
  const supabase = createClient()
  const router = useRouter()
  const { format } = useWeightUnit()
  const { data: exercises = [] } = useExerciseLibrary()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CoachData | null>(null)

  // โปรแกรมที่สร้างแบบ rule-based (ปุ่ม "Generate Workout") — เก็บแยกจาก data เพราะเป็น action ของ
  // ผู้ใช้เอง ไม่ใช่ค่าที่คำนวณตอนโหลดหน้า ผู้ใช้กด "สุ่มใหม่" ได้เรื่อยๆ ก่อนตัดสินใจกด Start Workout
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null)
  // ให้ Gemini ปรุงแต่งทับโปรแกรม rule-based ที่มีอยู่แล้ว — opt-in เหมือน requestAiInsight
  // ถ้าพัง ต้องไม่แทนที่ generatedWorkout เดิม (fallback กลับไปใช้ rule-based เสมอ)
  const [aiWorkoutLoading, setAiWorkoutLoading] = useState(false)
  const [aiWorkoutError, setAiWorkoutError] = useState<string | null>(null)
  // คำแนะนำเชิงลึกจาก Gemini — แยกจาก data.dailySummary (rule-based, คำนวณฟรีทันที) โดยตั้งใจ
  // เพราะเป็น opt-in (ผู้ใช้กดขอเอง ไม่เรียกอัตโนมัติ) กันชนโควต้าฟรีของ Gemini — ถ้าพังให้ตกกลับไป
  // ใช้ dailySummary เดิมเสมอ (ดู aiError ด้านล่าง ไม่แทนที่ dailySummary)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { start: thisWeekStart, end: thisWeekEnd } = getWeekRange()

      const { data: rows } = await supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .order('performed_at', { ascending: false })
        .limit(2000)

      const allEntries = (rows as Workout[]) ?? []

      // --- Recovery ของแต่ละกล้ามเนื้อ ---
      const lastTrainedByMuscle: Record<string, string> = {}
      allEntries.forEach((w) => {
        if (!w.muscle_group) return
        if (!lastTrainedByMuscle[w.muscle_group]) lastTrainedByMuscle[w.muscle_group] = w.performed_at
      })
      const recoveryPctMap: Record<string, number> = {}
      MUSCLE_GROUPS.forEach((mg) => {
        recoveryPctMap[mg] = computeRecoveryPct(lastTrainedByMuscle[mg] ?? null, mg)
      })

      // --- สมดุลกล้ามเนื้อสัปดาห์นี้ ---
      const thisWeekSets: Record<string, number> = {}
      allEntries.forEach((w) => {
        if (!w.muscle_group) return
        if (w.performed_at < thisWeekStart || w.performed_at > thisWeekEnd) return
        thisWeekSets[w.muscle_group] = (thisWeekSets[w.muscle_group] ?? 0) + (w.sets ?? 0)
      })
      const balance = computePushPullBalance(thisWeekSets)
      const balanceWarning = pushPullInsight(balance)
      const balanceInsights: Insight[] = [
        ...(balanceWarning ? [balanceWarning] : []),
        ...computeImbalanceInsights(thisWeekSets, VOLUME_MUSCLES),
      ]

      // --- Progressive Overload สำหรับท่าที่ทำบ่อยที่สุด ---
      const names = topExerciseNames(allEntries, MAX_OVERLOAD_EXERCISES)
      const overloadPlans = names
        .map((name) => computeProgressiveOverload(name, allEntries, exercises))
        .filter((p): p is OverloadPlan => p !== null)

      // --- ตารางโปรแกรมทั้งสัปดาห์ (ใช้ยึดคำแนะนำให้ตรงตาราง แทนที่จะดู recovery % ล้วนๆ) ---
      const { data: allProgramDayRows } = await supabase.from('program_days').select('id, day_of_week, title')
      const allProgramDays = (allProgramDayRows as { id: string; day_of_week: number; title: string }[]) ?? []

      // --- % ความคืบหน้าของแผนวันนี้ (ใช้กับ dailySummary ด้านล่าง) ---
      const today = todayStr()
      const trainedAnyToday = allEntries.some((w) => w.performed_at?.slice(0, 10) === today)
      const todayDow = new Date(today + 'T00:00:00').getDay()
      const todayDayId = allProgramDays.find((d) => d.day_of_week === todayDow)?.id ?? null

      let todayProgressPct: number | null = null
      if (todayDayId) {
        const { data: todayExRows } = await supabase
          .from('program_exercises')
          .select('id')
          .eq('program_day_id', todayDayId)
        const todayExerciseIds = (todayExRows as { id: string }[] | null)?.map((r) => r.id) ?? []
        if (todayExerciseIds.length > 0) {
          const { data: todayCompletions } = await supabase
            .from('program_completions')
            .select('program_exercise_id')
            .eq('completed_at', today)
            .in('program_exercise_id', todayExerciseIds)
          todayProgressPct = Math.round(((todayCompletions?.length ?? 0) / todayExerciseIds.length) * 100)
        } else {
          todayProgressPct = trainedAnyToday ? 100 : null
        }
      } else {
        todayProgressPct = trainedAnyToday ? 100 : null
      }

      // --- กล้ามเนื้อที่ควรแนะนำ: ยึดตามตารางโปรแกรมก่อน ---
      // ถ้าวันนี้ยังทำไม่ครบ (< 100%) และตารางระบุกล้ามเนื้อของ "วันนี้" ไว้ชัดเจน ให้ใช้ตัวนั้น
      // ถ้าวันนี้ทำครบแล้ว หรือวันนี้เป็นวันพัก/ไม่ได้ผูกกล้ามเนื้อไว้ ให้มองไปที่วันถัดไปในตารางที่ระบุไว้
      // ถ้าไม่มีตารางเลย (ผู้ใช้ยังไม่ได้ตั้งโปรแกรม) ตกกลับไปใช้ recovery % สูงสุดเหมือนเดิมทั้งหมด
      const todayScheduledMuscle = getScheduledMuscleForDay(allProgramDays, todayDow, MUSCLE_GROUPS)
      const scheduledMuscle =
        todayScheduledMuscle && (todayProgressPct === null || todayProgressPct < 100)
          ? todayScheduledMuscle
          : getNextScheduledMuscle(allProgramDays, todayDow, MUSCLE_GROUPS)

      const recommendation = suggestMuscleToTrain(recoveryPctMap, scheduledMuscle)
      const dailySummary = computeAIDailySummary(recommendation, balance, todayProgressPct)

      // --- ท่าที่ข้ามไปในเซสชันโปรแกรมล่าสุด ---
      let skippedInsight: Insight | null = null
      let skippedExerciseNames: string[] = []
      const { data: lastCompletionRow } = await supabase
        .from('program_completions')
        .select('completed_at')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastCompletionRow) {
        const lastDate = (lastCompletionRow as { completed_at: string }).completed_at
        const lastDow = new Date(lastDate + 'T00:00:00').getDay()
        const { data: dayRow } = await supabase
          .from('program_days')
          .select('*')
          .eq('day_of_week', lastDow)
          .maybeSingle()

        if (dayRow) {
          const typedDay = dayRow as ProgramDay
          const [{ data: planRows }, { data: completionRows }] = await Promise.all([
            supabase.from('program_exercises').select('id, exercise_name, muscle_group').eq('program_day_id', typedDay.id),
            supabase.from('program_completions').select('program_exercise_id').eq('completed_at', lastDate),
          ])
          const completedIds = new Set(
            ((completionRows as { program_exercise_id: string }[]) ?? []).map((c) => c.program_exercise_id)
          )
          const typedPlanRows = (planRows as { id: string; exercise_name: string; muscle_group: string | null }[]) ?? []
          skippedInsight = buildSkippedExerciseInsight(typedDay.title, lastDate, typedPlanRows, completedIds)
          skippedExerciseNames = typedPlanRows.filter((ex) => !completedIds.has(ex.id)).map((ex) => ex.exercise_name)
        }
      }

      setData({
        dailySummary,
        balance,
        balanceInsights,
        overloadPlans,
        skippedInsight,
        skippedExerciseNames,
        muscleRecommendation: recommendation,
        todayProgressPct,
        scheduledMuscle,
      })
    } catch (err) {
      console.error('Coach page load failed', err)
      Sentry.captureException(err, { tags: { source: 'coach-page' } })
      setError('ไม่สามารถโหลดข้อมูล AI Coach ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [supabase, exercises])

  useEffect(() => {
    load()
  }, [load])

  // ข้อมูลเปลี่ยน (เช่นกด retry) แล้วคำแนะนำ AI เดิมอาจไม่ตรงกับข้อมูลใหม่แล้ว — เคลียร์ทิ้งเพื่อให้
  // ผู้ใช้กดขอใหม่เอง (ไม่ auto-refetch อัตโนมัติ ตามหลัก opt-in เดิม)
  useEffect(() => {
    setAiMessage(null)
    setAiError(null)
    setGeneratedWorkout(null)
    setAiWorkoutError(null)
  }, [data])

  async function requestAiInsight() {
    if (!data) return
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai-coach-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muscleRecommendation: data.muscleRecommendation,
          balance: data.balance,
          overloadPlans: data.overloadPlans.map((p) => ({
            exerciseName: p.exerciseName,
            action: p.action,
            currentWeight: p.currentWeight,
            currentReps: p.currentReps,
            targetWeight: p.targetWeight,
            targetReps: p.targetReps,
            avgRpe: p.avgRpe,
          })),
          skippedExercises: data.skippedExerciseNames.length > 0 ? data.skippedExerciseNames : null,
          todayProgressPct: data.todayProgressPct,
          scheduledMuscle: data.scheduledMuscle,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAiError(json.error ?? 'ขอคำแนะนำจาก AI ไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      setAiMessage(json.message)
    } catch (err) {
      console.error('AI coach insight request failed', err)
      setAiError('ขอคำแนะนำจาก AI ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setAiLoading(false)
    }
  }

  function handleGenerateWorkout() {
    if (!data?.muscleRecommendation) return
    const workout = generateWorkoutForMuscle(data.muscleRecommendation.muscleGroup as MuscleGroup, exercises)
    setGeneratedWorkout(workout)
    setAiWorkoutError(null)
  }

  async function handleEnhanceWithAi() {
    if (!generatedWorkout || !data) return
    setAiWorkoutLoading(true)
    setAiWorkoutError(null)
    try {
      const res = await fetch('/api/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muscleGroup: generatedWorkout.muscleGroup,
          exerciseCount: generatedWorkout.exercises.length,
          candidates: candidateExercisesForMuscle(generatedWorkout.muscleGroup, exercises),
          // ยังไม่มีรายการ "เพิ่งเล่นล่าสุด" แยกต่างหากในหน้านี้ — ใช้ชื่อท่าจาก Progressive Overload
          // plans (ท่าที่ทำบ่อยที่สุด) เป็น proxy ที่ใกล้เคียงที่สุดที่มีอยู่แล้ว
          recentExerciseNames: data.overloadPlans.map((p) => p.exerciseName),
          overloadHints: data.overloadPlans.map((p) => ({ exerciseName: p.exerciseName, action: p.action })),
          balanceStatus: data.balance.status,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAiWorkoutError(json.error ?? 'ให้ AI ปรุงแต่งโปรแกรมไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      const enhanced = mapAiExercisesToWorkout(generatedWorkout.muscleGroup, json.exercises ?? [], exercises)
      if (enhanced.exercises.length === 0) {
        setAiWorkoutError('AI ไม่ได้เลือกท่าที่ใช้ได้ กลับไปใช้โปรแกรมเดิม')
        return
      }
      setGeneratedWorkout(enhanced)
    } catch (err) {
      console.error('AI workout enhance request failed', err)
      setAiWorkoutError('ให้ AI ปรุงแต่งโปรแกรมไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setAiWorkoutLoading(false)
    }
  }

  function handleStartGeneratedWorkout() {
    if (!generatedWorkout) return
    const stored: StoredGeneratedSession = {
      muscleGroup: generatedWorkout.muscleGroup,
      title: `เล่น${generatedWorkout.muscleGroup} (AI Coach)`,
      createdAt: new Date().toISOString(),
      exercises: toAdhocProgramExercises(generatedWorkout),
    }
    // sessionStorage เท่านั้น (ไม่เขียนลง DB) — /session อ่านค่านี้ตอนโหลดถ้า ?source=generated
    sessionStorage.setItem(GENERATED_SESSION_STORAGE_KEY, JSON.stringify(stored))
    router.push('/session?source=generated')
  }

  return (
    <div className="space-y-5 lg:max-w-2xl lg:mx-auto">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">AI Coach</h1>
        <p className="text-xs text-muted mt-0.5">
          วิเคราะห์จากประวัติการฝึกของคุณ — สมดุลกล้ามเนื้อ, Progressive Overload และ Recovery ไม่ใช่คำแนะนำทางการแพทย์
        </p>
      </div>

      {error ? (
        <ErrorState title="โหลด AI Coach ไม่สำเร็จ" message={error} onRetry={load} />
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : data ? (
        <>
          <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="text-lg leading-none shrink-0">✨</span>
              <p className="text-sm text-ink whitespace-pre-line">{data.dailySummary}</p>
            </div>

            {data.muscleRecommendation && (
              <div className="border-t border-line pt-3 space-y-2.5">
                {!generatedWorkout ? (
                  <button
                    type="button"
                    onClick={handleGenerateWorkout}
                    className="text-xs font-display tracked uppercase text-amber border border-amber/40 rounded-lg px-3 py-2 active:scale-[0.99] transition"
                  >
                    🏋️ สร้างโปรแกรม{data.muscleRecommendation.muscleGroup}
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    {generatedWorkout.source === 'ai' && (
                      <p className="text-[9px] font-display tracked uppercase text-violet">🔮 ปรุงแต่งโดย Gemini</p>
                    )}
                    <ul className="space-y-1.5">
                      {generatedWorkout.exercises.map((g) => (
                        <li key={g.exerciseDef.id} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-ink">
                              {g.exerciseDef.icon} {g.exerciseDef.name}
                            </span>
                            <span className="font-mono text-muted">
                              {g.sets}×{g.targetReps}
                            </span>
                          </div>
                          {g.rationale && <p className="text-[10px] text-violet/80 mt-0.5">{g.rationale}</p>}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleStartGeneratedWorkout}
                        className="text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-3 py-2 active:scale-[0.99] transition"
                      >
                        ▶ Start Workout
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateWorkout}
                        className="text-xs font-display tracked uppercase text-muted border border-line rounded-lg px-3 py-2 active:scale-[0.99] transition"
                      >
                        🎲 สุ่มใหม่
                      </button>
                      {generatedWorkout.source === 'rule' && (
                        <button
                          type="button"
                          onClick={handleEnhanceWithAi}
                          disabled={aiWorkoutLoading}
                          className="text-xs font-display tracked uppercase text-violet border border-violet/40 rounded-lg px-3 py-2 active:scale-[0.99] transition disabled:opacity-50"
                        >
                          {aiWorkoutLoading ? 'กำลังปรุงแต่ง...' : '🔮 ให้ AI ปรุงแต่งท่า'}
                        </button>
                      )}
                    </div>
                    {aiWorkoutError && <p className="text-[11px] text-rusttext">{aiWorkoutError}</p>}
                  </div>
                )}
              </div>
            )}

            {aiMessage ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-violet/25 bg-violetdim/30 px-3 py-3">
                <span className="text-base leading-none shrink-0">🔮</span>
                <div className="min-w-0">
                  <p className="text-[9px] font-display tracked uppercase text-violet mb-1">Gemini Insight</p>
                  <p className="text-sm text-ink whitespace-pre-line">{aiMessage}</p>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={requestAiInsight}
                  disabled={aiLoading}
                  className="text-xs font-display tracked uppercase text-violet border border-violet/40 rounded-lg px-3 py-2 active:scale-[0.99] transition disabled:opacity-50"
                >
                  {aiLoading ? 'กำลังวิเคราะห์...' : '🔮 ขอคำแนะนำเชิงลึกจาก AI'}
                </button>
                {aiError && <p className="text-[11px] text-rusttext mt-2">{aiError}</p>}
              </div>
            )}
          </div>

          {data.skippedInsight && <InsightCard insight={data.skippedInsight} />}

          <section className="space-y-2.5">
            <h2 className="font-display text-sm tracked uppercase text-muted">สมดุล Push / Pull</h2>
            <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 space-y-3">
              {(() => {
                const maxSets = Math.max(data.balance.pushSets, data.balance.pullSets, 1)
                const pushPct = Math.round((data.balance.pushSets / maxSets) * 100)
                const pullPct = Math.round((data.balance.pullSets / maxSets) * 100)
                return (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Push (อก/ไหล่)</span>
                      <span className="font-mono text-ink">{data.balance.pushSets} เซ็ต</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                      <AnimatedBarFill pct={pushPct} color="#C1503A" />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Pull (หลัง)</span>
                      <span className="font-mono text-ink">{data.balance.pullSets} เซ็ต</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                      <AnimatedBarFill pct={pullPct} color="#6C8CA8" />
                    </div>
                  </>
                )
              })()}
              <p className="text-[11px] text-muted pt-1">
                {data.balance.status === 'insufficient_data'
                  ? 'ยังมีข้อมูลสัปดาห์นี้ไม่พอให้วิเคราะห์สมดุล'
                  : data.balance.status === 'balanced'
                    ? 'สมดุลดีในสัปดาห์นี้'
                    : `อัตราส่วน Push:Pull ≈ ${data.balance.ratio}:1`}
              </p>
            </div>
            {data.balanceInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </section>

          <section className="space-y-2.5">
            <h2 className="font-display text-sm tracked uppercase text-muted">Progressive Overload</h2>
            {data.overloadPlans.length === 0 ? (
              <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5">
                <p className="text-[11px] text-muted">
                  ยังไม่มีประวัติพอให้แนะนำ —{' '}
                  <a href="/log" className="text-amber hover:underline">
                    บันทึกเซ็ตแรก
                  </a>
                </p>
              </div>
            ) : (
              data.overloadPlans.map((plan) => {
                const action = ACTION_LABEL[plan.action]
                return (
                  <a
                    key={plan.exerciseName}
                    href={`/exercises/${encodeURIComponent(plan.exerciseName)}`}
                    className="block rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 active:bg-surface2 transition"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-display text-base tracked uppercase text-ink">{plan.exerciseName}</p>
                      <span className={`text-[10px] tracked uppercase font-display ${action.color}`}>{action.text}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div>
                        <p className="text-[10px] tracked uppercase text-muted">Current</p>
                        <p className="font-mono text-base text-muted">
                          {format(plan.currentWeight)} × {plan.currentReps}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] tracked uppercase text-muted">Target</p>
                        <p className={`font-mono text-base ${action.color}`}>
                          {format(plan.targetWeight)} × {plan.targetReps}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted">{plan.rationale}</p>
                  </a>
                )
              })
            )}
          </section>

          <a href="/recovery" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2">
            ดู Recovery รายกลุ่มกล้ามเนื้อแบบเต็ม →
          </a>
        </>
      ) : null}
    </div>
  )
}

