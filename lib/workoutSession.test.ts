import { describe, it, expect } from 'vitest'
import {
  parseRestSeconds,
  initSessionSet,
  initSessionStates,
  firstUnfinishedIndex,
  computeSessionSummary,
  aggregateMuscleLoads,
} from './workoutSession'
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
    expect(state.setsLog).toEqual([])
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

describe('initSessionStates', () => {
  it('marks an exercise already logged today as logged and restores its sets', () => {
    const exercises = [
      makeExercise({ id: 'ex-1', exercise_name: 'เบนช์เพรส' }),
      makeExercise({ id: 'ex-2', exercise_name: 'ดึงข้อ' }),
    ]
    const states = initSessionStates(
      exercises,
      [{ id: 'w-1', exercise_name: 'เบนช์เพรส', rpe: 8 }],
      [
        { workout_id: 'w-1', set_number: 1, reps: 8, weight_kg: 60 },
        { workout_id: 'w-1', set_number: 2, reps: 6, weight_kg: 65 },
      ]
    )

    expect(states['ex-1'].logged).toBe(true)
    expect(states['ex-1'].workoutId).toBe('w-1')
    expect(states['ex-1'].setsLog).toEqual([
      { reps: 8, weightKg: 60 },
      { reps: 6, weightKg: 65 },
    ])
    // draft ค่าล่าสุดควรตั้งจากเซ็ตท้ายสุดที่บันทึกไว้ ไม่ใช่ค่าเป้าหมายเดิม
    expect(states['ex-1'].reps).toBe(6)
    expect(states['ex-1'].weightKg).toBe(65)

    // ท่าที่ยังไม่บันทึกวันนี้ต้องเหมือน initSessionSet ปกติ
    expect(states['ex-2'].logged).toBe(false)
    expect(states['ex-2'].setsLog).toEqual([])
  })

  it('leaves every exercise untouched when nothing was logged today', () => {
    const exercises = [makeExercise({ id: 'ex-1' })]
    const states = initSessionStates(exercises, [], [])
    expect(states['ex-1']).toEqual(initSessionSet(exercises[0]))
  })
})

describe('firstUnfinishedIndex', () => {
  it('resumes at the first exercise not yet logged', () => {
    const exercises = [
      makeExercise({ id: 'ex-1' }),
      makeExercise({ id: 'ex-2' }),
      makeExercise({ id: 'ex-3' }),
    ]
    const states = {
      'ex-1': { logged: true },
      'ex-2': { logged: false },
      'ex-3': { logged: false },
    }
    expect(firstUnfinishedIndex(exercises, states)).toBe(1)
  })

  it('points at the last exercise when everything is already logged', () => {
    const exercises = [makeExercise({ id: 'ex-1' }), makeExercise({ id: 'ex-2' })]
    const states = { 'ex-1': { logged: true }, 'ex-2': { logged: true } }
    expect(firstUnfinishedIndex(exercises, states)).toBe(1)
  })
})

describe('computeSessionSummary', () => {
  it('sums sets and volume across logged exercises using each set\'s own reps/weight', () => {
    const summary = computeSessionSummary([
      { setsLog: [{ reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }, { reps: 8, weightKg: 60 }, { reps: 6, weightKg: 60 }] },
      { setsLog: [{ reps: 10, weightKg: 20 }, { reps: 10, weightKg: 20 }, { reps: 10, weightKg: 20 }] },
    ])
    expect(summary.exerciseCount).toBe(2)
    expect(summary.totalSets).toBe(7)
    expect(summary.totalVolumeKg).toBe((8 + 8 + 8 + 6) * 60 + 3 * 10 * 20)
  })

  it('reflects a set-by-set drop in reps/weight instead of duplicating one value', () => {
    // ก่อนแก้ไข: setsDone*reps*weight เดียวจะไม่แม่นสำหรับ drop set แบบนี้
    const summary = computeSessionSummary([
      { setsLog: [{ reps: 10, weightKg: 60 }, { reps: 8, weightKg: 50 }, { reps: 6, weightKg: 40 }] },
    ])
    expect(summary.totalSets).toBe(3)
    expect(summary.totalVolumeKg).toBe(10 * 60 + 8 * 50 + 6 * 40)
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
