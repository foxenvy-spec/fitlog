'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, type VolumeStatus } from '@/lib/dashboardStats'
import { fetchWeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { todayDayOfWeek } from '@/lib/weekdays'
import { MUSCLE_GROUP_COLORS, VOLUME_MUSCLES } from '@/lib/muscle-groups'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import VolumeTargetsSettings from './VolumeTargetsSettings'

const STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: '#C1503A', // rust — ตามหลัง
  onTrack: '#E8A33D', // amber — กำลังไปได้ดี
  met: '#7A9B57', // moss — ถึงเป้าหมายแล้ว (รวมถึงทำเกินเป้าด้วย)
}

export default function WeeklyVolume() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { start, end } = getWeekRange()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { data: setsByMuscle = {}, isLoading: loadingSets } = useQuery({
    queryKey: ['weekly-volume', start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, sets')
        .eq('type', 'strength')
        .gte('performed_at', start)
        .lte('performed_at', end)

      const totals: Record<string, number> = {}
      ;((data as { muscle_group: string | null; sets: number | null }[]) ?? []).forEach((r) => {
        if (!r.muscle_group) return
        totals[r.muscle_group] = (totals[r.muscle_group] ?? 0) + (r.sets ?? 0)
      })
      return totals
    },
    staleTime: 60_000,
  })

  // เป้าหมายของผู้ใช้เอง (ตั้งได้ต่อคนใน weekly_volume_targets) — ถ้ายังไม่เคยตั้ง จะได้ค่า
  // default กลับมาแทน (ดู lib/weeklyVolumeTargets.ts)
  const { data: targets = null, isLoading: loadingTargets } = useQuery({
    queryKey: ['weekly-volume-targets'],
    queryFn: () => fetchWeeklyVolumeTargets(supabase),
    staleTime: 60_000,
  })

  const loading = loadingSets || loadingTargets || !targets

  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1
  const maxSets = targets
    ? Math.max(1, ...VOLUME_MUSCLES.map((mg) => setsByMuscle[mg] ?? 0), ...Object.values(targets))
    : 1

  const rows = targets
    ? VOLUME_MUSCLES.map((mg) => {
        const sets = setsByMuscle[mg] ?? 0
        const target = targets[mg]
        const status = volumeStatus(sets, target, dayOfWeek1to7)
        return { mg, sets, target, status }
      })
    : []

  const behindList = rows.filter((r) => r.status === 'behind')

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Weekly Volume</p>
          <p className="font-display text-base tracked uppercase text-ink mt-0.5">เซ็ตต่อกลุ่มกล้ามเนื้อ (สัปดาห์นี้)</p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1 mt-0.5 shrink-0"
        >
          ตั้งเป้าหมาย
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {loading ? (
          VOLUME_MUSCLES.map((mg) => (
            <div key={mg} className="space-y-1">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))
        ) : (
          rows.map(({ mg, sets, target, status }) => {
            const barPct = Math.min(100, (sets / maxSets) * 100)
            const targetPct = Math.min(100, (target / maxSets) * 100)
            const pct = target > 0 ? Math.round((sets / target) * 100) : 0
            const diff = sets - target
            const color = STATUS_COLOR[status]
            return (
              <div key={mg}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-ink">{mg}</span>
                  <span className="text-[11px] font-mono text-muted">
                    {sets}
                    <span className="text-muted/60">/{target} sets</span>
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
                  <AnimatedBarFill pct={barPct} color={color} />
                  <div
                    className="absolute top-0 h-full w-px bg-ink/40"
                    style={{ left: `${targetPct}%` }}
                    title={`เป้าหมาย ${target} เซ็ต/สัปดาห์`}
                  />
                </div>
                <div className="mt-1 space-y-0.5">
                  <p className="text-[11px] font-mono font-medium" style={{ color }}>
                    {status === 'met' ? (diff > 0 ? `+${diff} sets` : `${pct}%`) : `${pct}%`}
                  </p>
                  <p className="text-[11px]" style={{ color }}>
                    {status === 'met'
                      ? diff > 0
                        ? 'ยอดเยี่ยม'
                        : 'ถึงเป้าหมายพอดี'
                      : `อีก ${target - sets} เซ็ตถึงเป้าหมาย`}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {!loading && behindList.length > 0 && (
        <div className="border-t border-line px-4 py-3 space-y-1.5">
          {behindList.map(({ mg, sets, target }) => (
            <p key={mg} className="text-[11px] flex items-start gap-1.5">
              <span style={{ color: STATUS_COLOR.behind }}>⚠</span>
              <span className="text-muted">
                <span style={{ color: MUSCLE_GROUP_COLORS[mg] }}>{mg}</span> volume ต่ำกว่าเป้าหมาย ({sets}/{target}{' '}
                เซ็ต)
              </span>
            </p>
          ))}
        </div>
      )}

      {targets && (
        <VolumeTargetsSettings
          open={settingsOpen}
          targets={targets}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['weekly-volume-targets'] })
            // 'dashboard' query's weeklyGoalPct also depends on these targets — invalidate by
            // key prefix rather than the exact ['dashboard', today] key, since this component
            // doesn't know today's date string.
            queryClient.invalidateQueries({ queryKey: ['dashboard'] })
            setSettingsOpen(false)
          }}
        />
      )}
    </div>
  )
}
