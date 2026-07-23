'use client'

import type { ReactNode } from 'react'
import type { Workout, WorkoutSet } from '@/lib/types'
import type { ExerciseProgress } from '@/lib/workoutDisplay'
import ExerciseProgressBadge from './ExerciseProgressBadge'

export interface DisplaySet {
  id: string
  set_number: number
  reps: number | null
  weight_kg: number | null
}

// ใช้ workout_sets จริงถ้ามี (แม่นยำต่อเซ็ต เช่น drop set) — ถ้าไม่มี (แถวเก่า หรือมาจาก
// session/program ที่ยังไม่ผูก workout_sets) จำลองเป็นหลายเซ็ตค่าเท่ากันจาก sets/reps/weight_kg รวม
export function buildDisplaySets(w: Workout, realSets: WorkoutSet[]): DisplaySet[] {
  if (realSets.length > 0) {
    return realSets.map((s) => ({ id: s.id, set_number: s.set_number, reps: s.reps, weight_kg: s.weight_kg }))
  }
  if (w.type === 'strength' && w.sets) {
    return Array.from({ length: w.sets }, (_, i) => ({
      id: `${w.id}-synthetic-${i}`,
      set_number: i + 1,
      reps: w.reps,
      weight_kg: w.weight_kg,
    }))
  }
  return []
}

export default function ExerciseCard({
  workout,
  displaySets,
  progress,
  format,
  expanded,
  onToggleExpand,
  actions,
  nameHref,
}: {
  workout: Workout
  displaySets: DisplaySet[]
  progress: ExerciseProgress
  format: (kg: number | null | undefined) => string
  expanded: boolean
  onToggleExpand: () => void
  actions?: ReactNode
  nameHref?: string
}) {
  const w = workout
  const hasSets = w.type === 'strength' && displaySets.length > 0
  const isRecord = progress.kind === 'pr' || progress.kind === 'bestVolume'
  const name = w.type === 'strength' ? (w.exercise_name ?? '—') : w.cardio_type

  return (
    <li
      className={`group rounded-lg border bg-surface shadow-elevated transition hover:-translate-y-0.5 hover:shadow-hero hover:border-amber/40 ${
        isRecord ? 'border-violet/40' : 'border-line'
      }`}
    >
      <div
        role={hasSets ? 'button' : undefined}
        tabIndex={hasSets ? 0 : undefined}
        onClick={hasSets ? onToggleExpand : undefined}
        onKeyDown={
          hasSets
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggleExpand()
                }
              }
            : undefined
        }
        aria-expanded={hasSets ? expanded : undefined}
        className={`w-full text-left px-4 py-3 ${hasSets ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-medium text-ink truncate leading-snug">
              <span className="mr-1.5">{w.type === 'strength' ? '🏋️' : '🏃'}</span>
              {nameHref ? (
                <a href={nameHref} onClick={(e) => e.stopPropagation()} className="hover:text-amber hover:underline">
                  {name}
                </a>
              ) : (
                name
              )}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              {w.type === 'strength' ? (
                <>
                  <span className="font-mono text-2xl font-bold text-ink tabular">{format(w.weight_kg)}</span>
                  <span className="font-mono text-xs text-muted tabular">
                    {w.sets} × {w.reps}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-mono text-2xl font-bold text-ink tabular">{w.distance_km}km</span>
                  <span className="font-mono text-xs text-muted tabular">{w.duration_min} min</span>
                </>
              )}
            </div>
            {w.muscle_group && <p className="text-[11px] text-steel mt-1">{w.muscle_group}</p>}
            {w.notes && <p className="text-[11px] text-muted/80 mt-1 truncate">{w.notes}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <ExerciseProgressBadge progress={progress} format={format} />
            {hasSets && (
              <span
                className="text-muted text-[10px] transition-transform"
                style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                aria-hidden="true"
              >
                ▼
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && hasSets && (
        <div className="px-4 pb-3">
          <div className="h-px bg-line mb-2.5" />
          <div className="grid grid-cols-4 gap-1.5">
            {displaySets.map((s) => (
              <div key={s.id} className="rounded-md bg-surface2 px-2 py-1.5 text-center">
                <p className="text-[9px] tracked uppercase text-muted">เซ็ต {s.set_number}</p>
                <p className="font-mono text-xs font-semibold text-ink mt-0.5 tabular">
                  {s.weight_kg !== null ? format(s.weight_kg) : '—'} × {s.reps ?? '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {actions && (
        <div className="px-4 pb-2.5 -mt-1 flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          {actions}
        </div>
      )}
    </li>
  )
}
