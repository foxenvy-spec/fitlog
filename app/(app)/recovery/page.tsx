'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, type MuscleGroup } from '@/lib/muscle-groups'
import {
  computeRecoveryPct,
  recoveryStatusColor,
  computeRecoveryReadyInHours,
  RECOVERY_WINDOW_DAYS,
  relativeDayLabel,
  suggestMuscleToTrain,
} from '@/lib/dashboardStats'
import Skeleton from '@/components/Skeleton'
import AnimatedBarFill from '@/components/AnimatedBarFill'
import ErrorState from '@/components/ErrorState'

interface MuscleRow {
  mg: MuscleGroup
  lastTrained: string | null
  pct: number
}

// เกณฑ์เดียวกับ recoveryStatusColor: 0-40% แดง (กำลังพักฟื้น), 41-75% เหลือง (ใกล้พร้อมแล้ว), 76-100% เขียว (พร้อมฝึกแล้ว)
function statusLabel(pct: number) {
  if (pct >= 76) return { text: 'พร้อมฝึกแล้ว', color: 'text-moss' }
  if (pct >= 41) return { text: 'ใกล้พร้อมแล้ว', color: 'text-amber' }
  return { text: 'กำลังพักฟื้น', color: 'text-rusttext' }
}

export default function RecoveryPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MuscleRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, performed_at')
        .eq('type', 'strength')
        .order('performed_at', { ascending: false })
        .limit(2000)

      const strengthRows = (data as { muscle_group: string | null; performed_at: string }[]) ?? []
      const lastTrainedByMuscle: Record<string, string> = {}
      strengthRows.forEach((r) => {
        if (!r.muscle_group) return
        if (!lastTrainedByMuscle[r.muscle_group]) lastTrainedByMuscle[r.muscle_group] = r.performed_at
      })

      const built: MuscleRow[] = MUSCLE_GROUPS.map((mg) => {
        const lastTrained = lastTrainedByMuscle[mg] ?? null
        return { mg, lastTrained, pct: computeRecoveryPct(lastTrained, mg) }
      }).sort((a, b) => a.pct - b.pct)

      setRows(built)
    } catch (err) {
      console.error('Recovery load failed', err)
      Sentry.captureException(err, { tags: { source: 'recovery-page' } })
      setError('ไม่สามารถโหลดข้อมูล Recovery ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">Recovery</h1>
        <p className="text-xs text-muted mt-0.5">
          ประมาณการจากวันที่ฝึกล่าสุดของแต่ละกลุ่มกล้ามเนื้อ ไม่ใช่ค่าทางสรีรวิทยาที่แม่นยำรายบุคคล
        </p>
      </div>

      {!loading && !error && rows.length > 0 && (() => {
        const recoveryPctMap: Record<string, number> = {}
        rows.forEach((r) => {
          recoveryPctMap[r.mg] = r.pct
        })
        const recommendation = suggestMuscleToTrain(recoveryPctMap)
        if (!recommendation) return null
        const recColor = recoveryStatusColor(recommendation.pct)
        return (
          <div
            className="flex items-center gap-2.5 rounded-lg px-4 py-3"
            style={{ backgroundColor: recColor + '1A' }}
          >
            <span className="text-lg">💪</span>
            <p className="text-sm text-ink">
              วันนี้ควรเล่น{' '}
              <span className="font-display tracked uppercase" style={{ color: recColor }}>
                {recommendation.muscleGroup}
              </span>{' '}
              <span className="text-muted">— ฟื้นตัวแล้ว {recommendation.pct}%</span>
            </p>
          </div>
        )
      })()}

      {error ? (
        <ErrorState title="โหลดข้อมูล Recovery ไม่สำเร็จ" message={error} onRetry={load} />
      ) : loading ? (
        <div className="space-y-3">
          {MUSCLE_GROUPS.map((mg) => (
            <div key={mg} className="rounded-lg bg-surface border border-line px-4 py-3.5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ mg, lastTrained, pct }) => {
            const status = statusLabel(pct)
            const color = recoveryStatusColor(pct)
            const hoursLeft = computeRecoveryReadyInHours(lastTrained, mg)
            return (
              <div key={mg} className="rounded-lg bg-surface border border-line px-4 py-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: MUSCLE_GROUP_COLORS[mg] }}
                    />
                    <p className="font-display text-base tracked uppercase text-ink truncate">{mg}</p>
                  </div>
                  <span className="text-[11px] font-mono shrink-0" style={{ color }}>
                    {pct}%
                  </span>
                </div>

                <div className="h-2.5 rounded-full bg-surface2 overflow-hidden">
                  <AnimatedBarFill pct={pct} color={color} />
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-muted">
                    {lastTrained ? (
                      <>ฝึกล่าสุด {relativeDayLabel(lastTrained)}</>
                    ) : (
                      'ยังไม่มีประวัติ'
                    )}
                  </p>
                  <p className={`text-[11px] ${status.color}`}>{status.text}</p>
                </div>

                <p className="text-[10px] text-muted mt-1">
                  รอบพักฟื้นโดยประมาณ {RECOVERY_WINDOW_DAYS[mg] ?? 2} วัน
                  {hoursLeft !== null && <> · พร้อมฝึกในอีก ~{hoursLeft} ชม.</>}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <a href="/log" className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2">
        ✚ บันทึกการฝึกวันนี้ →
      </a>
    </div>
  )
}
