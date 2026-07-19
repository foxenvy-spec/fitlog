import { describe, it, expect } from 'vitest'
import { parseRestSeconds, initSessionSet, computeSessionSummary, aggregateMuscleLoads } from './workoutSession'
import type { ProgramExercise } from './types'

describe('parseRestSeconds', () => {
  it('falls back to default when empty', () => {
    expect(parseRestSeconds(null)).toBe(90)
    expect(parseRestSeconds('')).toBe(90)
  })

  it('parses explicit minutes (English and Thai)', () => {
    expect(parseRestSeconds('2-3 min')).toBe(150) // avg(2,3)=2.5 -> 150s
    expect(parseRestSeconds('1-2 นาที')).toBe(90) // avg(1,2)=1.5 -> 90s
    expect(parseRestSeconds('3 min')).toBe(180)
  })

  it('parses explicit seconds', () => {
    expect(parseRestSeconds('90s')).toBe(90)
    expect(parseRestSeconds('45 วินาที')).toBe(45)
  })

  it('guesses unit from magnitude when unit is missing', () => {
    expect(parseRestSeconds('2')).toBe(120) // small number -> assume minutes
    expect(parseRestSeconds('90')).toBe(90) // large number -> assume seconds
  })

  it('ignores invalid/zero values', () => {
    expect(parseRestSeconds('abc')).toBe(90)
    expect(parseRestSeconds('0')).toBe(90)
  })
})

function makeExercise(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    id: 'ex-1',
    program_day_id: 'day-1',
    user_id: 'user-1',
    position: 0,
    exercise_name: 'เบนช์เพรส',
    muscle_group: 'อก',
    sets: 4,
    target_reps: '6-8',
    target_rir: '1-2',
    rest: '2-3 min',
    rationale: null,
    default_weight_kg: 60,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('initSessionSet', () => {
  it('seeds actual values from the program targets', () => {
    const state = initSessionSet(makeExercise())
    expect(state.setsDone).toBe(0)
    expect(state.reps).toBe(7) // avg(6,8)
    expect(state.weightKg).toBe(60)
    expect(state.rpe).toBe(8.5) // rir avg 1.5 -> rpe 8.5
    expect(state.logged).toBe(false)
  })

  it('handles missing targets gracefully', () => {
    const state = initSessionSet(makeExercise({ target_reps: null, target_rir: null, default_weight_kg: null }))
    expect(state.reps).toBeNull()
    expect(state.weightKg).toBeNull()
    expect(state.rpe).toBeNull()
  })
})

describe('computeSessionSummary', () => {
  it('sums sets and estimates volume across logged exercises', () => {
    const summary = computeSessionSummary([
      { setsDone: 4, reps: 8, weightKg: 60 },
      { setsDone: 3, reps: 10, weightKg: 20 },
    ])
    expect(summary.exerciseCount).toBe(2)
    expect(summary.totalSets).toBe(7)
    expect(summary.totalVolumeKg).toBe(4 * 8 * 60 + 3 * 10 * 20)
  })

  it('treats missing reps/weight as zero volume but still counts sets', () => {
    const summary = computeSessionSummary([{ setsDone: 3, reps: null, weightKg: null }])
    expect(summary.exerciseCount).toBe(1)
    expect(summary.totalSets).toBe(3)
    expect(summary.totalVolumeKg).toBe(0)
  })

  it('returns zeros for an empty session', () => {
    expect(computeSessionSummary([])).toEqual({ exerciseCount: 0, totalSets: 0, totalVolumeKg: 0 })
  })
})

describe('aggregateMuscleLoads', () => {
  it('sums sets per muscle group and weights the average RPE by sets', () => {
    const result = aggregateMuscleLoads([
      { muscleGroup: 'อก', sets: 4, rpe: 8 },
      { muscleGroup: 'อก', sets: 2, rpe: 9 },
      { muscleGroup: 'ไหล่', sets: 3, rpe: null },
    ])
    expect(result['อก'].sets).toBe(6)
    expect(result['อก'].avgRpe).toBe(8.3) // (4*8 + 2*9) / 6 = 8.33 -> rounded to 1dp
    expect(result['ไหล่']).toEqual({ sets: 3, avgRpe: null })
  })

  it('skips entries with no muscle group or zero sets', () => {
    const result = aggregateMuscleLoads([
      { muscleGroup: null, sets: 5, rpe: 8 },
      { muscleGroup: 'อก', sets: 0, rpe: 8 },
    ])
    expect(result).toEqual({})
  })
})
