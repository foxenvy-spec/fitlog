import { describe, it, expect } from 'vitest'
import type { Workout } from './types'
import { estimate1RM, computeExerciseStats } from './exerciseStats'

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    user_id: 'u1',
    type: 'strength',
    performed_at: '2026-07-01',
    exercise_name: 'Bench Press',
    muscle_group: 'อก',
    sets: 3,
    reps: 8,
    weight_kg: 60,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    notes: null,
    created_at: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

describe('estimate1RM', () => {
  it('applies the Epley formula', () => {
    expect(estimate1RM(100, 5)).toBe(116.7)
  })
})

describe('computeExerciseStats', () => {
  it('returns zeroed stats for no entries', () => {
    const stats = computeExerciseStats('Bench Press', [])
    expect(stats.totalSessions).toBe(0)
    expect(stats.bestWeightKg).toBeNull()
    expect(stats.best1RM).toBeNull()
    expect(stats.last10Sessions).toEqual([])
  })

  it('computes totals, PR, average weight, and 1RM across sessions', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', sets: 3, reps: 8, weight_kg: 60, created_at: '2026-06-01T10:00:00Z' }),
      makeWorkout({ id: 'b', performed_at: '2026-06-15', sets: 3, reps: 5, weight_kg: 70, created_at: '2026-06-15T10:00:00Z' }),
      makeWorkout({ id: 'c', performed_at: '2026-07-01', sets: 3, reps: 5, weight_kg: 75, created_at: '2026-07-01T10:00:00Z' }),
    ]
    const stats = computeExerciseStats('Bench Press', entries)

    expect(stats.totalSessions).toBe(3)
    expect(stats.bestWeightKg).toBe(75)
    expect(stats.bestWeightDate).toBe('2026-07-01')
    expect(stats.averageWeightKg).toBeCloseTo(68.3, 5) // rounded to 1 decimal, avg is 68.33..
    expect(stats.totalVolumeKg).toBe(3 * 8 * 60 + 3 * 5 * 70 + 3 * 5 * 75)
    expect(stats.best1RM).toBe(Math.max(estimate1RM(60, 8), estimate1RM(70, 5), estimate1RM(75, 5)))
    expect(stats.progressPoints).toHaveLength(3)
    expect(stats.progressPoints[0].date).toBe('2026-06-01') // sorted ascending
  })

  it('returns the most recent 10 sessions, newest first, in last10Sessions', () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      makeWorkout({
        id: `s${i}`,
        performed_at: `2026-06-${String(i + 1).padStart(2, '0')}`,
        created_at: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        weight_kg: 50 + i,
      })
    )
    const stats = computeExerciseStats('Bench Press', entries)
    expect(stats.last10Sessions).toHaveLength(10)
    expect(stats.last10Sessions[0].date).toBe('2026-06-12') // newest first
    expect(stats.last10Sessions[9].date).toBe('2026-06-03')
  })

  it('ignores cardio entries mixed into the same array', () => {
    const entries = [
      makeWorkout({ id: 'a' }),
      makeWorkout({ id: 'b', type: 'cardio', weight_kg: null, sets: null, reps: null }),
    ]
    const stats = computeExerciseStats('Bench Press', entries)
    expect(stats.totalSessions).toBe(1)
  })
})
