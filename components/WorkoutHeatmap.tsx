'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/weekdays'
import { useWeightUnit } from './WeightUnitProvider'
import type { Workout, WorkoutSet } from '@/lib/types'
import Skeleton from './Skeleton'

// จ อ พ พฤ ศ ส อา — เริ่มจันทร์ ให้ตรงกับลำดับคอลัมน์ของกริด (Monday-first)
const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function toIso(d: Date) {
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

// ระดับความเข้ม 0-3 ตามจำนวนรายการที่บันทึกในวันนั้น (ไม่ใช่วอลุ่มจริง เป็นตัวแทนคร่าวๆ ของปริมาณการฝึก)
function intensityLevel(entryCount: number): 0 | 1 | 2 | 3 {
  if (entryCount <= 0) return 0
  if (entryCount <= 2) return 1
  if (entryCount <= 5) return 2
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

      return { counts, byDate, setsByWorkoutId }
    },
    // เก็บ cache ของเดือนที่เคยดูไว้ ไม่ต้องยิง query ซ้ำเวลาเลื่อนกลับไปกลับมา
    staleTime: 60_000,
  })
  const countByDate = data?.counts ?? {}
  const byDate = data?.byDate ?? {}
  const setsByWorkoutId = data?.setsByWorkoutId ?? {}
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { format } = useWeightUnit()

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
    setExpandedId(null)
  }

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

      <div className="px-4 pb-4 pt-2 flex flex-col lg:flex-row lg:items-start gap-4">
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
                  const level = intensityLevel(entryCount)
                  const clickable = entryCount > 0
                  return (
                    <button
                      key={di}
                      type="button"
                      disabled={!clickable}
                      onClick={() => {
                        setSelectedDate(iso === selectedDate ? null : iso)
                        setExpandedId(null)
                      }}
                      title={`${date.getDate()} ${monthLabel}${entryCount ? ` · ${entryCount} รายการ` : ''}`}
                      className={`aspect-square rounded-[4px] flex items-center justify-center text-[9px] font-mono transition ${
                        isFuture ? 'border border-dashed border-line text-muted/50' : 'text-bg'
                      } ${isToday ? 'ring-1 ring-amber ring-offset-1 ring-offset-surface' : ''} ${
                        selectedDate === iso ? 'ring-2 ring-steel ring-offset-1 ring-offset-surface' : ''
                      } ${clickable ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
                      style={!isFuture ? { backgroundColor: LEVEL_STYLE[level].bg } : undefined}
                    >
                      {level === 0 && !isFuture ? <span className="text-muted/60">{date.getDate()}</span> : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-1.5 mt-3">
            <span className="text-[9px] text-muted">น้อย</span>
            {[0, 1, 2, 3].map((lv) => (
              <span key={lv} className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: LEVEL_STYLE[lv].bg }} />
            ))}
            <span className="text-[9px] text-muted">มาก</span>
          </div>
        </div>

        {/* detail panel — sits beside the calendar on wide screens (lg:), stacks below it
            otherwise; only appears once a trained day is clicked so it doesn't take up
            space (or look empty) the rest of the time */}
        {selectedDate && (
          <div className="flex-1 min-w-0 lg:border-l lg:border-line lg:pl-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-display tracked uppercase text-ink">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                aria-label="ปิด"
                className="text-muted hover:text-ink text-xs"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-2">
              {(byDate[selectedDate] ?? []).map((w) => {
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
                const expanded = expandedId === w.id
                return (
                  <li key={w.id} className="rounded-md bg-surface2 overflow-hidden">
                    <button
                      type="button"
                      disabled={!hasSets}
                      onClick={() => setExpandedId(expanded ? null : w.id)}
                      className={`w-full text-left px-3 py-2 text-xs ${hasSets ? 'cursor-pointer hover:bg-surface2/60' : 'cursor-default'}`}
                    >
                      {w.type === 'strength' ? (
                        <>
                          <span className="text-steel font-display tracked uppercase text-[10px] mr-2">STR</span>
                          <span className="text-ink">{w.exercise_name ?? '—'}</span>
                          <span className="text-muted">
                            {' '}
                            — {w.sets}×{w.reps} @ {format(w.weight_kg)}
                          </span>
                          {hasSets && <span className="text-muted ml-1">{expanded ? '▲' : '▼'}</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-rusttext font-display tracked uppercase text-[10px] mr-2">CAR</span>
                          <span className="text-ink">{w.cardio_type}</span>
                          <span className="text-muted">
                            {' '}
                            — {w.distance_km}km / {w.duration_min}min
                          </span>
                        </>
                      )}
                      {w.notes && <p className="text-muted mt-0.5">{w.notes}</p>}
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
