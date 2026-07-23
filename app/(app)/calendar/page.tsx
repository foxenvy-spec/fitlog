'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Goal, GoalStatus, GoalType, Workout } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import type { WeightUnit } from '@/lib/weightUnit'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

// 'weight' และ 'strength_volume' เก็บ target_value/starting_value เป็น kg เสมอ (เหมือน weight_kg
// ทุกที่ในแอป) — ต้องแปลงเป็นหน่วยที่เลือกแสดงตอนเรนเดอร์ และแปลงกลับเป็น kg ตอนบันทึกฟอร์ม
function isWeightGoalType(t: GoalType) {
  return t === 'weight' || t === 'strength_volume'
}

function goalTypeLabel(unit: WeightUnit): Record<GoalType, string> {
  return {
    weight: `น้ำหนักตัว (${unit})`,
    body_fat: 'Body Fat (%)',
    strength_volume: `วอลุ่มเวทรวม (${unit})`,
    cardio_distance: 'ระยะทางคาร์ดิโอรวม (กม.)',
    custom: 'กำหนดเอง',
  }
}

function toIsoDate(d: Date) {
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

function workoutVolumeKg(w: Workout): number {
  return w.total_volume_kg ?? (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

// สรุปภาพรวมของวันที่เลือก — โชว์ก่อนเห็นรายการละเอียด จะได้รู้ทันทีว่าวันนั้นหนักแค่ไหน
interface DaySummary {
  exerciseCount: number
  totalSets: number
  totalVolumeKg: number
  muscleGroups: string[]
  durationMin: number | null
}

function computeDaySummary(dayWorkouts: Workout[]): DaySummary {
  const strength = dayWorkouts.filter((w) => w.type === 'strength')
  const totalSets = strength.reduce((s, w) => s + (w.sets ?? 0), 0)
  const totalVolumeKg = strength.reduce((s, w) => s + workoutVolumeKg(w), 0)
  const muscleGroups = Array.from(new Set(strength.map((w) => w.muscle_group).filter((m): m is string => !!m)))

  // ไม่มีฟิลด์ duration ต่อวันเก็บตรงๆ — ประมาณจากช่วงเวลา created_at แรกสุดถึงล่าสุดของวันนั้น
  // (ใกล้เคียงเวลาที่ใช้ในเซสชันจริง เพราะแต่ละท่าถูกบันทึกทันทีตอนกดเสร็จระหว่างเทรน)
  const timestamps = dayWorkouts.map((w) => new Date(w.created_at).getTime()).filter((t) => !Number.isNaN(t))
  const durationMin =
    timestamps.length >= 2 ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000) : null

  return { exerciseCount: dayWorkouts.length, totalSets, totalVolumeKg, muscleGroups, durationMin }
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

type ProgressBadge =
  | { kind: 'pr'; deltaKg: number }
  | { kind: 'bestVolume' }
  | { kind: 'up'; deltaKg: number }
  | { kind: 'down'; deltaKg: number }
  | { kind: 'none' }

// เทียบท่านี้กับประวัติก่อนหน้า (ไม่รวมวันเดียวกัน) — ใช้บอกว่าเปิดย้อนมาดูวันนี้แล้ว "หนักกว่าเดิม" แค่ไหน
function computeExerciseProgress(w: Workout, allWorkouts: Workout[]): ProgressBadge {
  if (w.type !== 'strength' || !w.exercise_name) return { kind: 'none' }
  const prior = allWorkouts.filter(
    (p) => p.type === 'strength' && p.exercise_name === w.exercise_name && p.performed_at < w.performed_at
  )
  if (prior.length === 0) return { kind: 'none' }

  const thisWeight = w.weight_kg ?? 0
  const thisVolume = workoutVolumeKg(w)
  const prevBestWeight = Math.max(...prior.map((p) => p.weight_kg ?? 0))
  const prevBestVolume = Math.max(...prior.map(workoutVolumeKg))

  if (thisWeight > 0 && thisWeight > prevBestWeight) {
    return { kind: 'pr', deltaKg: Math.round((thisWeight - prevBestWeight) * 10) / 10 }
  }
  if (thisVolume > 0 && thisVolume > prevBestVolume) {
    return { kind: 'bestVolume' }
  }

  // ไม่ใช่สถิติใหม่ — เทียบกับครั้งล่าสุดก่อนหน้าแทน เพื่อโชว์แนวโน้มระยะสั้น
  const lastSession = prior.reduce((a, b) => (a.performed_at > b.performed_at ? a : b))
  const lastWeight = lastSession.weight_kg ?? 0
  if (thisWeight > lastWeight) return { kind: 'up', deltaKg: Math.round((thisWeight - lastWeight) * 10) / 10 }
  if (thisWeight < lastWeight) return { kind: 'down', deltaKg: Math.round((lastWeight - thisWeight) * 10) / 10 }
  return { kind: 'none' }
}

function ProgressBadge({ badge, format }: { badge: ProgressBadge; format: (kg: number | null | undefined) => string }) {
  if (badge.kind === 'pr') {
    return <span className="text-[10px] font-mono text-amber shrink-0">PR 🎉 +{format(badge.deltaKg)}</span>
  }
  if (badge.kind === 'bestVolume') {
    return <span className="text-[10px] font-mono text-amber shrink-0">Best Volume 🏆</span>
  }
  if (badge.kind === 'up') {
    return <span className="text-[10px] font-mono text-steel shrink-0">▲ +{format(badge.deltaKg)}</span>
  }
  if (badge.kind === 'down') {
    return <span className="text-[10px] font-mono text-muted shrink-0">▼ -{format(badge.deltaKg)}</span>
  }
  return null
}

export default function CalendarPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [cursor, setCursor] = useState(() => new Date())
  const [monthWorkouts, setMonthWorkouts] = useState<Workout[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [goals, setGoals] = useState<Goal[]>([])
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([])
  const [latestMetric, setLatestMetric] = useState<BodyMetric | null>(null)
  const [showGoalForm, setShowGoalForm] = useState(false)

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor])

  const loadMonth = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .gte('performed_at', toIsoDate(monthStart))
      .lte('performed_at', toIsoDate(monthEnd))
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    setMonthWorkouts((data as Workout[]) ?? [])
    setLoading(false)
  }, [supabase, monthStart, monthEnd])

  const loadGoalsData = useCallback(async () => {
    const since = new Date()
    since.setDate(since.getDate() - 365)
    const [goalsRes, workoutsRes, metricRes] = await Promise.all([
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
      supabase.from('workouts').select('*').gte('performed_at', toIsoDate(since)),
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(1),
    ])
    setGoals((goalsRes.data as Goal[]) ?? [])
    setAllWorkouts((workoutsRes.data as Workout[]) ?? [])
    setLatestMetric(((metricRes.data as BodyMetric[]) ?? [])[0] ?? null)
  }, [supabase])

  useEffect(() => {
    loadMonth()
  }, [loadMonth])

  useEffect(() => {
    loadGoalsData()
  }, [loadGoalsData])

  const dayMap = useMemo(() => {
    const map = new Map<string, { strength: boolean; cardio: boolean }>()
    monthWorkouts.forEach((w) => {
      const cur = map.get(w.performed_at) ?? { strength: false, cardio: false }
      if (w.type === 'strength') cur.strength = true
      else cur.cardio = true
      map.set(w.performed_at, cur)
    })
    return map
  }, [monthWorkouts])

  const streak = useMemo(() => {
    const days = new Set(allWorkouts.map((w) => w.performed_at))
    let count = 0
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    if (!days.has(toIsoDate(cursor))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    while (days.has(toIsoDate(cursor))) {
      count++
      cursor.setDate(cursor.getDate() - 1)
    }
    return count
  }, [allWorkouts])

  const gridDays = useMemo(() => {
    const firstWeekday = monthStart.getDay() // 0 = Sun
    const daysInMonth = monthEnd.getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    return cells
  }, [monthStart, monthEnd, cursor])

  const selectedWorkouts = selectedDate ? monthWorkouts.filter((w) => w.performed_at === selectedDate) : []

  function goalProgress(goal: Goal): number | null {
    if (goal.target_value === null) return null
    let current: number | null = null
    if (goal.goal_type === 'weight') current = latestMetric?.weight_kg ?? null
    else if (goal.goal_type === 'body_fat') current = latestMetric?.body_fat_pct ?? null
    else if (goal.goal_type === 'strength_volume') {
      current = allWorkouts
        .filter((w) => w.type === 'strength')
        .reduce((s, w) => s + (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0), 0)
    } else if (goal.goal_type === 'cardio_distance') {
      current = allWorkouts.filter((w) => w.type === 'cardio').reduce((s, w) => s + (w.distance_km ?? 0), 0)
    }
    if (current === null) return null
    const start = goal.starting_value ?? current
    if (goal.target_value === start) return current >= goal.target_value ? 1 : 0
    const raw = (current - start) / (goal.target_value - start)
    return Math.min(1, Math.max(0, raw))
  }

  async function handleDeleteGoal(id: string) {
    await supabase.from('goals').delete().eq('id', id)
    setGoals((prev) => prev.filter((g) => g.id !== id))
  }

  async function handleToggleDone(goal: Goal) {
    const nextStatus: GoalStatus = goal.status === 'done' ? 'active' : 'done'
    await supabase.from('goals').update({ status: nextStatus }).eq('id', goal.id)
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status: nextStatus } : g)))
  }

  const weekdayLabels = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl tracked uppercase">ปฏิทิน</h1>

      {streak > 0 && (
        <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5 flex items-center justify-between">
          <span className="text-sm text-ink">🔥 Streak ต่อเนื่อง</span>
          <span className="font-mono text-2xl tabular text-amber">
            {streak}
            <span className="text-xs text-muted ml-1">วัน</span>
          </span>
        </div>
      )}

      {loadError ? (
        <ErrorState title="โหลดปฏิทินไม่สำเร็จ" message={loadError} onRetry={loadMonth} />
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink"
              >
                ‹
              </button>
              <p className="font-display tracked uppercase text-sm">
                {cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {weekdayLabels.map((w) => (
                <span key={w} className="text-[10px] text-muted uppercase tracked">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {gridDays.map((d, i) => {
                if (!d) return <div key={`empty-${i}`} />
                const iso = toIsoDate(d)
                const marks = dayMap.get(iso)
                const isToday = iso === toIsoDate(new Date())
                const isSelected = iso === selectedDate
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : iso)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition border ${
                      isSelected
                        ? 'bg-amber text-bg border-amber'
                        : isToday
                          ? 'border-amber/60 text-ink'
                          : 'border-transparent text-ink hover:bg-surface2'
                    }`}
                  >
                    <span className="font-mono">{d.getDate()}</span>
                    <span className="flex gap-0.5">
                      {marks?.strength && <span className="w-1 h-1 rounded-full bg-steel" />}
                      {marks?.cardio && <span className="w-1 h-1 rounded-full bg-rust" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : selectedDate ? (
        <div>
          <p className="text-xs font-mono tracked text-muted mb-2 uppercase">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          {selectedWorkouts.length === 0 ? (
            <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-6 text-center">
              ไม่มีรายการวันนี้
            </p>
          ) : (
            <>
              {(() => {
                const summary = computeDaySummary(selectedWorkouts)
                return (
                  <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 mb-3 space-y-1.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
                      <span>🏋️ {summary.exerciseCount} Exercises</span>
                      {summary.totalSets > 0 && <span>🔥 {summary.totalSets} Sets</span>}
                      {summary.durationMin !== null && <span>⏱ {formatDuration(summary.durationMin)}</span>}
                    </div>
                    {summary.totalVolumeKg > 0 && (
                      <p className="text-sm text-ink">
                        🏋️ Volume {Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString()} {unit}
                      </p>
                    )}
                    {summary.muscleGroups.length > 0 && (
                      <p className="text-sm text-muted">💪 {summary.muscleGroups.join(' / ')}</p>
                    )}
                  </div>
                )
              })()}

              <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
                {selectedWorkouts.map((w) => (
                  <li key={w.id} className="tally-row px-4 py-3 text-sm text-ink flex items-center justify-between gap-2">
                    {w.type === 'strength' ? (
                      <>
                        <span className="min-w-0">
                          <span className="text-steel mr-1.5">🏋️</span>
                          {w.exercise_name} — {w.sets}×{w.reps} @ {format(w.weight_kg)}
                        </span>
                        <ProgressBadge badge={computeExerciseProgress(w, allWorkouts)} format={format} />
                      </>
                    ) : (
                      <span>
                        <span className="text-rusttext mr-1.5">🏃</span>
                        {w.cardio_type} — {w.distance_km}km / {w.duration_min}min
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <a href="/history" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-1">
          ดูประวัติทั้งหมด →
        </a>
      )}
        </>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm tracked uppercase text-muted">เป้าหมาย</h2>
          <button
            type="button"
            onClick={() => setShowGoalForm((v) => !v)}
            className="text-xs font-display tracked uppercase text-amber"
          >
            {showGoalForm ? 'ปิด' : '+ เพิ่มเป้าหมาย'}
          </button>
        </div>

        {showGoalForm && (
          <GoalForm
            latestWeight={latestMetric?.weight_kg ?? null}
            latestBodyFat={latestMetric?.body_fat_pct ?? null}
            allWorkouts={allWorkouts}
            onCreated={(g) => {
              setGoals((prev) => [g, ...prev])
              setShowGoalForm(false)
            }}
          />
        )}

        {goals.length === 0 ? (
          <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-6 text-center">
            ยังไม่มีเป้าหมาย ลองตั้งเป้าหมายแรกดู
          </p>
        ) : (
          <ul className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3 md:items-start">
            {goals.map((g) => {
              const progress = goalProgress(g)
              return (
                <li key={g.id} className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm ${g.status === 'done' ? 'text-muted line-through' : 'text-ink'}`}>
                        {g.title}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {goalTypeLabel(unit)[g.goal_type]}
                        {g.target_value !== null &&
                          ` · เป้าหมาย ${isWeightGoalType(g.goal_type) ? toDisplay(g.target_value) : g.target_value}`}
                        {g.target_date && ` · ${new Date(g.target_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleDone(g)}
                        className="text-xs text-muted hover:text-amber"
                      >
                        {g.status === 'done' ? 'เปิดใหม่' : 'สำเร็จ'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGoal(g.id)}
                        className="text-xs text-muted hover:text-rust"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                  {progress !== null && (
                    <div className="mt-2.5 h-1.5 rounded-full bg-surface2 overflow-hidden">
                      <div
                        className="h-full bg-amber transition-[width]"
                        style={{ width: `${Math.max(3, progress * 100)}%` }}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function GoalForm({
  latestWeight,
  latestBodyFat,
  allWorkouts,
  onCreated,
}: {
  latestWeight: number | null
  latestBodyFat: number | null
  allWorkouts: Workout[]
  onCreated: (g: Goal) => void
}) {
  const supabase = createClient()
  const { unit, toKg } = useWeightUnit()
  const [title, setTitle] = useState('')
  const [goalType, setGoalType] = useState<GoalType>('weight')
  const [targetValue, setTargetValue] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function currentBaseline(): number | null {
    if (goalType === 'weight') return latestWeight
    if (goalType === 'body_fat') return latestBodyFat
    if (goalType === 'strength_volume') {
      return allWorkouts
        .filter((w) => w.type === 'strength')
        .reduce((s, w) => s + (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0), 0)
    }
    if (goalType === 'cardio_distance') {
      return allWorkouts.filter((w) => w.type === 'cardio').reduce((s, w) => s + (w.distance_km ?? 0), 0)
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      return
    }
    setSaving(true)
    const payload = {
      user_id: user.id,
      title: title || goalTypeLabel(unit)[goalType],
      goal_type: goalType,
      target_value: targetValue ? (isWeightGoalType(goalType) ? toKg(Number(targetValue)) : Number(targetValue)) : null,
      starting_value: currentBaseline(),
      target_date: targetDate || null,
      status: 'active' as const,
    }
    const { data, error } = await supabase.from('goals').insert(payload).select().single()
    setSaving(false)
    if (error || !data) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    onCreated(data as Goal)
    setTitle('')
    setTargetValue('')
    setTargetDate('')
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="ชื่อเป้าหมาย เช่น ลดน้ำหนักก่อนหน้าร้อน"
        className="input"
      />
      <select
        value={goalType}
        onChange={(e) => setGoalType(e.target.value as GoalType)}
        className="input"
      >
        {(Object.keys(goalTypeLabel(unit)) as GoalType[]).map((t) => (
          <option key={t} value={t}>
            {goalTypeLabel(unit)[t]}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          placeholder="ค่าเป้าหมาย"
          className="input font-mono"
        />
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="input font-mono text-sm"
        />
      </div>
      {error && <p className="text-sm text-rusttext">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg font-display tracked uppercase py-3 text-sm bg-amber text-bg disabled:opacity-50"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'}
      </button>
    </form>
  )
}
