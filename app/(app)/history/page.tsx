'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutSet } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { computeExerciseProgress } from '@/lib/workoutDisplay'
import ExerciseCard, { buildDisplaySets } from '@/components/ExerciseCard'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type Filter = 'all' | 'strength' | 'cardio'

function formatThaiDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function todayForFilename() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <HistoryPageInner />
    </Suspense>
  )
}

function HistoryPageInner() {
  const supabase = createClient()
  const { format } = useWeightUnit()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [exerciseFilter, setExerciseFilter] = useState<string | null>(searchParams.get('exercise'))
  const [search, setSearch] = useState('')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [setsByWorkoutId, setSetsByWorkoutId] = useState<Record<string, WorkoutSet[]>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .order('performed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      setLoadError(error.message)
      setLoading(false)
      return
    }
    const rows = (data as Workout[]) ?? []
    setWorkouts(rows)
    setLoading(false)

    // ดึงรายละเอียดทีละเซ็ตของท่าเวทมาในทีเดียว ใช้เปิดดู "Set Card" แบบละเอียดต่อรายการ
    const strengthIds = rows.filter((w) => w.type === 'strength').map((w) => w.id)
    if (strengthIds.length > 0) {
      const { data: setRows } = await supabase
        .from('workout_sets')
        .select('*')
        .in('workout_id', strengthIds)
        .order('set_number')
      const byId: Record<string, WorkoutSet[]> = {}
      ;((setRows as WorkoutSet[]) ?? []).forEach((s) => {
        ;(byId[s.workout_id] ??= []).push(s)
      })
      setSetsByWorkoutId(byId)
    } else {
      setSetsByWorkoutId({})
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(id: string) {
    setActionError(null)
    setDeletingId(id)
    const { error } = await supabase.from('workouts').delete().eq('id', id)
    setDeletingId(null)
    if (error) {
      setActionError(`ลบไม่สำเร็จ: ${error.message}`)
      return
    }
    setWorkouts((prev) => prev.filter((w) => w.id !== id))
  }

  async function handleExportCsv() {
    setActionError(null)
    setExporting(true)
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .order('performed_at', { ascending: false })
      if (error) {
        setActionError(`Export ไม่สำเร็จ: ${error.message}`)
        return
      }
      const rows = (data as Workout[]) ?? []
      const header = [
        'date',
        'type',
        'exercise_name',
        'muscle_group',
        'sets',
        'reps',
        'weight_kg',
        'rpe',
        'cardio_type',
        'distance_km',
        'duration_min',
        'notes',
      ]
      function esc(v: unknown) {
        if (v === null || v === undefined) return ''
        const s = String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines = [header.join(',')]
      rows.forEach((w) => {
        lines.push(
          [
            w.performed_at,
            w.type,
            w.exercise_name,
            w.muscle_group,
            w.sets,
            w.reps,
            w.weight_kg,
            w.rpe,
            w.cardio_type,
            w.distance_km,
            w.duration_min,
            w.notes,
          ]
            .map(esc)
            .join(',')
        )
      })
      const csv = '\uFEFF' + lines.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fitlog-export-${todayForFilename()}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(`Export ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = workouts.filter((w) => {
    if (filter !== 'all' && w.type !== filter) return false
    if (exerciseFilter && w.exercise_name !== exerciseFilter) return false
    if (q) {
      const haystack = (w.type === 'strength' ? w.exercise_name : w.cardio_type) ?? ''
      if (!haystack.toLowerCase().includes(q)) return false
    }
    return true
  })

  function clearExerciseFilter() {
    setExerciseFilter(null)
    router.replace('/history')
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpandedIds(new Set(filtered.filter((w) => w.type === 'strength').map((w) => w.id)))
  }

  function collapseAll() {
    setExpandedIds(new Set())
  }

  const grouped = filtered.reduce<Record<string, Workout[]>>((acc, w) => {
    acc[w.performed_at] = acc[w.performed_at] || []
    acc[w.performed_at].push(w)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1))

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดประวัติไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl tracked uppercase">ประวัติ</h1>

      {exerciseFilter && (
        <div className="flex items-center gap-2 rounded-full bg-surface2 border border-line px-3 py-1.5 w-fit">
          <span className="text-[11px] text-muted">กรอง:</span>
          <span className="text-[11px] text-ink">{exerciseFilter}</span>
          <button
            type="button"
            onClick={clearExerciseFilter}
            className="text-muted hover:text-rust text-xs leading-none ml-1"
            aria-label="ล้างตัวกรอง"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(['all', 'strength', 'cardio'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-display tracked uppercase border transition ${
                filter === f
                  ? 'bg-amber text-bg border-amber'
                  : 'text-muted border-line'
              }`}
            >
              {f === 'all' ? 'ทั้งหมด' : f === 'strength' ? 'เวท' : 'คาร์ดิโอ'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-display tracked uppercase border border-line text-muted hover:text-amber hover:border-amber/50 transition disabled:opacity-50"
        >
          {exporting ? 'กำลัง Export...' : 'Export CSV'}
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาท่าออกกำลังกาย..."
          className="input pl-9 text-sm"
        />
      </div>

      {actionError && <p className="text-xs text-rusttext">{actionError}</p>}

      {dates.length > 0 && (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={expandAll} className="text-[11px] tracked uppercase text-muted hover:text-amber transition">
            Expand All
          </button>
          <span className="text-line">|</span>
          <button type="button" onClick={collapseAll} className="text-[11px] tracked uppercase text-muted hover:text-amber transition">
            Collapse All
          </button>
        </div>
      )}

      {dates.length === 0 ? (
        <EmptyState
          icon="🏋️"
          title="ยังไม่มีประวัติการออกกำลังกาย"
          message="เริ่มบันทึกครั้งแรก แล้วประวัติของคุณจะมาโชว์ที่นี่"
          ctaHref="/log"
          ctaLabel="+ บันทึกการออกกำลังกาย"
        />
      ) : (
        <div className="space-y-5 md:space-y-0 md:grid md:grid-cols-2 md:gap-5 md:items-start">
          {dates.map((date) => (
            <div key={date}>
              <p className="text-xs font-mono tracked text-muted mb-2 uppercase">{formatThaiDate(date)}</p>
              <ul className="space-y-2">
                {grouped[date].map((w) => (
                  <ExerciseCard
                    key={w.id}
                    workout={w}
                    displaySets={buildDisplaySets(w, setsByWorkoutId[w.id] ?? [])}
                    progress={computeExerciseProgress(w, workouts)}
                    format={format}
                    expanded={expandedIds.has(w.id)}
                    onToggleExpand={() => toggleExpand(w.id)}
                    nameHref={w.exercise_name ? `/exercises/${encodeURIComponent(w.exercise_name)}` : undefined}
                    actions={
                      <>
                        <a
                          href={`/log?edit=${w.id}`}
                          className="text-muted hover:text-amber text-xs"
                          aria-label="แก้ไขรายการ"
                        >
                          แก้ไข
                        </a>
                        <button
                          onClick={() => handleDelete(w.id)}
                          disabled={deletingId === w.id}
                          className="text-muted hover:text-rust text-xs disabled:opacity-50"
                          aria-label="ลบรายการ"
                        >
                          {deletingId === w.id ? 'กำลังลบ...' : 'ลบ'}
                        </button>
                      </>
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <a
        href="/export"
        className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
      >
        📤 Export & Backup →
      </a>
    </div>
  )
}
