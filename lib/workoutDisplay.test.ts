import { describe, it, expect } from 'vitest'
import { computeDaySummary, computeExerciseProgress, formatDuration, workoutVolumeKg } from './workoutDisplay'
import type { Workout } from './types'

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w-1',
    user_id: 'user-1',
    type: 'strength',
    performed_at: '2026-07-20',
    exercise_name: 'เบนช์เพรส',
    muscle_group: 'อก',
    secondary_muscles: [],
    exercise_library_id: null,
    sets: 3,
    reps: 8,
    weight_kg: 60,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    avg_heart_rate: null,
    calories_kcal: null,
    notes: null,
    created_at: '2026-07-20T10:00:00Z',
    total_volume_kg: null,
    ...overrides,
  }
}

describe('workoutVolumeKg', () => {
  it('uses total_volume_kg when present', () => {
    expect(workoutVolumeKg(makeWorkout({ total_volume_kg: 999 }))).toBe(999)
  })

  it('falls back to sets*reps*weight_kg when total_volume_kg is null', () => {
    expect(workoutVolumeKg(makeWorkout({ sets: 3, reps: 8, weight_kg: 60, total_volume_kg: null }))).toBe(3 * 8 * 60)
  })
})

describe('computeDaySummary', () => {
  it('sums sets/volume and collects distinct muscle groups across the day', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', sets: 4, reps: 7, weight_kg: 35, muscle_group: 'อก', total_volume_kg: 980 }),
      makeWorkout({ id: 'b', sets: 3, reps: 10, weight_kg: 9.1, muscle_group: 'แขน', total_volume_kg: 273 }),
      makeWorkout({ id: 'c', type: 'cardio', sets: null, reps: null, weight_kg: null, muscle_group: null }),
    ])
    expect(summary.exerciseCount).toBe(3)
    expect(summary.totalSets).toBe(7)
    expect(summary.totalVolumeKg).toBe(980 + 273)
    expect(summary.muscleGroups.sort()).toEqual(['อก', 'แขน'].sort())
  })

  it('estimates duration from the spread of created_at timestamps', () => {
    const summary = computeDaySummary([
      makeWorkout({ id: 'a', created_at: '2026-07-20T10:00:00Z' }),
      makeWorkout({ id: 'b', created_at: '2026-07-20T11:18:00Z' }),
    ])
    expect(summary.durationMin).toBe(78)
  })

  it('returns null duration when fewer than two entries', () => {
    expect(computeDaySummary([makeWorkout()]).durationMin).toBeNull()
    expect(computeDaySummary([]).durationMin).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formats minutes under an hour as Xm', () => {
    expect(formatDuration(45)).toBe('45m')
  })

  it('formats over an hour as Xh Ym', () => {
    expect(formatDuration(78)).toBe('1h 18m')
  })

  it('omits minutes when exactly on the hour', () => {
    expect(formatDuration(120)).toBe('2h')
  })
})

describe('computeExerciseProgress', () => {
  it('flags a PR when weight beats the all-time best', () => {
    const prior = [makeWorkout({ id: 'p1', performed_at: '2026-07-10', weight_kg: 30 })]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 35 })
    expect(computeExerciseProgress(today, prior)).toEqual({ kind: 'pr', deltaKg: 5 })
  })

  it('flags best volume when weight is not a PR but volume is', () => {
    const prior = [makeWorkout({ id: 'p1', performed_at: '2026-07-10', weight_kg: 40, sets: 3, reps: 8, total_volume_kg: 960 })]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 40, sets: 5, reps: 8, total_volume_kg: 1600 })
    expect(computeExerciseProgress(today, prior)).toEqual({ kind: 'bestVolume' })
  })

  it('flags up/down relative to the most recent session when neither is a record', () => {
    const prior = [
      makeWorkout({ id: 'p1', performed_at: '2026-07-01', weight_kg: 50, total_volume_kg: 3000 }),
      makeWorkout({ id: 'p2', performed_at: '2026-07-15', weight_kg: 42, total_volume_kg: 1000 }),
    ]
    const up = makeWorkout({ id: 't1', performed_at: '2026-07-20', weight_kg: 45, total_volume_kg: 1100 })
    expect(computeExerciseProgress(up, prior)).toEqual({ kind: 'up', deltaKg: 3 })

    const down = makeWorkout({ id: 't2', performed_at: '2026-07-20', weight_kg: 40, total_volume_kg: 900 })
    expect(computeExerciseProgress(down, prior)).toEqual({ kind: 'down', deltaKg: 2 })
  })

  it('returns none for the first time an exercise is logged', () => {
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20' })
    expect(computeExerciseProgress(today, [])).toEqual({ kind: 'none' })
  })

  it('ignores cardio entries and same-day entries', () => {
    const cardio = makeWorkout({ id: 'c', type: 'cardio', performed_at: '2026-07-20' })
    expect(computeExerciseProgress(cardio, []).kind).toBe('none')

    const sameDay = [makeWorkout({ id: 'same', performed_at: '2026-07-20', weight_kg: 20 })]
    const today = makeWorkout({ id: 't', performed_at: '2026-07-20', weight_kg: 35 })
    expect(computeExerciseProgress(today, sameDay)).toEqual({ kind: 'none' })
  })
})
