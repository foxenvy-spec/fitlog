'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, Workout } from '@/lib/types'
import { MUSCLE_GROUPS, VOLUME_MUSCLES } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import {
  computeRecoveryPct,
  suggestMuscleToTrain,
  computeImbalanceInsights,
  getWeekRange,
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
  const { format } = useWeightUnit()
  const { data: exercises = [] } = useExerciseLibrary()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CoachData | null>(null)

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

      // --- Recovery + วันนี้ควรเล่นอะไร ---
      const lastTrainedByMuscle: Record<string, string> = {}
      allEntries.forEach((w) => {
        if (!w.muscle_group) return
        if (!lastTrainedByMuscle[w.muscle_group]) lastTrainedByMuscle[w.muscle_group] = w.performed_at
      })
      const recoveryPctMap: Record<string, number> = {}
      MUSCLE_GROUPS.forEach((mg) => {
        recoveryPctMap[mg] = computeRecoveryPct(lastTrainedByMuscle[mg] ?? null, mg)
      })
      const recommendation = suggestMuscleToTrain(recoveryPctMap)

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

      // --- % ความคืบหน้าของแผนวันนี้ (ใช้กับ dailySummary ด้านล่าง) ---
      const today = todayStr()
      const trainedAnyToday = allEntries.some((w) => w.performed_at?.slice(0, 10) === today)
      const todayDow = new Date(today + 'T00:00:00').getDay()
      const { data: todayDayRow } = await supabase
        .from('program_days')
        .select('id')
        .eq('day_of_week', todayDow)
        .maybeSingle()
      const todayDayId = (todayDayRow as { id: string } | null)?.id ?? null

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

      const dailySummary = computeAIDailySummary(recommendation, balance, todayProgressPct)

      // --- ท่าที่ข้ามไปในเซสชันโปรแกรมล่าสุด ---
      let skippedInsight: Insight | null = null
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
          skippedInsight = buildSkippedExerciseInsight(
            typedDay.title,
            lastDate,
            (planRows as { id: string; exercise_name: string; muscle_group: string | null }[]) ?? [],
            completedIds
          )
        }
      }

      setData({ dailySummary, balance, balanceInsights, overloadPlans, skippedInsight })
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

  return (
    <div className="space-y-5">
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
          <div className="flex items-start gap-2.5 rounded-lg bg-surface border border-line px-4 py-3.5">
            <span className="text-lg leading-none shrink-0">✨</span>
            <p className="text-sm text-ink">{data.dailySummary}</p>
          </div>

          {data.skippedInsight && <InsightCard insight={data.skippedInsight} />}

          <section className="space-y-2.5">
            <h2 className="font-display text-sm tracked uppercase text-muted">สมดุล Push / Pull</h2>
            <div className="rounded-lg bg-surface border border-line px-4 py-3.5 space-y-3">
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
              <div className="rounded-lg bg-surface border border-line px-4 py-3.5">
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
                    className="block rounded-lg bg-surface border border-line px-4 py-3.5 active:bg-surface2 transition"
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

