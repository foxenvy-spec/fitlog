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
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

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

function volumeOf(w: Workout) {
  return (w.sets ?? 0) * (w.reps ?? 0) * (w.weight_kg ?? 0)
}

function repsOf(w: Workout) {
  return (w.sets ?? 0) * (w.reps ?? 0)
}

export default function StatsPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prs, setPrs] = useState<{ name: string; weight: number; reps: number | null; date: string }[]>([])

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
    setWorkouts((data as Workout[]) ?? [])
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
    const totalReps = strengthWorkouts.reduce((s, w) => s + repsOf(w), 0)
    const strengthCount = strengthWorkouts.length
    const cardioCount = workouts.filter((w) => w.type === 'cardio').length
    const totalDistance = workouts.reduce((s, w) => s + (w.distance_km ?? 0), 0)
    const activeDays = new Set(workouts.map((w) => w.performed_at)).size
    const thisWeekVolume = weeklyVolume.length > 0 ? weeklyVolume[weeklyVolume.length - 1].value : 0
    return { totalVolume, totalReps, strengthCount, cardioCount, totalDistance, activeDays, thisWeekVolume }
  }, [workouts, weeklyVolume])

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

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl tracked uppercase">สถิติ · {RANGE_DAYS} วันล่าสุด</h1>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Volume" value={Math.round(toDisplay(totals.totalVolume)).toLocaleString()} unit={unit} accent="steel" />
        <StatCard label="Total Reps" value={totals.totalReps.toLocaleString()} unit="ครั้ง" accent="amber" />
        <StatCard label="Volume สัปดาห์นี้" value={Math.round(toDisplay(totals.thisWeekVolume)).toLocaleString()} unit={unit} accent="rust" />
        <StatCard label="วันที่ออกกำลังกาย" value={totals.activeDays.toString()} unit="วัน" accent="amber" />
        <StatCard label="เซสชันเวท" value={totals.strengthCount.toString()} unit="ครั้ง" accent="steel" />
        <StatCard label="ระยะทางคาร์ดิโอรวม" value={totals.totalDistance.toFixed(1)} unit="กม." accent="rust" />
      </div>

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">
          Weekly Volume ({WEEKS_SHOWN} สัปดาห์ล่าสุด, {unit})
        </h2>
        <div className="h-48 bg-surface border border-line rounded-lg p-3">
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
          <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
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
        <div className="h-48 bg-surface border border-line rounded-lg p-3">
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
            <div className="h-44 bg-surface border border-line rounded-lg p-3">
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
            <p className="text-sm text-muted bg-surface border border-line rounded-lg px-4 py-6 text-center">
              บันทึกท่านี้อีกอย่างน้อย 2 ครั้งเพื่อดูแนวโน้ม
            </p>
          )}
          <p className="text-[11px] text-muted mt-2">คำนวณด้วยสูตร Epley: น้ำหนัก × (1 + reps/30) — เป็นค่าประมาณ ไม่ใช่ค่าวัดจริง</p>
        </section>
      )}

      {prs.length > 0 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">🏆 Personal Records (น้ำหนักสูงสุด)</h2>
          <ul className="rounded-lg bg-surface border border-line overflow-hidden">
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
                        <span className="animate-pop-in text-[9px] font-display tracked uppercase text-bg bg-amber rounded-full px-1.5 py-0.5">
                          NEW
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm text-amber">
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
          <ul className="rounded-lg bg-surface border border-line overflow-hidden">
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

function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent: 'amber' | 'steel' | 'rust'
}) {
  const color = { amber: 'text-amber', steel: 'text-steel', rust: 'text-rusttext' }[accent]
  return (
    <div className="bg-surface border border-line rounded-lg px-4 py-3.5">
      <p className="text-[11px] tracked uppercase text-muted mb-1">{label}</p>
      <p className={`font-mono text-2xl tabular ${color}`}>
        {value}
        <span className="text-xs text-muted ml-1">{unit}</span>
      </p>
    </div>
  )
}
