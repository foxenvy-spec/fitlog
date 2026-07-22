'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange, volumeStatus, type VolumeStatus } from '@/lib/dashboardStats'
import { computeWeeklyCardioVolume } from '@/lib/weeklyCardioVolume'
import { fetchWeeklyCardioTargets } from '@/lib/weeklyCardioTargets'
import { HR_ZONES, DEFAULT_MAX_HEART_RATE } from '@/lib/heartRate'
import type { Workout, Profile } from '@/lib/types'
import { todayDayOfWeek } from '@/lib/weekdays'
import AnimatedBarFill from './AnimatedBarFill'
import Skeleton from './Skeleton'
import HeartRateSettings from './HeartRateSettings'
import CardioTargetsSettings from './CardioTargetsSettings'

const STATUS_COLOR: Record<VolumeStatus, string> = {
  behind: '#C1503A', // rust — ตามหลัง
  onTrack: '#E8A33D', // amber — กำลังไปได้ดี
  met: '#7A9B57', // moss — ถึงเป้าหมายแล้ว (รวมถึงทำเกินเป้าด้วย)
}

function MetricTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md bg-surface2 px-3 py-2.5">
      <p className="text-[10px] tracked uppercase text-muted">{label}</p>
      <p className="font-mono text-lg text-ink mt-0.5">
        {value}
        {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function TargetProgressRow({ label, done, target, unit }: { label: string; done: number; target: number; unit: string }) {
  const dayOfWeek1to7 = ((todayDayOfWeek() + 6) % 7) + 1
  const status = volumeStatus(done, target, dayOfWeek1to7)
  const color = STATUS_COLOR[status]
  const pct = Math.min(100, target > 0 ? (done / target) * 100 : 0)
  const diff = done - target

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-ink">{label}</span>
        <span className="text-[11px] font-mono text-muted">
          {done}
          <span className="text-muted/60">
            /{target} {unit}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <AnimatedBarFill pct={pct} color={color} />
      </div>
      <p className="mt-1 text-[11px] font-mono" style={{ color }}>
        {status === 'met' ? (diff > 0 ? `+${diff} ${unit}` : 'ถึงเป้าหมายพอดี') : `อีก ${target - done} ${unit} ถึงเป้าหมาย`}
      </p>
    </div>
  )
}

export default function WeeklyCardioVolume() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { start, end } = getWeekRange()
  const [hrSettingsOpen, setHrSettingsOpen] = useState(false)
  const [targetsOpen, setTargetsOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-cardio-volume', start, end],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const [{ data: workouts }, { data: metric }, { data: profileRow }] = await Promise.all([
        supabase
          .from('workouts')
          .select('duration_min, distance_km, cardio_type, avg_heart_rate, calories_kcal')
          .eq('type', 'cardio')
          .gte('performed_at', start)
          .lte('performed_at', end),
        supabase.from('body_metrics').select('weight_kg').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
        user
          ? supabase.from('profiles').select('max_heart_rate').eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null as Pick<Profile, 'max_heart_rate'> | null }),
      ])

      const maxHeartRate = profileRow?.max_heart_rate ?? DEFAULT_MAX_HEART_RATE
      const bodyWeightKg = (metric as { weight_kg: number | null } | null)?.weight_kg ?? null
      const cardioWorkouts = (workouts as Workout[]) ?? []
      return { volume: computeWeeklyCardioVolume(cardioWorkouts, bodyWeightKg, maxHeartRate), maxHeartRate }
    },
    staleTime: 60_000,
  })

  // เป้าหมายของผู้ใช้เอง (ตั้งได้ต่อคนใน weekly_volume_targets) — ถ้ายังไม่เคยตั้ง จะได้ค่า
  // default กลับมาแทน (ดู lib/weeklyCardioTargets.ts)
  const { data: targets, isLoading: loadingTargets } = useQuery({
    queryKey: ['weekly-cardio-targets'],
    queryFn: () => fetchWeeklyCardioTargets(supabase),
    staleTime: 60_000,
  })

  const volume = data?.volume

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Weekly Cardio Volume</p>
          <p className="font-display text-base tracked uppercase text-ink mt-0.5">คาร์ดิโอสัปดาห์นี้</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => setTargetsOpen(true)}
            className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1"
          >
            ตั้งเป้าหมาย
          </button>
          <button
            type="button"
            onClick={() => setHrSettingsOpen(true)}
            className="text-[11px] text-muted hover:text-ink border border-line rounded px-2 py-1"
          >
            ชีพจรสูงสุด
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        {isLoading || !volume ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="Total Minutes" value={volume.totalMinutes.toLocaleString('th-TH')} unit="นาที" />
              <MetricTile label="Sessions" value={String(volume.sessions)} unit="ครั้ง" />
              <MetricTile label="Calories" value={volume.totalCalories.toLocaleString('th-TH')} unit="kcal" />
              <MetricTile label="Distance" value={volume.totalDistanceKm.toLocaleString('th-TH')} unit="กม." />
            </div>

            <div className="mt-3 space-y-2.5">
              <p className="text-[10px] tracked uppercase text-muted">เป้าหมายสัปดาห์นี้</p>
              {loadingTargets || !targets ? (
                <>
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </>
              ) : (
                <>
                  <TargetProgressRow label="นาที" done={volume.totalMinutes} target={targets.minutes} unit="นาที" />
                  <TargetProgressRow label="ครั้ง" done={volume.sessions} target={targets.sessions} unit="ครั้ง" />
                </>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] tracked uppercase text-muted">Heart Rate Zone Time</p>
                {volume.hrZones.sessionsWithHR < volume.hrZones.totalCardioSessions && (
                  <p className="text-[10px] text-muted">
                    มี HR {volume.hrZones.sessionsWithHR}/{volume.hrZones.totalCardioSessions} ครั้ง
                  </p>
                )}
              </div>

              {volume.hrZones.sessionsWithHR === 0 ? (
                <p className="text-[11px] text-muted">
                  ยังไม่มีข้อมูลชีพจร — กรอกชีพจรเฉลี่ยตอนบันทึกคาร์ดิโอ (หรือนำเข้าจากรูป) เพื่อดูเวลาในแต่ละโซน
                </p>
              ) : (
                <>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-surface2">
                    {HR_ZONES.map((z) => {
                      const mins = volume.hrZones.minutesByZone[z.key] ?? 0
                      const pct = volume.totalMinutes > 0 ? (mins / volume.totalMinutes) * 100 : 0
                      if (pct <= 0) return null
                      return <div key={z.key} style={{ width: `${pct}%`, backgroundColor: z.color }} title={`${z.label}: ${mins} นาที`} />
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {HR_ZONES.map((z) => {
                      const mins = volume.hrZones.minutesByZone[z.key] ?? 0
                      if (mins <= 0) return null
                      return (
                        <p key={z.key} className="text-[10px] text-muted flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: z.color }} />
                          {z.label} · {mins} นาที
                        </p>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-muted/70 mt-1">
                    * ประมาณจากชีพจรเฉลี่ยต่อเซสชัน ไม่ใช่ค่าต่อเนื่องระหว่างออกกำลังกาย
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <HeartRateSettings
        open={hrSettingsOpen}
        maxHeartRate={data?.maxHeartRate ?? DEFAULT_MAX_HEART_RATE}
        onClose={() => setHrSettingsOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['weekly-cardio-volume'] })
          setHrSettingsOpen(false)
        }}
      />

      {targets && (
        <CardioTargetsSettings
          open={targetsOpen}
          targets={targets}
          onClose={() => setTargetsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['weekly-cardio-targets'] })
            setTargetsOpen(false)
          }}
        />
      )}
    </div>
  )
}
