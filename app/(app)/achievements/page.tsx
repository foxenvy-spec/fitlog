'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workout } from '@/lib/types'
import { todayStr } from '@/lib/weekdays'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

interface Stats {
  totalLogs: number
  totalDays: number
  totalVolume: number
  longestStreak: number
  currentStreak: number
}

function computeStats(workouts: Workout[]): Stats {
  const totalLogs = workouts.length
  const days = Array.from(new Set(workouts.map((w) => w.performed_at))).sort()
  const totalDays = days.length
  const totalVolume = workouts.reduce((sum, w) => {
    if (w.type === 'strength' && w.sets && w.reps && w.weight_kg) {
      return sum + w.sets * w.reps * w.weight_kg
    }
    return sum
  }, 0)

  let longest = 0
  let running = 0
  let prevDate: Date | null = null
  for (const d of days) {
    const dateObj = new Date(d + 'T00:00:00')
    if (prevDate) {
      const diffDays = Math.round((dateObj.getTime() - prevDate.getTime()) / 86400000)
      running = diffDays === 1 ? running + 1 : 1
    } else {
      running = 1
    }
    longest = Math.max(longest, running)
    prevDate = dateObj
  }

  let currentStreak = 0
  if (days.length > 0) {
    const lastDate = new Date(days[days.length - 1] + 'T00:00:00')
    const today = new Date(todayStr() + 'T00:00:00')
    const diffFromToday = Math.round((today.getTime() - lastDate.getTime()) / 86400000)
    if (diffFromToday <= 1) {
      currentStreak = 1
      for (let i = days.length - 1; i > 0; i--) {
        const cur = new Date(days[i] + 'T00:00:00')
        const prev = new Date(days[i - 1] + 'T00:00:00')
        const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000)
        if (diff === 1) currentStreak++
        else break
      }
    }
  }

  return { totalLogs, totalDays, totalVolume, longestStreak: longest, currentStreak }
}

interface Badge {
  key: string
  icon: string
  title: string
  desc: string
  current: number
  target: number
  isWeight?: boolean
}

function buildBadges(stats: Stats): Badge[] {
  return [
    { key: 'first', icon: '🥇', title: 'ก้าวแรก', desc: 'บันทึกออกกำลังกายครั้งแรก', current: stats.totalLogs, target: 1 },
    { key: 'logs_50', icon: '💪', title: 'มือใหม่ตั้งใจ', desc: 'บันทึกครบ 50 ครั้ง', current: stats.totalLogs, target: 50 },
    { key: 'logs_100', icon: '🏋️', title: 'สายเหล็ก', desc: 'บันทึกครบ 100 ครั้ง', current: stats.totalLogs, target: 100 },
    { key: 'logs_500', icon: '🔱', title: 'ตัวจริง', desc: 'บันทึกครบ 500 ครั้ง', current: stats.totalLogs, target: 500 },
    { key: 'volume_1000', icon: '🏆', title: 'ตันแรก', desc: 'ยกรวมสะสม 1,000 กก.', current: stats.totalVolume, target: 1000, isWeight: true },
    { key: 'volume_10000', icon: '⚡', title: 'หมื่นกิโล', desc: 'ยกรวมสะสม 10,000 กก.', current: stats.totalVolume, target: 10000, isWeight: true },
    { key: 'volume_100000', icon: '🌋', title: 'แสนกิโล', desc: 'ยกรวมสะสม 100,000 กก.', current: stats.totalVolume, target: 100000, isWeight: true },
    { key: 'streak_7', icon: '🔥', title: '7 วันติด', desc: 'ออกกำลังกายต่อเนื่อง 7 วัน', current: stats.longestStreak, target: 7 },
    { key: 'streak_30', icon: '🌟', title: '30 วันติด', desc: 'ออกกำลังกายต่อเนื่อง 30 วัน', current: stats.longestStreak, target: 30 },
    { key: 'days_50', icon: '📅', title: '50 วันฝึก', desc: 'ออกกำลังกายรวม 50 วัน', current: stats.totalDays, target: 50 },
    { key: 'days_200', icon: '🗓️', title: '200 วันฝึก', desc: 'ออกกำลังกายรวม 200 วัน', current: stats.totalDays, target: 200 },
  ]
}

export default function AchievementsPage() {
  const supabase = createClient()
  const { unit, toDisplay } = useWeightUnit()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('workouts').select('*').order('performed_at')
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

  const stats = useMemo(() => computeStats(workouts), [workouts])
  const badges = useMemo(() => buildBadges(stats), [stats])
  const unlockedCount = badges.filter((b) => b.current >= b.target).length

  if (loading) return <LoadingState />
  if (error) return <ErrorState title="โหลดข้อมูลความสำเร็จไม่สำเร็จ" message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">ความสำเร็จ</h1>
        <p className="text-sm text-muted mt-1">
          ปลดล็อกแล้ว {unlockedCount}/{badges.length}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox label="ต่อเนื่องตอนนี้" value={`${stats.currentStreak} วัน`} />
        <StatBox label="สถิติต่อเนื่อง" value={`${stats.longestStreak} วัน`} />
        <StatBox label="วันฝึกรวม" value={`${stats.totalDays} วัน`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {badges.map((b) => {
          const unlocked = b.current >= b.target
          const pct = Math.min(100, Math.round((b.current / b.target) * 100))
          return (
            <div
              key={b.key}
              className={`rounded-lg border px-3 py-4 text-center space-y-1.5 ${
                unlocked ? 'bg-surface border-amber/40' : 'bg-surface2 border-line opacity-60'
              }`}
            >
              <div className={`text-3xl ${unlocked ? '' : 'grayscale opacity-50'}`}>{b.icon}</div>
              <p className={`text-xs font-display tracked uppercase ${unlocked ? 'text-ink' : 'text-muted'}`}>{b.title}</p>
              <p className="text-[10px] text-muted">{b.desc}</p>
              {!unlocked && (
                <div className="pt-1">
                  <div className="h-1 rounded-full bg-line overflow-hidden">
                    <div className="h-full bg-steel" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[9px] text-muted mt-1 font-mono">
                    {b.isWeight
                      ? `${Math.floor(toDisplay(b.current)).toLocaleString()}/${Math.round(toDisplay(b.target)).toLocaleString()} ${unit}`
                      : `${Math.floor(b.current)}/${b.target}`}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated px-2 py-3">
      <p className="text-lg font-display text-amber">{value}</p>
      <p className="text-[10px] text-muted tracked uppercase mt-0.5">{label}</p>
    </div>
  )
}
