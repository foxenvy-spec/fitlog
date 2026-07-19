'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout } from '@/lib/types'
import { todayDayOfWeek, todayStr } from '@/lib/weekdays'
import { MUSCLE_GROUP_COLORS, RECOVERY_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'
import {
  parseRestSeconds,
  initSessionSet,
  computeSessionSummary,
  aggregateMuscleLoads,
  type SessionSetState,
} from '@/lib/workoutSession'
import { estimateCaloriesToday } from '@/lib/dashboardStats'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { computeSessionMuscleRecovery, tierForPct, type MuscleRecoveryScore } from '@/lib/recoveryScore'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { useVoiceEnabled } from '@/lib/useVoiceEnabled'
import { speak } from '@/lib/speech'
import { NumberStepper } from '@/components/timers/TimerShell'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

type Phase = 'loading' | 'error' | 'empty' | 'active' | 'done'

interface PRHit {
  exerciseName: string
  weightKg: number
  deltaKg: number
}

interface SummaryExtras {
  calories: number
  prs: PRHit[]
  recovery: { overall: number; byMuscle: MuscleRecoveryScore[] }
}

export default function SessionPage() {
  const supabase = createClient()
  const { unit, toDisplay, toKg, format } = useWeightUnit()

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [day, setDay] = useState<ProgramDay | null>(null)
  const [exercises, setExercises] = useState<ProgramExercise[]>([])
  const [states, setStates] = useState<Record<string, SessionSetState>>({})
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [summaryExtras, setSummaryExtras] = useState<SummaryExtras | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  // นาฬิกาเซสชันรวม — เดินตั้งแต่เปิดหน้า ใช้บอกเวลาที่ใช้ไปในสรุปตอนจบ
  const session = useStopwatch()
  const sessionStartedRef = useRef(false)

  // กันหน้าจอดับตลอดเซสชัน ไม่ต้องรอให้ rest timer ทำงานก่อน
  useWakeLock(phase === 'active')

  const load = useCallback(async () => {
    setPhase('loading')
    setErrorMsg(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setPhase('empty')
      return
    }

    const dow = todayDayOfWeek()
    const { data: dayRow, error: dayErr } = await supabase
      .from('program_days')
      .select('*')
      .eq('day_of_week', dow)
      .maybeSingle()

    if (dayErr) {
      setErrorMsg(dayErr.message)
      setPhase('error')
      return
    }

    if (!dayRow) {
      setPhase('empty')
      return
    }

    const { data: exRows, error: exErr } = await supabase
      .from('program_exercises')
      .select('*')
      .eq('program_day_id', (dayRow as ProgramDay).id)
      .order('position')

    if (exErr) {
      setErrorMsg(exErr.message)
      setPhase('error')
      return
    }

    const typedExercises = (exRows as ProgramExercise[]) ?? []
    if (typedExercises.length === 0) {
      setPhase('empty')
      return
    }

    setDay(dayRow as ProgramDay)
    setExercises(typedExercises)
    setStates(
      Object.fromEntries(typedExercises.map((ex) => [ex.id, initSessionSet(ex)]))
    )
    setIndex(0)
    setPhase('active')
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (phase === 'active' && !sessionStartedRef.current) {
      sessionStartedRef.current = true
      session.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const current = exercises[index] ?? null
  const currentState = current ? states[current.id] : null
  const targetSets = current?.sets ?? 3

  function updateCurrent(patch: Partial<SessionSetState>) {
    if (!current) return
    setStates((prev) => ({ ...prev, [current.id]: { ...prev[current.id], ...patch } }))
  }

  async function logCurrentExercise() {
    if (!current || !currentState) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMsg('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      if (currentState.setsDone > 0) {
        const { error: wErr } = await supabase.from('workouts').insert({
          user_id: user.id,
          type: 'strength' as const,
          performed_at: todayStr(),
          exercise_name: current.exercise_name,
          muscle_group: current.muscle_group,
          sets: currentState.setsDone,
          reps: currentState.reps,
          weight_kg: currentState.weightKg,
          rpe: currentState.rpe,
          notes: current.rationale,
        })
        if (wErr) {
          setErrorMsg(`บันทึกไม่สำเร็จ: ${wErr.message}`)
          return
        }

        await supabase
          .from('program_completions')
          .upsert(
            { user_id: user.id, program_exercise_id: current.id, completed_at: todayStr() },
            { onConflict: 'user_id,program_exercise_id,completed_at' }
          )

        updateCurrent({ logged: true })
      }

      goNext()
    } catch (err) {
      setErrorMsg(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  function skipCurrent() {
    goNext()
  }

  function goNext() {
    if (index >= exercises.length - 1) {
      session.pause()
      setPhase('done')
    } else {
      setIndex((i) => i + 1)
    }
  }

  const loadSummaryExtras = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const loggedList = exercises
        .map((ex) => ({ ex, state: states[ex.id] }))
        .filter((e) => e.state?.logged)

      const durationMin = Math.round(session.elapsedMs / 60000)

      const [{ data: latestMetric }, { data: priorRows }, { data: recentMuscleRows }] = await Promise.all([
        supabase.from('body_metrics').select('weight_kg').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
        loggedList.length > 0
          ? supabase
              .from('workouts')
              .select('exercise_name, weight_kg')
              .eq('type', 'strength')
              .lt('performed_at', todayStr())
              .in(
                'exercise_name',
                loggedList.map((e) => e.ex.exercise_name)
              )
          : Promise.resolve({ data: [] as { exercise_name: string; weight_kg: number | null }[] }),
        supabase
          .from('workouts')
          .select('muscle_group, performed_at')
          .eq('type', 'strength')
          .lt('performed_at', todayStr())
          .order('performed_at', { ascending: false })
          .limit(500),
      ])

      const bodyWeightKg = (latestMetric as { weight_kg: number | null } | null)?.weight_kg ?? null
      const calories = estimateCaloriesToday([] as Workout[], durationMin, bodyWeightKg)

      const priorBest: Record<string, number> = {}
      ;((priorRows as { exercise_name: string; weight_kg: number | null }[]) ?? []).forEach((r) => {
        if (r.weight_kg === null) return
        priorBest[r.exercise_name] = Math.max(priorBest[r.exercise_name] ?? 0, r.weight_kg)
      })
      const prs: PRHit[] = loggedList
        .filter((e) => e.state.weightKg !== null && priorBest[e.ex.exercise_name] !== undefined)
        .filter((e) => (e.state.weightKg as number) > priorBest[e.ex.exercise_name])
        .map((e) => ({
          exerciseName: e.ex.exercise_name,
          weightKg: e.state.weightKg as number,
          deltaKg: Math.round(((e.state.weightKg as number) - priorBest[e.ex.exercise_name]) * 10) / 10,
        }))
        .sort((a, b) => b.deltaKg - a.deltaKg)

      const trainedToday = aggregateMuscleLoads(
        loggedList.map((e) => ({ muscleGroup: e.ex.muscle_group, sets: e.state.setsDone, rpe: e.state.rpe }))
      )
      const priorLastTrainedDate: Record<string, string | null> = {}
      const muscleRows = (recentMuscleRows as { muscle_group: string | null; performed_at: string }[]) ?? []
      RECOVERY_MUSCLES.forEach((mg) => {
        if (trainedToday[mg]) return
        priorLastTrainedDate[mg] = muscleRows.find((r) => r.muscle_group === mg)?.performed_at ?? null
      })
      const recovery = computeSessionMuscleRecovery(trainedToday, priorLastTrainedDate)

      setSummaryExtras({ calories, prs, recovery })
    } catch {
      // สรุปเสริมพวกนี้เป็นของแถม — ถ้าโหลดไม่สำเร็จก็ยังโชว์ตัวเลขหลัก (เวลา/วอลุ่ม/เซ็ต) ได้ตามปกติ
    } finally {
      setSummaryLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, exercises, states, session.elapsedMs])

  useEffect(() => {
    if (phase === 'done' && !summaryExtras && !summaryLoading) {
      loadSummaryExtras()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function shareSession() {
    const summary = computeSessionSummary(
      Object.values(states)
        .filter((s) => s.logged)
        .map((s) => ({ setsDone: s.setsDone, reps: s.reps, weightKg: s.weightKg }))
    )
    const lines = [
      `🏋️ ${day?.title ?? 'Workout'} เสร็จแล้ว!`,
      `⏱ ${formatClock(session.elapsedMs)} · ${summary.exerciseCount} ท่า · ${summary.totalSets} เซ็ต`,
    ]
    if (summary.totalVolumeKg > 0) lines.push(`💪 วอลุ่มรวม ${Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString()} ${unit}`)
    if (summaryExtras?.prs.length) {
      lines.push(`🏆 PR ใหม่: ${summaryExtras.prs[0].exerciseName} +${format(summaryExtras.prs[0].deltaKg)}`)
    }
    const text = lines.join('\n')

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        // ผู้ใช้กดยกเลิก share sheet — ไม่ต้องแจ้งอะไร
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      setShareMsg('คัดลอกสรุปแล้ว')
      setTimeout(() => setShareMsg(null), 2000)
    }
  }

  if (phase === 'loading') {
    return <LoadingState message="กำลังเตรียมเซสชัน..." />
  }

  if (phase === 'error') {
    return <ErrorState title="เปิดเซสชันไม่สำเร็จ" message={errorMsg ?? undefined} onRetry={load} />
  }

  if (phase === 'empty') {
    return (
      <div className="rounded-lg bg-surface border border-line border-dashed px-4 py-10 text-center space-y-3">
        <p className="text-sm text-muted">ยังไม่มีโปรแกรมตั้งไว้สำหรับวันนี้ เลยเริ่มเซสชันไม่ได้</p>
        <div className="flex gap-2 justify-center">
          <a href="/program" className="text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 inline-block">
            ไปตั้งโปรแกรม
          </a>
          <a href="/log" className="text-xs font-display tracked uppercase text-ink border border-line rounded-lg px-4 py-2 inline-block">
            บันทึกอิสระแทน
          </a>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const summary = computeSessionSummary(
      Object.values(states).filter((s) => s.logged).map((s) => ({ setsDone: s.setsDone, reps: s.reps, weightKg: s.weightKg }))
    )
    return (
      <div className="space-y-5 text-center py-4">
        <p className="text-4xl">🎉</p>
        <div>
          <p className="font-display text-2xl tracked uppercase text-ink">เซสชันเสร็จแล้ว</p>
          <p className="text-xs text-muted mt-1">{day?.title}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryCell label="เวลาที่ใช้" value={formatClock(session.elapsedMs)} />
          <SummaryCell label="ท่าที่ทำ" value={String(summary.exerciseCount)} />
          <SummaryCell label="เซ็ตรวม" value={String(summary.totalSets)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SummaryCell
            label={`วอลุ่มรวม (${unit})`}
            value={summary.totalVolumeKg > 0 ? Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString() : '–'}
          />
          <SummaryCell
            label="แคลอรี่ (ประมาณ)"
            value={summaryLoading ? '…' : summaryExtras ? `${summaryExtras.calories} kcal` : '–'}
          />
        </div>

        {summaryExtras && summaryExtras.prs.length > 0 && (
          <div className="rounded-lg bg-surface2 border border-amber/30 px-4 py-3 text-left space-y-1">
            <p className="text-[10px] tracked uppercase text-amber">🏆 สถิติใหม่</p>
            {summaryExtras.prs.slice(0, 2).map((pr) => (
              <p key={pr.exerciseName} className="text-xs text-ink">
                {pr.exerciseName} <span className="text-amber font-mono">+{format(pr.deltaKg)}</span>
              </p>
            ))}
            {summaryExtras.prs.length > 2 && (
              <p className="text-[11px] text-muted">และอีก {summaryExtras.prs.length - 2} ท่า</p>
            )}
          </div>
        )}

        {summaryLoading && !summaryExtras && (
          <p className="text-xs text-muted">กำลังประเมินความพร้อมสำหรับครั้งถัดไป...</p>
        )}

        {summaryExtras && (
          <div className="rounded-lg bg-surface border border-line px-4 py-3.5 text-left space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] tracked uppercase text-muted">ความพร้อมครั้งถัดไป</p>
              <p className={`font-mono text-lg ${recoveryTextColor(summaryExtras.recovery.overall)}`}>
                {tierEmoji(summaryExtras.recovery.overall)} {summaryExtras.recovery.overall}%
              </p>
            </div>
            <div className="space-y-1.5">
              {summaryExtras.recovery.byMuscle.map((m) => (
                <div key={m.muscleGroup} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted w-16 shrink-0">{m.muscleGroup}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className={`h-full rounded-full ${recoveryBarColor(m.tier)}`} style={{ width: `${m.pct}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-ink w-9 text-right">{m.pct}%</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted/70">
              ประเมินจากวอลุ่ม/ความหนักที่เพิ่งฝึกและวันที่ฝึกล่าสุดของแต่ละกลุ่มกล้ามเนื้อ (ยังไม่รวมข้อมูลการนอน)
            </p>
          </div>
        )}

        {shareMsg && <p className="text-xs text-amber">{shareMsg}</p>}
        {errorMsg && <p className="text-xs text-rusttext">{errorMsg}</p>}

        <div className="flex gap-2 pt-2">
          <a
            href="/dashboard"
            className="flex-1 rounded-lg bg-amber text-bg font-display tracked uppercase py-3 text-sm active:scale-[0.99] transition"
          >
            กลับหน้าแรก
          </a>
          <button
            type="button"
            onClick={shareSession}
            className="flex-1 rounded-lg border border-line text-ink font-display tracked uppercase py-3 text-sm active:scale-[0.99] transition"
          >
            แชร์
          </button>
        </div>
        <a href="/history" className="block text-[11px] text-muted hover:text-amber transition">
          ดูประวัติทั้งหมด
        </a>
      </div>
    )
  }

  if (!current || !currentState) return null

  const mg = (current.muscle_group as MuscleGroup) ?? null
  const mgColor = mg ? MUSCLE_GROUP_COLORS[mg] : undefined
  const setsRemaining = Math.max(0, targetSets - currentState.setsDone)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracked uppercase text-muted">
          ท่าที่ <span className="text-ink font-mono">{index + 1}</span>/{exercises.length}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-mono text-muted tabular">{formatClock(session.elapsedMs)}</p>
          <button
            type="button"
            onClick={() => {
              session.pause()
              setPhase('done')
            }}
            className="text-[11px] text-muted hover:text-rusttext transition"
          >
            จบก่อน
          </button>
        </div>
      </div>

      {/* progress chips */}
      <div className="flex gap-1">
        {exercises.map((ex, i) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-1.5 flex-1 rounded-full transition ${
              i === index ? 'bg-amber' : states[ex.id]?.logged ? 'bg-steel' : 'bg-surface2'
            }`}
            aria-label={ex.exercise_name}
          />
        ))}
      </div>

      <div className="rounded-lg bg-surface border border-line overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            {mg && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mgColor }} />}
            <p className="font-display text-lg tracked uppercase text-ink truncate">{current.exercise_name}</p>
          </div>
          <p className="text-[11px] text-muted mt-1">
            เป้าหมาย {targetSets} เซ็ต × {current.target_reps ?? '–'} reps
            {current.target_rir && ` · RIR ${current.target_rir}`}
            {current.rest && ` · พัก ${current.rest}`}
          </p>
          {current.rationale && <p className="text-[11px] text-muted/70 mt-1 italic">{current.rationale}</p>}
        </div>

        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between bg-surface2 rounded-lg px-4 py-3">
            <div>
              <p className="text-[10px] tracked uppercase text-muted">เซ็ตที่ทำแล้ว</p>
              <p className="font-mono text-2xl text-ink mt-0.5">
                {currentState.setsDone}
                <span className="text-sm text-muted">/{targetSets}</span>
              </p>
            </div>
            <RestTimerButton
              key={current.id}
              restSeconds={parseRestSeconds(current.rest)}
              onSetLogged={currentState.setsDone}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <NumberStepper
              label="Reps ที่ทำได้"
              value={currentState.reps ?? 0}
              onChange={(v) => updateCurrent({ reps: v })}
              step={1}
              min={0}
            />
            <NumberStepper
              label="น้ำหนัก"
              unit={unit}
              value={toDisplay(currentState.weightKg ?? 0)}
              onChange={(v) => updateCurrent({ weightKg: toKg(v) })}
              step={unit === 'lb' ? 5 : 2.5}
              min={0}
            />
          </div>

          <button
            type="button"
            onClick={() => updateCurrent({ setsDone: currentState.setsDone + 1 })}
            className="w-full rounded-lg bg-steel text-bg font-display tracked uppercase py-3.5 text-sm active:scale-[0.98] transition"
          >
            ✅ เซ็ตนี้เสร็จแล้ว{setsRemaining > 0 ? ` (เหลืออีก ${setsRemaining})` : ''}
          </button>

          {currentState.setsDone > 0 && (
            <button
              type="button"
              onClick={() => updateCurrent({ setsDone: Math.max(0, currentState.setsDone - 1) })}
              className="w-full text-[11px] text-muted hover:text-amber transition"
            >
              แก้ไข — ลบเซ็ตล่าสุด
            </button>
          )}
        </div>
      </div>

      {errorMsg && <p className="text-xs text-rusttext text-center">{errorMsg}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={skipCurrent}
          disabled={saving}
          className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-3 text-xs disabled:opacity-50 transition"
        >
          ข้ามท่านี้
        </button>
        <button
          type="button"
          onClick={logCurrentExercise}
          disabled={saving || currentState.setsDone === 0}
          className="flex-[2] rounded-lg bg-amber text-bg font-display tracked uppercase py-3 text-xs disabled:opacity-40 active:scale-[0.99] transition"
        >
          {saving
            ? 'กำลังบันทึก...'
            : index >= exercises.length - 1
              ? 'บันทึก & จบเซสชัน'
              : 'บันทึก & ท่าถัดไป ▶'}
        </button>
      </div>
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-lg py-3">
      <p className="font-mono text-lg text-ink tabular">{value}</p>
      <p className="text-[9px] tracked uppercase text-muted mt-0.5">{label}</p>
    </div>
  )
}

function tierEmoji(pct: number) {
  const tier = tierForPct(pct)
  if (tier === 'green') return '🟢'
  if (tier === 'yellow') return '🟡'
  if (tier === 'orange') return '🟠'
  return '🔴'
}

function recoveryTextColor(pct: number) {
  const tier = tierForPct(pct)
  if (tier === 'green') return 'text-steel'
  if (tier === 'yellow') return 'text-amber'
  return 'text-rusttext'
}

function recoveryBarColor(tier: 'green' | 'yellow' | 'orange' | 'red') {
  if (tier === 'green') return 'bg-steel'
  if (tier === 'yellow') return 'bg-amber'
  return 'bg-rust'
}

// ตัวจับเวลาพักแบบย่อ ฝังอยู่ในการ์ดของท่าปัจจุบัน — เริ่มนับอัตโนมัติทุกครั้งที่กด
// "เซ็ตนี้เสร็จแล้ว" (ติดตามผ่าน onSetLogged ที่เปลี่ยนค่าทุกครั้งที่เซ็ตเพิ่มขึ้น)
function RestTimerButton({ restSeconds, onSetLogged }: { restSeconds: number; onSetLogged: number }) {
  const { enabled: voiceEnabled } = useVoiceEnabled()
  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const finishedRef = useRef(false)
  const tickedRef = useRef(-1)
  const prevCountRef = useRef(onSetLogged)

  useWakeLock(running)

  const totalMs = restSeconds * 1000
  const remainingMs = Math.max(0, totalMs - elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)

  // เซ็ตเพิ่มขึ้น (กดปุ่ม "เซ็ตนี้เสร็จแล้ว") -> เริ่มพักอัตโนมัติ
  useEffect(() => {
    if (onSetLogged > prevCountRef.current) {
      prevCountRef.current = onSetLogged
      finishedRef.current = false
      tickedRef.current = -1
      reset()
      start()
    } else {
      prevCountRef.current = onSetLogged
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSetLogged])

  useEffect(() => {
    if (!running) return
    if (remainingMs <= 0 && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak('พักครบแล้ว ไปต่อ')
      pause()
      return
    }
    if (remainingSec <= 3 && remainingSec >= 1 && tickedRef.current !== remainingSec) {
      tickedRef.current = remainingSec
      beepTick()
    }
  }, [remainingMs, remainingSec, running, pause, voiceEnabled])

  if (!running && elapsedMs === 0) {
    return <p className="text-[10px] text-muted text-right">พัก {restSeconds}s หลังกดเซ็ต</p>
  }

  const done = !running && finishedRef.current

  return (
    <div className="text-right">
      <p className={`font-mono text-2xl tabular ${done ? 'text-amber' : 'text-steel'}`}>{formatClock(remainingMs)}</p>
      <button
        type="button"
        onClick={() => {
          finishedRef.current = true
          pause()
        }}
        className="text-[10px] text-muted hover:text-amber transition"
      >
        {done ? 'พักครบแล้ว' : 'ข้ามพัก'}
      </button>
    </div>
  )
}
