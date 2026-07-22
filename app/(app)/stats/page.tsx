'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { Workout } from '@/lib/types'
import { MUSCLE_GROUP_COLORS } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import {
  computeTodayTotals,
  estimateCaloriesToday,
  suggestNextPR,
  type PRSuggestion,
} from '@/lib/dashboardStats'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

const RANGE_DAYS = 180
const WEEKS_SHOWN = 8

function lastNDays(n: number) {
  const days: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function shortLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// ใช้ total_volume_kg ที่บันทึกไว้แม่นยำจากผลรวมทีละเซ็ตจริงก่อนเสมอ (ดูคอมเมนต์ที่ Workout.total_volume_kg
// ใน lib/types.ts) — สูตร sets*reps*weight_kg เป็นแค่ fallback สำหรับแถวเก่าที่ยังไม่มีค่านี้ ถ้าใช้สูตรนี้เป็น
// หลักจะผิดทันทีเมื่อแต่ละเซ็ตในเซสชันเดียวกันมีน้ำหนัก/reps ไม่เท่ากัน (เช่น drop set หรือเซ็ตที่ทำไม่ครบ)
// เพราะ sets/reps/weight_kg ที่เก็บในแถว workouts คือค่าของ "เซ็ตที่หนักที่สุด" เซ็ตเดียวเท่านั้น ไม่ใช่ค่าเฉลี่ย
function volumeOf(w: Workout) {
  if (w.total_volume_kg !== null && w.total_volume_kg !== undefined) return w.total_volume_kg
  return (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

// actualReps: จำนวน reps จริงรวมทุกเซ็ตของ workout นี้ (รวมจากตาราง workout_sets) — แม่นยำกว่า
// sets*reps (ซึ่งคูณเหมาว่าทุกเซ็ตมี reps เท่ากับเซ็ตที่หนักที่สุด) ถ้าไม่มีข้อมูล workout_sets
// (แถวเก่า) ให้ fallback ไปใช้สูตรเดิม
function repsOf(w: Workout, actualReps?: Map<string, number>) {
  const fromSets = actualReps?.get(w.id)
  if (fromSets !== undefined) return fromSets
  return (w.sets ?? 0) * (w.reps ?? 0)
}

export default function StatsPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const { data: exercises = [] } = useExerciseLibrary()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [actualRepsByWorkout, setActualRepsByWorkout] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prs, setPrs] = useState<{ name: string; weight: number; reps: number | null; date: string }[]>([])
  // น้ำหนักตัวล่าสุด — ใช้ประมาณแคลอรี่ (ดู estimateCaloriesToday) ถ้ายังไม่เคยบันทึกน้ำหนักตัว
  // เลย ให้ fallback เป็น DEFAULT_BODYWEIGHT_KG เหมือนที่ dashboardStats.ts ใช้ที่อื่น
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null)
  // คำแนะนำเป้าหมายครั้งถัดไปของท่าที่ฝึกล่าสุด (ย้ายมาจาก dashboard)
  const [nextPR, setNextPR] = useState<PRSuggestion | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const since = lastNDays(RANGE_DAYS)[0]
    const { data, error: err } = await supabase
      .from('workouts')
      .select('*')
      .gte('performed_at', since)
      .order('performed_at', { ascending: true })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const loaded = (data as Workout[]) ?? []
    setWorkouts(loaded)

    // ดึง reps จริงรายเซ็ตของ workout เวทเทรนนิ่งทั้งหมดในช่วงนี้มารวมกันทีเดียว (แทนการเดาจาก
    // เซ็ตที่หนักที่สุด) — ไม่ error ทั้งหน้าถ้าคิวรีนี้พลาด แค่ตกกลับไปใช้ค่าประมาณแทน
    const strengthIds = loaded.filter((w) => w.type === 'strength').map((w) => w.id)
    if (strengthIds.length > 0) {
      const { data: setsData } = await supabase.from('workout_sets').select('workout_id, reps').in('workout_id', strengthIds)
      const repsMap = new Map<string, number>()
      ;(setsData as { workout_id: string; reps: number | null }[] | null)?.forEach((s) => {
        repsMap.set(s.workout_id, (repsMap.get(s.workout_id) ?? 0) + (s.reps ?? 0))
      })
      setActualRepsByWorkout(repsMap)
    } else {
      setActualRepsByWorkout(new Map())
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    async function loadPRs() {
      const { data } = await supabase
        .from('workouts')
        .select('exercise_name, weight_kg, reps, performed_at')
        .eq('type', 'strength')
        .not('exercise_name', 'is', null)
        .not('weight_kg', 'is', null)
        .order('weight_kg', { ascending: false })
        .limit(500)
      const seen = new Set<string>()
      const top: { name: string; weight: number; reps: number | null; date: string }[] = []
      ;(data ?? []).forEach((row: { exercise_name: string | null; weight_kg: number | null; reps: number | null; performed_at: string }) => {
        const name = row.exercise_name
        if (!name || row.weight_kg === null || seen.has(name)) return
        seen.add(name)
        top.push({ name, weight: row.weight_kg, reps: row.reps, date: row.performed_at })
      })
      setPrs(top.slice(0, 6))
    }
    loadPRs()
  }, [supabase])

  useEffect(() => {
    async function loadBodyWeight() {
      const { data } = await supabase
        .from('body_metrics')
        .select('weight_kg')
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setBodyWeightKg((data as { weight_kg: number | null } | null)?.weight_kg ?? null)
    }
    loadBodyWeight()
  }, [supabase])

  useEffect(() => {
    async function loadNextPR() {
      // ท่าล่าสุดที่ฝึก (เรียงจาก performed_at ล่าสุด) — ใช้แนะนำเป้าหมายครั้งถัดไปของท่านั้น
      const { data } = await supabase
        .from('workouts')
        .select('exercise_name, performed_at')
        .eq('type', 'strength')
        .not('exercise_name', 'is', null)
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
      const lastExerciseName = (data?.[0] as { exercise_name: string | null } | undefined)?.exercise_name ?? null
      if (!lastExerciseName) {
        setNextPR(null)
        return
      }
      const { data: history } = await supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .eq('exercise_name', lastExerciseName)
      setNextPR(suggestNextPR(lastExerciseName, (history as Workout[]) ?? [], exercises))
    }
    loadNextPR()
  }, [supabase, exercises])

  const days28 = useMemo(() => lastNDays(28), [])

  const distanceByDay = useMemo(() => {
    const map = new Map<string, number>(days28.map((d) => [d, 0]))
    workouts
      .filter((w) => w.type === 'cardio')
      .forEach((w) => {
        map.set(w.performed_at, (map.get(w.performed_at) ?? 0) + (w.distance_km ?? 0))
      })
    return days28.map((d) => ({ date: d, label: shortLabel(d), value: Number((map.get(d) ?? 0).toFixed(1)) }))
  }, [workouts, days28])

  // ---- weekly volume: last WEEKS_SHOWN weeks, each bucket = 7 days ending today ----
  const weeklyVolume = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const buckets: { start: Date; end: Date; label: string; value: number }[] = []
    for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
      const end = new Date(now)
      end.setDate(now.getDate() - i * 7)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        value: 0,
      })
    }
    workouts
      .filter((w) => w.type === 'strength')
      .forEach((w) => {
        const d = new Date(w.performed_at + 'T00:00:00')
        const bucket = buckets.find((b) => d >= b.start && d <= b.end)
        if (bucket) bucket.value += volumeOf(w)
      })
    return buckets.map((b) => ({ label: b.label, value: Math.round(b.value) }))
  }, [workouts])

  const totals = useMemo(() => {
    const strengthWorkouts = workouts.filter((w) => w.type === 'strength')
    const totalVolume = strengthWorkouts.reduce((s, w) => s + volumeOf(w), 0)
    const totalReps = strengthWorkouts.reduce((s, w) => s + repsOf(w, actualRepsByWorkout), 0)
    const strengthCount = strengthWorkouts.length
    const cardioCount = workouts.filter((w) => w.type === 'cardio').length
    const totalDistance = workouts.reduce((s, w) => s + (w.distance_km ?? 0), 0)
    const activeDays = new Set(workouts.map((w) => w.performed_at)).size
    const thisWeekVolume = weeklyVolume.length > 0 ? weeklyVolume[weeklyVolume.length - 1].value : 0

    // Duration/Calories คำนวณเป็นรายวัน (เหมือนที่ dashboard เคยทำกับ "วันนี้") แล้วรวมข้าม
    // ทุกวันในช่วง — ใช้ computeTodayTotals/estimateCaloriesToday ตัวเดียวกัน ไม่ต้องคิดสูตรซ้ำ
    const byDay = new Map<string, Workout[]>()
    workouts.forEach((w) => {
      const bucket = byDay.get(w.performed_at) ?? []
      bucket.push(w)
      byDay.set(w.performed_at, bucket)
    })
    let totalDurationMin = 0
    let totalCalories = 0
    byDay.forEach((dayWorkouts) => {
      const dayTotals = computeTodayTotals(dayWorkouts)
      totalDurationMin += dayTotals.durationMin ?? 0
      totalCalories += estimateCaloriesToday(dayWorkouts, dayTotals.durationMin, bodyWeightKg)
    })
    const avgDurationMin = activeDays > 0 ? Math.round(totalDurationMin / activeDays) : 0

    return {
      totalVolume,
      totalReps,
      strengthCount,
      cardioCount,
      totalDistance,
      activeDays,
      thisWeekVolume,
      totalCalories,
      avgDurationMin,
    }
  }, [workouts, weeklyVolume, actualRepsByWorkout, bodyWeightKg])

  const muscleDistribution = useMemo(() => {
    const map = new Map<string, number>()
    workouts
      .filter((w) => w.type === 'strength')
      .forEach((w) => {
        const key = w.muscle_group || 'อื่นๆ'
        map.set(key, (map.get(key) ?? 0) + volumeOf(w))
      })
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    const max = entries.length > 0 ? entries[0][1] : 0
    return entries.map(([name, value]) => ({ name, value: Math.round(value), pct: max === 0 ? 0 : value / max }))
  }, [workouts])

  const topExercises = useMemo(() => {
    const map = new Map<string, number>()
    workouts
      .filter((w) => w.type === 'strength' && w.exercise_name)
      .forEach((w) => {
        map.set(w.exercise_name!, (map.get(w.exercise_name!) ?? 0) + 1)
      })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [workouts])

  const exerciseNames = useMemo(() => {
    const set = new Set<string>()
    workouts.filter((w) => w.type === 'strength' && w.exercise_name).forEach((w) => set.add(w.exercise_name!))
    return [...set].sort()
  }, [workouts])

  const [selectedExercise, setSelectedExercise] = useState('')

  useEffect(() => {
    if (!selectedExercise && exerciseNames.length > 0) setSelectedExercise(exerciseNames[0])
  }, [exerciseNames, selectedExercise])

  const oneRmTrend = useMemo(() => {
    if (!selectedExercise) return []
    return workouts
      .filter((w) => w.type === 'strength' && w.exercise_name === selectedExercise && w.weight_kg && w.reps)
      .map((w) => ({
        label: shortLabel(w.performed_at),
        value: toDisplay(Math.round(w.weight_kg! * (1 + (w.reps ?? 0) / 30) * 10) / 10),
      }))
  }, [workouts, selectedExercise, toDisplay])

  if (loading) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState title="โหลดข้อมูลสถิติไม่สำเร็จ" message={error} onRetry={load} />
  }

  if (workouts.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="font-display text-2xl tracked uppercase">สถิติ · {RANGE_DAYS} วันล่าสุด</h1>
        <EmptyState
          icon="📈"
          title="ยังไม่มีข้อมูลสถิติ"
          message="เริ่มบันทึกการออกกำลังกายครั้งแรก แล้วสถิติของคุณจะเริ่มขึ้นที่นี่"
          ctaHref="/log"
          ctaLabel="+ เริ่มบันทึก"
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl tracked uppercase">สถิติ · {RANGE_DAYS} วันล่าสุด</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Volume" value={Math.round(toDisplay(totals.totalVolume)).toLocaleString()} unit={unit} accent="steel" />
        <StatCard label="Total Reps" value={totals.totalReps.toLocaleString()} unit="ครั้ง" accent="amber" />
        <StatCard label="Volume สัปดาห์นี้" value={Math.round(toDisplay(totals.thisWeekVolume)).toLocaleString()} unit={unit} accent="rust" />
        <StatCard label="วันที่ออกกำลังกาย" value={totals.activeDays.toString()} unit="วัน" accent="moss" />
        <StatCard label="เซสชันเวท" value={totals.strengthCount.toString()} unit="ครั้ง" accent="moss" />
        <StatCard label="ระยะทางคาร์ดิโอรวม" value={totals.totalDistance.toFixed(1)} unit="กม." accent="rust" />
        <StatCard label="แคลอรี่ที่เผาผลาญรวม" value={totals.totalCalories.toLocaleString()} unit="kcal" accent="amber" />
        <StatCard label="เวลาเฉลี่ย/วัน" value={totals.avgDurationMin.toString()} unit="นาที" accent="steel" />
      </div>

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">
          Weekly Volume ({WEEKS_SHOWN} สัปดาห์ล่าสุด, {unit})
        </h2>
        <div className="h-48 bg-surface border border-line shadow-elevated rounded-lg p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyVolume.map((b) => ({ ...b, value: Math.round(toDisplay(b.value)) }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#2E333A" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9498A0', fontSize: 10 }}
                axisLine={{ stroke: '#2E333A' }}
                tickLine={false}
              />
              <YAxis tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                cursor={{ fill: 'rgba(108,140,168,0.08)' }}
                contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#9498A0' }}
                itemStyle={{ color: '#F3F0E8' }}
                formatter={(v: number) => [`${v} ${unit}`, 'วอลุ่ม']}
              />
              <Bar dataKey="value" fill="#6C8CA8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {muscleDistribution.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Muscle Distribution (วอลุ่มรวม)</h2>
          <div className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-3">
            {muscleDistribution.map((m) => (
              <div key={m.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink">{m.name}</span>
                  <span className="text-muted font-mono">{Math.round(toDisplay(m.value)).toLocaleString()} {unit}</span>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, m.pct * 100)}%`,
                      background: MUSCLE_GROUP_COLORS[m.name as keyof typeof MUSCLE_GROUP_COLORS] || '#9498A0',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">
          ระยะทางคาร์ดิโอ (กม. ต่อวัน, 28 วันล่าสุด)
        </h2>
        <div className="h-48 bg-surface border border-line shadow-elevated rounded-lg p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distanceByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#2E333A" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9498A0', fontSize: 10 }}
                interval={6}
                axisLine={{ stroke: '#2E333A' }}
                tickLine={false}
              />
              <YAxis tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                cursor={{ fill: 'rgba(193,80,58,0.08)' }}
                contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#9498A0' }}
                itemStyle={{ color: '#F3F0E8' }}
                formatter={(v: number) => [`${v} กม.`, 'ระยะทาง']}
              />
              <Bar dataKey="value" fill="#C1503A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {exerciseNames.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm tracked uppercase text-muted">Estimated 1RM Trend</h2>
            <select
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="bg-surface2 border border-line rounded-full text-xs px-3 py-1 text-ink outline-none"
            >
              {exerciseNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {oneRmTrend.length > 1 ? (
            <div className="h-44 bg-surface border border-line shadow-elevated rounded-lg p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={oneRmTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#2E333A" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={{ stroke: '#2E333A' }} tickLine={false} />
                  <YAxis tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9498A0' }}
                    itemStyle={{ color: '#F3F0E8' }}
                    formatter={(v: number) => [`${v} ${unit}`, 'Estimated 1RM']}
                  />
                  <Line type="monotone" dataKey="value" stroke="#C1503A" strokeWidth={2} dot={{ r: 2, fill: '#C1503A' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-6 text-center">
              บันทึกท่านี้อีกอย่างน้อย 2 ครั้งเพื่อดูแนวโน้ม
            </p>
          )}
          <p className="text-[11px] text-muted mt-2">คำนวณด้วยสูตร Epley: น้ำหนัก × (1 + reps/30) — เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง</p>
        </section>
      )}

      {nextPR && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">🎯 Next PR แนะนำ</h2>
          <a
            href={`/exercises/${encodeURIComponent(nextPR.exerciseName)}`}
            className="block rounded-lg border border-violet/25 shadow-glow px-5 py-5 active:bg-surface2 transition"
            style={
              {
                backgroundColor: '#1C1F24',
                '--glow-color': '#9C7CC426',
                '--glow-color-soft': '#9C7CC41A',
              } as React.CSSProperties & { '--glow-color'?: string; '--glow-color-soft'?: string }
            }
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-base tracked uppercase text-ink">{nextPR.exerciseName}</p>
              <span className="text-muted text-xs">โปรไฟล์ท่า →</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] tracked uppercase text-muted">Last</p>
                <p className="font-mono text-base text-muted">
                  {format(nextPR.lastWeight)} × {nextPR.lastReps}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracked uppercase text-muted">Target</p>
                <p className="font-mono text-base text-violet">
                  {format(nextPR.targetWeight)} × {nextPR.targetReps}
                </p>
              </div>
            </div>
          </a>
        </section>
      )}

      {prs.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">🏆 Personal Records (น้ำหนักสูงสุด)</h2>
          <ul className="rounded-lg bg-surface border border-violet/20 shadow-elevated overflow-hidden">
            {prs.map((p) => {
              const isNewPR = p.date === todayStr()
              return (
                <li key={p.name} className="tally-row">
                  <a
                    href={`/exercises/${encodeURIComponent(p.name)}`}
                    className="flex items-center justify-between px-4 py-3 active:bg-surface2 transition"
                  >
                    <span className="text-sm text-ink flex items-center gap-1.5">
                      {p.name}
                      {isNewPR && (
                        <span className="animate-pop-in text-[9px] font-display tracked uppercase text-bg bg-violet rounded-full px-1.5 py-0.5">
                          NEW
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm text-violet">
                      {format(p.weight)}{p.reps ? ` × ${p.reps}` : ''}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {topExercises.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">ท่ายอดฮิต</h2>
          <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
            {topExercises.map(([name, count]) => (
              <li key={name} className="tally-row">
                <a
                  href={`/exercises/${encodeURIComponent(name)}`}
                  className="flex items-center justify-between px-4 py-3 active:bg-surface2 transition"
                >
                  <span className="text-sm text-ink">{name}</span>
                  <span className="font-mono text-sm text-amber">{count}×</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a
        href="/history"
        className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
      >
        ดูประวัติทั้งหมด →
      </a>
      <a
        href="/achievements"
        className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
      >
        🏆 ดูความสำเร็จ →
      </a>
    </div>
  )
}

const STAT_ACCENT_TEXT = {
  amber: 'text-amber',
  steel: 'text-steel',
  rust: 'text-rusttext',
  moss: 'text-moss',
  violet: 'text-violet',
} as const

const STAT_ACCENT_HEX = {
  amber: '#E8A33D',
  steel: '#6C8CA8',
  rust: '#C1503A',
  moss: '#7A9B57',
  violet: '#9C7CC4',
} as const

function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent: 'amber' | 'steel' | 'rust' | 'moss' | 'violet'
}) {
  const hex = STAT_ACCENT_HEX[accent]
  const glowStyle: React.CSSProperties & { '--glow-color'?: string; '--glow-color-soft'?: string } = {
    borderColor: `${hex}33`,
    backgroundColor: '#1C1F24',
    '--glow-color': `${hex}26`,
    '--glow-color-soft': `${hex}1A`,
  }
  return (
    <div className="border shadow-glow rounded-lg px-4 py-3.5" style={glowStyle}>
      <p className="text-[11px] tracked uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-2xl tabular ${STAT_ACCENT_TEXT[accent]}`}>
        {value}
        <span className="text-xs text-muted ml-1">{unit}</span>
      </p>
    </div>
  )
}
