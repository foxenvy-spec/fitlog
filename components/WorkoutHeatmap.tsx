'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/weekdays'
import { useWeightUnit } from './WeightUnitProvider'
import type { BodyMetric, Workout, WorkoutSet } from '@/lib/types'
import { computeDaySummary, computeExerciseProgress, countDayPRs, formatDuration, workoutVolumeKg } from '@/lib/workoutDisplay'
import { HEATMAP_METRIC_LABEL, loadHeatmapMetric, saveHeatmapMetric, type HeatmapMetric } from '@/lib/heatmapPrefs'
import ExerciseProgressBadge from './ExerciseProgressBadge'
import Skeleton from './Skeleton'

// จ อ พ พฤ ศ ส อา — เริ่มจันทร์ ให้ตรงกับลำดับคอลัมน์ของกริด (Monday-first)
const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function toIso(d: Date) {
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

// ระดับความเข้ม 0-3 เทียบกับค่าสูงสุดที่เจอในเดือนนั้น (สัดส่วนกับ max แทนเกณฑ์ตายตัว
// เพราะ metric ต่างกัน — volume/calories หลักพัน vs sets หลักสิบ — ใช้เกณฑ์เดียวกันไม่ได้)
function intensityLevel(value: number, max: number): 0 | 1 | 2 | 3 {
  if (value <= 0 || max <= 0) return 0
  const ratio = value / max
  if (ratio <= 1 / 3) return 1
  if (ratio <= 2 / 3) return 2
  return 3
}

const LEVEL_STYLE: Record<number, { bg: string }> = {
  0: { bg: '#23272D' },
  1: { bg: '#E8A33D40' },
  2: { bg: '#E8A33D90' },
  3: { bg: '#E8A33D' },
}

export default function WorkoutHeatmap() {
  const supabase = createClient()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const monthStart = cursor
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor])
  const monthKey = `${cursor.getFullYear()}-${cursor.getMonth()}`

  const { data, isLoading: loading } = useQuery({
    queryKey: ['workout-heatmap', monthKey],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .gte('performed_at', toIso(monthStart))
        .lte('performed_at', toIso(monthEnd))
        .order('created_at')
      const rows = (data as Workout[]) ?? []
      const counts: Record<string, number> = {}
      const byDate: Record<string, Workout[]> = {}
      rows.forEach((r) => {
        counts[r.performed_at] = (counts[r.performed_at] ?? 0) + 1
        ;(byDate[r.performed_at] ??= []).push(r)
      })

      // ดึงรายละเอียดทีละเซ็ต (reps/น้ำหนักต่อเซ็ต) ของทุกท่าเวทในเดือนนี้มาในทีเดียว
      // กันไม่ให้ต้องยิง query แยกทุกครั้งที่กดดูแต่ละท่า
      const strengthIds = rows.filter((r) => r.type === 'strength').map((r) => r.id)
      const setsByWorkoutId: Record<string, WorkoutSet[]> = {}
      if (strengthIds.length > 0) {
        const { data: setRows } = await supabase
          .from('workout_sets')
          .select('*')
          .in('workout_id', strengthIds)
          .order('set_number')
        ;((setRows as WorkoutSet[]) ?? []).forEach((s) => {
          ;(setsByWorkoutId[s.workout_id] ??= []).push(s)
        })
      }

      // ดึง body_metrics ของเดือนนี้มาด้วย ใช้ทำ marker ❤️ Body Weight / 📏 Measurement บนปฏิทิน
      const { data: metricRows } = await supabase
        .from('body_metrics')
        .select('*')
        .gte('measured_at', toIso(monthStart))
        .lte('measured_at', toIso(monthEnd))
      const metricsByDate: Record<string, BodyMetric[]> = {}
      ;((metricRows as BodyMetric[]) ?? []).forEach((m) => {
        ;(metricsByDate[m.measured_at] ??= []).push(m)
      })

      return { counts, byDate, setsByWorkoutId, metricsByDate }
    },
    // เก็บ cache ของเดือนที่เคยดูไว้ ไม่ต้องยิง query ซ้ำเวลาเลื่อนกลับไปกลับมา
    staleTime: 60_000,
  })
  const countByDate = data?.counts ?? {}
  const byDate = data?.byDate ?? {}
  const setsByWorkoutId = data?.setsByWorkoutId ?? {}
  const metricsByDate = data?.metricsByDate ?? {}

  // ประวัติย้อนหลังกว้างกว่าหนึ่งเดือน — ใช้เทียบ PR/best volume/แนวโน้มของแต่ละท่า ไม่ผูกกับเดือนที่กำลังดูอยู่
  // (โหลดครั้งเดียว cache ไว้นาน ไม่ต้องยิงซ้ำทุกครั้งที่เปลี่ยนเดือนหรือเปิดดูวันใหม่)
  const { data: historyData } = useQuery({
    queryKey: ['workout-progress-history'],
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - 365)
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .gte('performed_at', toIso(since))
      return (data as Workout[]) ?? []
    },
    staleTime: 5 * 60_000,
  })
  const progressHistory = historyData ?? []
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [metric, setMetric] = useState<HeatmapMetric>(() => loadHeatmapMetric())
  const [searchQuery, setSearchQuery] = useState('')
  const { unit, toDisplay, format } = useWeightUnit()

  // ค้นหาประวัติ (365 วันย้อนหลัง จาก progressHistory) ด้วยชื่อท่า — เห็นผลทันทีไม่ต้องกด enter
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return progressHistory
      .filter((w) => w.exercise_name?.toLowerCase().includes(q))
      .sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1))
      .slice(0, 8)
  }, [searchQuery, progressHistory])

  // กดผลลัพธ์จากช่องค้นหา — เลื่อนปฏิทินไปเดือนนั้นแล้วเปิดวันนั้นให้เลย
  function jumpToWorkout(w: Workout) {
    const d = new Date(w.performed_at + 'T00:00:00')
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelectedDate(w.performed_at)
    setExpandedIds(new Set())
    setSearchQuery('')
  }

  function chooseMetric(next: HeatmapMetric) {
    setMetric(next)
    saveHeatmapMetric(next)
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const weeks = useMemo(() => {
    const leadingBlanks = (monthStart.getDay() + 6) % 7 // Monday-first
    const daysInMonth = monthEnd.getDate()
    const cells: (Date | null)[] = Array(leadingBlanks).fill(null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    }
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [monthStart, monthEnd, cursor])

  const today = todayStr()
  const daysTrained = Object.keys(countByDate).length
  const daysElapsed = useMemo(() => {
    const isCurrentMonth = cursor.getFullYear() === new Date().getFullYear() && cursor.getMonth() === new Date().getMonth()
    return isCurrentMonth ? new Date().getDate() : monthEnd.getDate()
  }, [cursor, monthEnd])

  const monthLabel = cursor.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  function shiftMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
    setSelectedDate(null)
    setExpandedIds(new Set())
  }

  // ค่า metric ที่เลือกของวันหนึ่งๆ จาก DaySummary — ใช้ทั้งกำหนดสีเซลล์และโชว์ใน tooltip
  function metricValue(summary: ReturnType<typeof computeDaySummary>): number {
    switch (metric) {
      case 'volume':
        return summary.totalVolumeKg
      case 'duration':
        return summary.durationMin ?? 0
      case 'calories':
        return summary.caloriesKcal
      case 'sets':
        return summary.totalSets
    }
  }

  // ค่าสูงสุดของ metric ที่เลือกในเดือนที่กำลังดู — ใช้ปรับสเกลสี ให้เดือนที่ฝึกหนักหรือเบา
  // ต่างกันมากก็ยังเห็นความเข้ม-อ่อนสัมพัทธ์กันได้ชัดเจน แทนที่จะใช้เกณฑ์ตายตัว
  const maxMetricValue = useMemo(() => {
    let max = 0
    Object.keys(byDate).forEach((iso) => {
      const v = metricValue(computeDaySummary(byDate[iso] ?? []))
      if (v > max) max = v
    })
    return max
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, metric])

  function metricDisplay(value: number): string {
    switch (metric) {
      case 'volume':
        return `${Math.round(toDisplay(value)).toLocaleString()} ${unit}`
      case 'duration':
        return formatDuration(value)
      case 'calories':
        return `${Math.round(value).toLocaleString()} kcal`
      case 'sets':
        return `${value} เซ็ต`
    }
  }

  // สรุป volume ต่อกลุ่มกล้ามเนื้อของวันหนึ่งๆ — ใช้ทำแถบ Muscle Group Summary ด้านบนของแผงรายละเอียด
  // เรียงจากมากไปน้อยเพื่อให้เห็นทันทีว่าวันนั้น "เน้น" กล้ามเนื้อส่วนไหน
  function muscleGroupVolumes(dayWorkouts: Workout[]): { group: string; volumeKg: number }[] {
    const totals: Record<string, number> = {}
    dayWorkouts
      .filter((w) => w.type === 'strength' && w.muscle_group)
      .forEach((w) => {
        const g = w.muscle_group as string
        totals[g] = (totals[g] ?? 0) + workoutVolumeKg(w)
      })
    return Object.entries(totals)
      .map(([group, volumeKg]) => ({ group, volumeKg }))
      .sort((a, b) => b.volumeKg - a.volumeKg)
  }

  // รายการ id ของท่าเวทในวันที่เลือกที่มีเซ็ตให้กางดูได้ — ใช้ตอนกด Expand All ให้กางพร้อมกันทีเดียว
  const expandableWorkoutIds = useMemo(() => {
    const dayWorkouts = selectedDate ? (byDate[selectedDate] ?? []) : []
    return dayWorkouts
      .filter((w) => {
        const realSets = setsByWorkoutId[w.id] ?? []
        return w.type === 'strength' && (realSets.length > 0 || !!w.sets)
      })
      .map((w) => w.id)
  }, [selectedDate, byDate, setsByWorkoutId])

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-1 flex items-center justify-between">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Consistency</p>
          {loading ? (
            <Skeleton className="h-5 w-40 mt-1" />
          ) : (
            <p className="font-display text-base tracked uppercase text-ink mt-0.5">
              {`ซ้อม ${daysTrained} วัน`}
              <span className="text-muted text-xs normal-case tracking-normal"> / {daysElapsed} วัน · {monthLabel}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="เดือนก่อนหน้า"
            className="w-7 h-7 rounded-md border border-line text-muted hover:text-amber hover:border-amber/50 transition flex items-center justify-center text-xs"
          >
            ‹
          </button>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="เดือนถัดไป"
            disabled={cursor.getFullYear() === new Date().getFullYear() && cursor.getMonth() === new Date().getMonth()}
            className="w-7 h-7 rounded-md border border-line text-muted hover:text-amber hover:border-amber/50 transition flex items-center justify-center text-xs disabled:opacity-30 disabled:hover:text-muted disabled:hover:border-line"
          >
            ›
          </button>
        </div>
      </div>

      <div className="px-4 pt-1 pb-2 relative">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted pointer-events-none">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Exercise"
            className="w-full rounded-md bg-surface2 border border-line pl-7 pr-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-amber/50"
          />
        </div>
        {searchQuery.trim() && (
          <div className="absolute left-4 right-4 mt-1 rounded-md bg-surface2 border border-line shadow-elevated z-10 overflow-hidden">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">ไม่พบท่านี้ในประวัติ 365 วันที่ผ่านมา</p>
            ) : (
              searchResults.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => jumpToWorkout(w)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-bg/40 transition flex items-center justify-between gap-2"
                >
                  <span className="min-w-0">
                    <span className="text-ink">{w.exercise_name}</span>
                    <span className="text-muted">
                      {' '}
                      — {w.sets}×{w.reps} @ {format(w.weight_kg)}
                    </span>
                  </span>
                  <span className="text-muted shrink-0 font-mono text-[10px]">
                    {new Date(w.performed_at + 'T00:00:00').toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-1 pb-2 flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] tracked uppercase text-muted mr-0.5">Heatmap by</span>
        {(Object.keys(HEATMAP_METRIC_LABEL) as HeatmapMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => chooseMetric(m)}
            className={`px-2 py-0.5 rounded-full text-[10px] tracked uppercase border transition ${
              metric === m
                ? 'bg-amber/15 border-amber/50 text-amber'
                : 'border-line text-muted hover:text-ink hover:border-ink/30'
            }`}
          >
            {HEATMAP_METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="px-4 pb-4 pt-0 flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="max-w-md w-full shrink-0">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="text-center text-[9px] tracked uppercase text-muted">
                {w}
              </span>
            ))}
          </div>

          <div className="space-y-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((date, di) => {
                  if (!date) return <div key={di} className="aspect-square rounded-[4px]" />
                  if (loading) return <Skeleton key={di} className="aspect-square" />
                  const iso = toIso(date)
                  const isFuture = iso > today
                  const isToday = iso === today
                  const entryCount = countByDate[iso] ?? 0
                  const dayWorkouts = byDate[iso] ?? []
                  const summary = computeDaySummary(dayWorkouts)
                  const value = metricValue(summary)
                  const level = intensityLevel(value, maxMetricValue)
                  const clickable = entryCount > 0

                  // marker เล็กๆ แบบ GitHub contributions — บอกเหตุการณ์พิเศษของวันนั้นนอกเหนือจากสี
                  const dayMetrics = metricsByDate[iso] ?? []
                  const hasPR = countDayPRs(dayWorkouts, progressHistory) > 0
                  const hasBodyWeight = dayMetrics.some((m) => m.weight_kg !== null)
                  const hasMeasurement = dayMetrics.some(
                    (m) => m.waist_cm !== null || m.chest_cm !== null || m.hip_cm !== null
                  )
                  const hasCardio = dayWorkouts.some((w) => w.type === 'cardio')
                  const markers = [
                    hasPR && '🏆',
                    hasBodyWeight && '❤️',
                    hasMeasurement && '📏',
                    hasCardio && '🏃',
                  ].filter((m): m is string => !!m)

                  return (
                    <button
                      key={di}
                      type="button"
                      disabled={!clickable}
                      onClick={() => {
                        setSelectedDate(iso === selectedDate ? null : iso)
                        setExpandedIds(new Set())
                      }}
                      title={`${date.getDate()} ${monthLabel}${entryCount ? ` · ${metricDisplay(value)}` : ''}`}
                      className={`relative aspect-square rounded-[4px] flex items-center justify-center text-[9px] font-mono transition ${
                        isFuture ? 'border border-dashed border-line text-muted/50' : 'text-bg'
                      } ${isToday ? 'ring-1 ring-amber ring-offset-1 ring-offset-surface' : ''} ${
                        selectedDate === iso ? 'ring-2 ring-steel ring-offset-1 ring-offset-surface' : ''
                      } ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
                      style={!isFuture ? { backgroundColor: LEVEL_STYLE[level].bg } : undefined}
                    >
                      {level === 0 && !isFuture ? <span className="text-muted/60">{date.getDate()}</span> : null}
                      {markers.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex text-[7px] leading-none drop-shadow-sm">
                          {markers.slice(0, 3).map((m, mi) => (
                            <span key={mi} className={mi > 0 ? '-ml-1' : ''}>
                              {m}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] text-muted flex-wrap">
              <span>🏆 PR</span>
              <span>❤️ น้ำหนักตัว</span>
              <span>📏 วัดรอบตัว</span>
              <span>🏃 Cardio</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">
                สี = <span className="text-ink">{HEATMAP_METRIC_LABEL[metric]}</span> · น้อย
              </span>
              {[0, 1, 2, 3].map((lv) => (
                <span key={lv} className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: LEVEL_STYLE[lv].bg }} />
              ))}
              <span className="text-[10px] text-muted">มาก</span>
            </div>
          </div>
        </div>

        {/* detail panel — sits beside the calendar on wide screens (lg:), stacks below it
            otherwise; only appears once a trained day is clicked so it doesn't take up
            space (or look empty) the rest of the time */}
        {selectedDate && (
          <div className="flex-1 min-w-0 lg:border-l lg:border-line lg:pl-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-xs font-display tracked uppercase text-ink shrink-0">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <div className="flex items-center gap-2">
                {expandableWorkoutIds.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] tracked uppercase">
                    <button
                      type="button"
                      onClick={() => setExpandedIds(new Set(expandableWorkoutIds))}
                      className="text-muted hover:text-amber transition"
                    >
                      Expand All
                    </button>
                    <span className="text-muted/40">/</span>
                    <button
                      type="button"
                      onClick={() => setExpandedIds(new Set())}
                      className="text-muted hover:text-amber transition"
                    >
                      Collapse All
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  aria-label="ปิด"
                  className="text-muted hover:text-ink text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
            <ul className="space-y-2">
              {(() => {
                const dayWorkouts = byDate[selectedDate] ?? []
                const summary = computeDaySummary(dayWorkouts)
                const groupVolumes = muscleGroupVolumes(dayWorkouts)
                const maxGroupVolume = groupVolumes.length > 0 ? groupVolumes[0].volumeKg : 0
                return (
                  <>
                    {groupVolumes.length > 0 && (
                      <div className="rounded-md bg-surface2 px-3 py-2.5 space-y-1.5 text-xs">
                        <p className="text-[9px] tracked uppercase text-muted">Muscle Group Summary</p>
                        {groupVolumes.map(({ group, volumeKg }) => (
                          <div key={group} className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-ink text-[11px] truncate">{group}</span>
                            <div className="flex-1 h-2 rounded-full bg-bg/60 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber"
                                style={{ width: `${Math.max(6, (volumeKg / maxGroupVolume) * 100)}%` }}
                              />
                            </div>
                            <span className="w-16 shrink-0 text-right font-mono text-muted text-[10px] tabular">
                              {Math.round(toDisplay(volumeKg)).toLocaleString()} {unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="rounded-md bg-surface2 px-3 py-2.5 space-y-1 text-xs">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-ink">
                        <span>🏋️ {summary.exerciseCount} Exercises</span>
                        {summary.totalSets > 0 && <span>🔥 {summary.totalSets} Sets</span>}
                        {summary.durationMin !== null && <span>⏱ {formatDuration(summary.durationMin)}</span>}
                      </div>
                      {summary.totalVolumeKg > 0 && (
                        <p className="text-ink">
                          🏋️ Volume {Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString()} {unit}
                        </p>
                      )}
                      {summary.muscleGroups.length > 0 && <p className="text-muted">💪 {summary.muscleGroups.join(' / ')}</p>}
                    </div>
                  </>
                )
              })()}
              {(byDate[selectedDate] ?? []).map((w, wi, arr) => {
                const realSets = setsByWorkoutId[w.id] ?? []
                // session/program flow เก็บ reps/น้ำหนักเป็นค่าเดียวต่อท่า ไม่มี workout_sets จริง —
                // จำลองเป็นหลายเซ็ตค่าเท่ากันจาก sets/reps/weight_kg แทน (เหมือนที่หน้า /log ทำกับ
                // แถวเก่าก่อนมี workout_sets) อย่างน้อยยังกดดูจำนวนเซ็ตได้ แม้ตัวเลขจะซ้ำกันทุกเซ็ตก็ตาม
                const displaySets =
                  realSets.length > 0
                    ? realSets
                    : w.type === 'strength' && w.sets
                      ? Array.from({ length: w.sets }, (_, i) => ({
                          id: `${w.id}-synthetic-${i}`,
                          set_number: i + 1,
                          reps: w.reps,
                          weight_kg: w.weight_kg,
                        }))
                      : []
                const hasSets = w.type === 'strength' && displaySets.length > 0
                const expanded = expandedIds.has(w.id)
                const timeLabel = new Date(w.created_at).toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
                const isLast = wi === arr.length - 1
                return (
                  // Timeline — เวลาที่บันทึกจริงต่อท่า ต่อกันด้วยลูกศร ให้เห็นลำดับของเซสชันจริง
                  // แทนที่จะเป็นแค่รายการเรียงเฉยๆ
                  <li key={w.id} className="flex gap-2">
                    <div className="w-11 shrink-0 flex flex-col items-center pt-2.5">
                      <span className="text-[9px] font-mono text-steel tabular">{timeLabel}</span>
                      {!isLast && <span className="text-muted/30 text-[10px] leading-none mt-1">↓</span>}
                    </div>
                    <div className="flex-1 min-w-0 rounded-md bg-surface2 overflow-hidden">
                      <button
                        type="button"
                        disabled={!hasSets}
                        onClick={() => toggleExpanded(w.id)}
                        className={`w-full text-left px-3 py-2 text-xs ${hasSets ? 'cursor-pointer hover:bg-surface2/60' : 'cursor-default'}`}
                      >
                        {w.type === 'strength' ? (
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="mr-1.5">🏋️</span>
                              <span className="text-ink text-[13px] font-medium">{w.exercise_name ?? '—'}</span>
                              <span className="font-mono font-bold text-ink">
                                {' '}
                                {w.sets}×{w.reps} @ {format(w.weight_kg)}
                              </span>
                              {hasSets && <span className="text-muted ml-1">{expanded ? '▲' : '▼'}</span>}
                              {w.muscle_group && <p className="text-[10px] text-steel mt-0.5">{w.muscle_group}</p>}
                            </span>
                            <ExerciseProgressBadge progress={computeExerciseProgress(w, progressHistory)} format={format} />
                          </div>
                        ) : (
                          <>
                            <span className="mr-1.5">🏃</span>
                            <span className="text-ink text-[13px] font-medium">{w.cardio_type}</span>
                            <span className="font-mono font-bold text-ink">
                              {' '}
                              {w.distance_km}km / {w.duration_min}min
                            </span>
                          </>
                        )}
                        {w.notes && <p className="text-[10px] text-muted/80 mt-0.5 truncate">{w.notes}</p>}
                      </button>

                      {expanded && (
                        <div className="px-3 pb-2.5 pt-0.5 grid grid-cols-3 gap-1.5">
                          {displaySets.map((s) => (
                            <div key={s.id} className="rounded bg-bg/40 px-2 py-1.5 text-center">
                              <p className="text-[9px] tracked uppercase text-muted">เซ็ต {s.set_number}</p>
                              <p className="text-[11px] font-mono text-ink mt-0.5">
                                {s.reps ?? '—'} × {s.weight_kg !== null ? format(s.weight_kg) : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
