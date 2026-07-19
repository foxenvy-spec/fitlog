'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/weekdays'
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

  const { data: countByDate = {}, isLoading: loading } = useQuery({
    queryKey: ['workout-heatmap', monthKey],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('performed_at')
        .gte('performed_at', toIso(monthStart))
        .lte('performed_at', toIso(monthEnd))
      const counts: Record<string, number> = {}
      ;((data as { performed_at: string }[]) ?? []).forEach((r) => {
        counts[r.performed_at] = (counts[r.performed_at] ?? 0) + 1
      })
      return counts
    },
    // เก็บ cache ของเดือนที่เคยดูไว้ ไม่ต้องยิง query ซ้ำเวลาเลื่อนกลับไปกลับมา
    staleTime: 60_000,
  })

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
  }

  return (
    <div className="rounded-lg bg-surface border border-line overflow-hidden">
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

      <div className="px-4 pb-4 pt-2">
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
                const level = intensityLevel(countByDate[iso] ?? 0)
                return (
                  <div
                    key={di}
                    title={`${date.getDate()} ${monthLabel}${countByDate[iso] ? ` · ${countByDate[iso]} รายการ` : ''}`}
                    className={`aspect-square rounded-[4px] flex items-center justify-center text-[9px] font-mono ${
                      isFuture ? 'border border-dashed border-line text-muted/50' : 'text-bg'
                    } ${isToday ? 'ring-1 ring-amber ring-offset-1 ring-offset-surface' : ''}`}
                    style={!isFuture ? { backgroundColor: LEVEL_STYLE[level].bg } : undefined}
                  >
                    {level === 0 && !isFuture ? <span className="text-muted/60">{date.getDate()}</span> : null}
                  </div>
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
    </div>
  )
}
