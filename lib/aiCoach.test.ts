import { describe, it, expect } from 'vitest'
import type { Workout } from './types'
import { computePushPullBalance, pushPullInsight, computeProgressiveOverload, computeAIDailySummary } from './aiCoach'

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

describe('computePushPullBalance', () => {
  it('reports insufficient_data when either side has too few sets', () => {
    const balance = computePushPullBalance({ อก: 4, ไหล่: 0, หลัง: 8 })
    expect(balance.status).toBe('insufficient_data')
    expect(balance.ratio).toBeNull()
  })

  it('reports balanced when push and pull are within tolerance', () => {
    const balance = computePushPullBalance({ อก: 6, ไหล่: 4, หลัง: 10 })
    expect(balance.pushSets).toBe(10)
    expect(balance.pullSets).toBe(10)
    expect(balance.status).toBe('balanced')
  })

  it('reports push_dominant when push sets clearly exceed pull sets', () => {
    const balance = computePushPullBalance({ อก: 10, ไหล่: 8, หลัง: 8 })
    expect(balance.status).toBe('push_dominant')
    expect(balance.ratio).toBeGreaterThan(1)
  })

  it('reports pull_dominant when pull sets clearly exceed push sets', () => {
    const balance = computePushPullBalance({ อก: 4, ไหล่: 2, หลัง: 14 })
    expect(balance.status).toBe('pull_dominant')
    expect(balance.ratio).toBeLessThan(1)
  })
})

describe('pushPullInsight', () => {
  it('returns null when balanced', () => {
    const insight = pushPullInsight({ pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' })
    expect(insight).toBeNull()
  })

  it('returns null when data is insufficient', () => {
    const insight = pushPullInsight({ pushSets: 2, pullSets: 0, ratio: null, status: 'insufficient_data' })
    expect(insight).toBeNull()
  })

  it('returns a warning insight when push dominant', () => {
    const insight = pushPullInsight({ pushSets: 18, pullSets: 8, ratio: 2.25, status: 'push_dominant' })
    expect(insight).not.toBeNull()
    expect(insight?.kind).toBe('warning')
    expect(insight?.title).toContain('Push')
  })

  it('returns a warning insight when pull dominant', () => {
    const insight = pushPullInsight({ pushSets: 6, pullSets: 14, ratio: 0.43, status: 'pull_dominant' })
    expect(insight).not.toBeNull()
    expect(insight?.title).toContain('Pull')
  })
})

describe('computeProgressiveOverload', () => {
  it('returns null when there is no history for the exercise', () => {
    expect(computeProgressiveOverload('Bench Press', [])).toBeNull()
  })

  it('falls back to a standard weight increase when no RPE has been logged', () => {
    const entries = [makeWorkout({ performed_at: '2026-07-01', weight_kg: 60, reps: 8, rpe: null })]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('increase_weight')
    expect(plan?.avgRpe).toBeNull()
    expect(plan?.targetWeight).toBe(62.5)
  })

  it('suggests increasing weight when recent RPE is low', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 60, reps: 8, rpe: 6 }),
      makeWorkout({ id: 'b', performed_at: '2026-06-08', weight_kg: 60, reps: 8, rpe: 6.5 }),
      makeWorkout({ id: 'c', performed_at: '2026-06-15', weight_kg: 60, reps: 8, rpe: 7 }),
    ]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('increase_weight')
    expect(plan?.avgRpe).toBeCloseTo(6.5, 1)
    expect(plan?.targetWeight).toBe(62.5)
  })

  it('suggests increasing reps when recent RPE is moderate', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 60, reps: 8, rpe: 8 }),
      makeWorkout({ id: 'b', performed_at: '2026-06-08', weight_kg: 60, reps: 8, rpe: 8 }),
    ]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('increase_reps')
    expect(plan?.targetWeight).toBe(60)
    expect(plan?.targetReps).toBe(9)
  })

  it('suggests a deload when recent RPE is consistently very high', () => {
    const entries = [
      makeWorkout({ id: 'a', performed_at: '2026-06-01', weight_kg: 60, reps: 5, rpe: 9 }),
      makeWorkout({ id: 'b', performed_at: '2026-06-08', weight_kg: 60, reps: 5, rpe: 9.5 }),
    ]
    const plan = computeProgressiveOverload('Bench Press', entries)
    expect(plan?.action).toBe('deload')
    expect(plan?.targetWeight).toBe(54)
  })

  it('uses a smaller increment for dumbbell exercises', () => {
    const entries = [makeWorkout({ exercise_name: 'Dumbbell Bench Press', weight_kg: 20, reps: 8, rpe: 6 })]
    const plan = computeProgressiveOverload('Dumbbell Bench Press', entries)
    expect(plan?.targetWeight).toBe(21)
  })
})

describe('computeAIDailySummary', () => {
  it('handles missing recommendation gracefully', () => {
    const msg = computeAIDailySummary(null, { pushSets: 0, pullSets: 0, ratio: null, status: 'insufficient_data' })
    expect(msg).toContain('ยังไม่มีข้อมูล')
  })

  it('mentions the recommended muscle group and recovery percentage', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 100 },
      { pushSets: 10, pullSets: 10, ratio: 1, status: 'balanced' }
    )
    expect(msg).toContain('ขา')
    expect(msg).toContain('100')
    expect(msg).not.toContain('ดึง')
  })

  it('appends a pull suggestion when push dominant', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 20, pullSets: 8, ratio: 2.5, status: 'push_dominant' }
    )
    expect(msg).toContain('ดึง')
  })

  it('appends a push suggestion when pull dominant', () => {
    const msg = computeAIDailySummary(
      { muscleGroup: 'ขา', pct: 80 },
      { pushSets: 6, pullSets: 20, ratio: 0.3, status: 'pull_dominant' }
    )
    expect(msg).toContain('ดัน')
  })
})
