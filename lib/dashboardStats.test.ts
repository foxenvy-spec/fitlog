import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Workout, ProgramDay } from './types'
import {
  computeCurrentStreak,
  computeTodayTotals,
  computeRecoveryPct,
  recoveryStatusColor,
  computeRecoveryReadyInHours,
  estimateCaloriesToday,
  suggestNextPR,
  computeVolumeTrendInsights,
  computeImbalanceInsights,
  computeMissedMuscleInsights,
  volumeStatus,
  relativeDayLabel,
  findNextProgramDay,
  getWeekRange,
  getPreviousWeekRange,
  suggestMuscleToTrain,
} from './dashboardStats'

// ทุกฟังก์ชันที่อ้างอิง "วันนี้" ผ่าน todayStr()/new Date() ต้อง freeze เวลาไว้
// ไม่งั้น test จะ flaky ตามวันที่รันจริง
const FIXED_TODAY = '2026-07-18T09:00:00' // Saturday

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_TODAY))
})

afterEach(() => {
  vi.useRealTimers()
})

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: 'w1',
    user_id: 'u1',
    type: 'strength',
    performed_at: '2026-07-18',
    exercise_name: null,
    muscle_group: null,
    sets: null,
    reps: null,
    weight_kg: null,
    rpe: null,
    cardio_type: null,
    distance_km: null,
    duration_min: null,
    notes: null,
    created_at: '2026-07-18T10:00:00Z',
    ...overrides,
  }
}

describe('computeCurrentStreak', () => {
  it('returns 0 for no history', () => {
    expect(computeCurrentStreak([])).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    expect(computeCurrentStreak(['2026-07-16', '2026-07-17', '2026-07-18'])).toBe(3)
  })

  it('counts consecutive days ending yesterday (still "alive")', () => {
    expect(computeCurrentStreak(['2026-07-15', '2026-07-16', '2026-07-17'])).toBe(3)
  })

  it('resets to 0 if the last workout was 2+ days ago', () => {
    expect(computeCurrentStreak(['2026-07-10', '2026-07-15', '2026-07-16'])).toBe(0)
  })

  it('stops counting at the first gap', () => {
    expect(computeCurrentStreak(['2026-07-10', '2026-07-16', '2026-07-17', '2026-07-18'])).toBe(3)
  })

  it('de-duplicates repeated dates', () => {
    expect(computeCurrentStreak(['2026-07-18', '2026-07-18', '2026-07-17'])).toBe(2)
  })
})

describe('computeTodayTotals', () => {
  it('returns zeroed totals for no workouts', () => {
    const totals = computeTodayTotals([])
    expect(totals).toEqual({ volumeKg: 0, sets: 0, durationMin: null, entryCount: 0 })
  })

  it('sums strength volume as sets * reps * weight', () => {
    const workouts = [
      makeWorkout({ sets: 3, reps: 10, weight_kg: 20 }), // 600
      makeWorkout({ sets: 4, reps: 8, weight_kg: 15 }), // 480
    ]
    expect(computeTodayTotals(workouts).volumeKg).toBe(1080)
  })

  it('ignores incomplete strength entries when computing volume', () => {
    const workouts = [makeWorkout({ sets: 3, reps: null, weight_kg: 20 })]
    expect(computeTodayTotals(workouts).volumeKg).toBe(0)
  })

  it('uses cardio duration_min when only one entry exists', () => {
    const workouts = [makeWorkout({ type: 'cardio', duration_min: 25 })]
    expect(computeTodayTotals(workouts).durationMin).toBe(25)
  })

  it('uses the max of session span and cardio duration when both apply', () => {
    const workouts = [
      makeWorkout({ type: 'cardio', duration_min: 5, created_at: '2026-07-18T08:00:00Z' }),
      makeWorkout({ type: 'strength', created_at: '2026-07-18T08:45:00Z' }),
    ]
    // session span = 45 min, cardio = 5 min -> should take 45
    expect(computeTodayTotals(workouts).durationMin).toBe(45)
  })

  it('counts every entry, strength or cardio, toward entryCount', () => {
    const workouts = [makeWorkout({ type: 'strength' }), makeWorkout({ type: 'cardio' })]
    expect(computeTodayTotals(workouts).entryCount).toBe(2)
  })
})

describe('estimateCaloriesToday', () => {
  it('returns 0 for an empty day', () => {
    expect(estimateCaloriesToday([], null, 70)).toBe(0)
  })

  it('estimates cardio calories using the exercise-specific MET when known', () => {
    const workouts = [makeWorkout({ type: 'cardio', cardio_type: 'วิ่ง', duration_min: 30 })]
    // (9.0 * 3.5 * 70 / 200) * 30 = 330.75 -> rounds to 331
    expect(estimateCaloriesToday(workouts, null, 70)).toBe(331)
  })

  it('falls back to the default MET for an unrecognized cardio type', () => {
    const workouts = [makeWorkout({ type: 'cardio', cardio_type: 'ไม่รู้จัก', duration_min: 30 })]
    // (6.0 * 3.5 * 70 / 200) * 30 = 220.5 -> Math.round rounds half-up to 221
    expect(estimateCaloriesToday(workouts, null, 70)).toBe(221)
  })

  it('falls back to default bodyweight when none is provided', () => {
    const withWeight = estimateCaloriesToday([], 20, 70)
    const withoutWeight = estimateCaloriesToday([], 20, null)
    expect(withoutWeight).toBe(withWeight) // 70kg is the documented default
  })

  it('adds strength session calories on top of cardio', () => {
    const workouts = [makeWorkout({ type: 'cardio', cardio_type: 'วิ่ง', duration_min: 10 })]
    const cardioOnly = estimateCaloriesToday(workouts, null, 70)
    const withStrength = estimateCaloriesToday(workouts, 20, 70)
    expect(withStrength).toBeGreaterThan(cardioOnly)
  })
})

describe('computeRecoveryPct (Recovery Logic)', () => {
  it('is 100% (fully recovered) when a muscle has never been trained', () => {
    expect(computeRecoveryPct(null, 'อก')).toBe(100)
  })

  it('is 0% the same day it was trained', () => {
    expect(computeRecoveryPct('2026-07-18', 'อก')).toBe(0)
  })

  it('scales linearly with the muscle-specific recovery window', () => {
    // อก window = 2 days -> 1 day since training = 50%
    expect(computeRecoveryPct('2026-07-17', 'อก')).toBe(50)
    // แขน window = 1.5 days -> 1 day since training = 67%
    expect(computeRecoveryPct('2026-07-17', 'แขน')).toBe(67)
  })

  it('clamps at 100% once fully past the recovery window', () => {
    expect(computeRecoveryPct('2026-07-01', 'อก')).toBe(100)
  })

  it('falls back to a default window for an unknown muscle group', () => {
    // unknown group defaults to 2-day window, same math as 'อก'
    expect(computeRecoveryPct('2026-07-17', 'ไม่รู้จัก')).toBe(50)
  })
})

describe('recoveryStatusColor', () => {
  it('is red (rust) from 0-40%', () => {
    expect(recoveryStatusColor(0)).toBe('#C1503A')
    expect(recoveryStatusColor(40)).toBe('#C1503A')
  })

  it('is yellow (amber) from 41-75%', () => {
    expect(recoveryStatusColor(41)).toBe('#E8A33D')
    expect(recoveryStatusColor(75)).toBe('#E8A33D')
  })

  it('is green (moss) from 76-100%', () => {
    expect(recoveryStatusColor(76)).toBe('#7A9B57')
    expect(recoveryStatusColor(100)).toBe('#7A9B57')
  })
})

describe('computeRecoveryReadyInHours', () => {
  it('returns null when the muscle has never been trained (already fully recovered)', () => {
    expect(computeRecoveryReadyInHours(null, 'อก')).toBeNull()
  })

  it('counts down in hours from midnight of the last trained date', () => {
    // FIXED_TODAY = 2026-07-18T09:00, trained today -> 9h elapsed since midnight
    // อก window = 2 days = 48h -> 39h remaining
    expect(computeRecoveryReadyInHours('2026-07-18', 'อก')).toBe(39)
    // แขน window = 1.5 days = 36h, trained yesterday -> 33h elapsed -> 3h remaining
    expect(computeRecoveryReadyInHours('2026-07-17', 'แขน')).toBe(3)
  })

  it('returns null once fully past the recovery window', () => {
    expect(computeRecoveryReadyInHours('2026-07-01', 'อก')).toBeNull()
  })
})

describe('suggestNextPR (PR Logic)', () => {
  it('returns null when there is no history for the exercise', () => {
    expect(suggestNextPR('Bench Press', [])).toBeNull()
  })

  it('ignores entries with no recorded weight', () => {
    const history = [makeWorkout({ exercise_name: 'Bench Press', weight_kg: null, reps: 8 })]
    expect(suggestNextPR('Bench Press', history)).toBeNull()
  })

  it('picks the heaviest recorded set as the baseline', () => {
    const history = [
      makeWorkout({ exercise_name: 'Bench Press', weight_kg: 60, reps: 8 }),
      makeWorkout({ exercise_name: 'Bench Press', weight_kg: 70, reps: 5 }),
      makeWorkout({ exercise_name: 'Bench Press', weight_kg: 65, reps: 6 }),
    ]
    const pr = suggestNextPR('Bench Press', history)
    expect(pr?.lastWeight).toBe(70)
    expect(pr?.lastReps).toBe(5)
  })

  it('suggests a +2.5kg jump for barbell exercises', () => {
    const history = [makeWorkout({ exercise_name: 'Bench Press', weight_kg: 60, reps: 8 })]
    const pr = suggestNextPR('Bench Press', history)
    expect(pr?.targetWeight).toBe(62.5)
    expect(pr?.targetReps).toBe(8)
  })

  it('suggests a smaller +1kg jump for dumbbell exercises', () => {
    const history = [makeWorkout({ exercise_name: 'Dumbbell Bench Press', weight_kg: 20, reps: 10 })]
    const pr = suggestNextPR('Dumbbell Bench Press', history)
    expect(pr?.targetWeight).toBe(21)
  })

  it('ignores cardio entries even if they share an exercise_name', () => {
    const history = [makeWorkout({ type: 'cardio', exercise_name: 'Bench Press', weight_kg: 999 })]
    expect(suggestNextPR('Bench Press', history)).toBeNull()
  })

  it('defaults to the +2.5kg barbell increment for exercises not in the catalog', () => {
    const history = [makeWorkout({ exercise_name: 'ท่าที่พึ่งเพิ่มเอง', weight_kg: 40, reps: 10 })]
    const pr = suggestNextPR('ท่าที่พึ่งเพิ่มเอง', history)
    expect(pr?.targetWeight).toBe(42.5)
  })
})

describe('computeVolumeTrendInsights', () => {
  it('flags a muscle with a >=15% week-over-week increase', () => {
    const insights = computeVolumeTrendInsights({ อก: 12 }, { อก: 10 })
    expect(insights).toHaveLength(1)
    expect(insights[0].id).toBe('volume-อก')
  })

  it('ignores muscles below the minimum last-week sets threshold', () => {
    const insights = computeVolumeTrendInsights({ อก: 5 }, { อก: 1 })
    expect(insights).toHaveLength(0)
  })

  it('ignores muscles whose increase is below the threshold', () => {
    const insights = computeVolumeTrendInsights({ อก: 11 }, { อก: 10 })
    expect(insights).toHaveLength(0)
  })
})

describe('computeImbalanceInsights', () => {
  const muscles = ['อก', 'หลัง', 'ขา'] as const

  it('does nothing below the minimum total-sets threshold', () => {
    const insights = computeImbalanceInsights({ อก: 2, หลัง: 2, ขา: 2 }, muscles)
    expect(insights).toHaveLength(0)
  })

  it('flags a muscle trained well below the average of the others', () => {
    const insights = computeImbalanceInsights({ อก: 2, หลัง: 10, ขา: 10 }, muscles)
    expect(insights.map((i) => i.id)).toContain('imbalance-อก')
  })

  it('does not flag muscles that are reasonably close to average', () => {
    const insights = computeImbalanceInsights({ อก: 9, หลัง: 10, ขา: 10 }, muscles)
    expect(insights).toHaveLength(0)
  })
})

describe('computeMissedMuscleInsights', () => {
  it('flags a muscle group not trained within the threshold window', () => {
    const insights = computeMissedMuscleInsights({ อก: '2026-07-05' }, 7)
    expect(insights.map((i) => i.id)).toContain('missed-อก')
  })

  it('does not flag a muscle group trained recently', () => {
    const insights = computeMissedMuscleInsights({ อก: '2026-07-17' }, 7)
    expect(insights).toHaveLength(0)
  })

  it('does not flag a muscle group with no training history at all', () => {
    const insights = computeMissedMuscleInsights({ อก: null }, 7)
    expect(insights).toHaveLength(0)
  })
})

describe('volumeStatus', () => {
  it('is "met" once the weekly target is reached', () => {
    expect(volumeStatus(10, 10, 3)).toBe('met')
  })

  it('is "onTrack" when pacing at or above 80% of the prorated target', () => {
    // day 7 of 7, target 10 -> prorated = 10, 80% = 8
    expect(volumeStatus(8, 10, 7)).toBe('onTrack')
  })

  it('is "behind" when pacing below 80% of the prorated target', () => {
    expect(volumeStatus(3, 10, 7)).toBe('behind')
  })

  it('is not "behind" early in the week just because the raw total is low', () => {
    // day 1 of 7, target 14 -> prorated = 2, 80% = 1.6
    expect(volumeStatus(2, 14, 1)).toBe('onTrack')
  })
})

describe('findNextProgramDay', () => {
  const days: ProgramDay[] = [
    { id: '1', user_id: 'u', day_of_week: 1, title: 'Push', created_at: '' },
    { id: '2', user_id: 'u', day_of_week: 4, title: 'Pull', created_at: '' },
  ]

  it('returns null when no program days exist', () => {
    expect(findNextProgramDay([], 1)).toBeNull()
  })

  it('finds the very next day when it is tomorrow', () => {
    const next = findNextProgramDay(days, 0) // Sunday -> Monday is day 1
    expect(next?.day.title).toBe('Push')
    expect(next?.daysAway).toBe(1)
  })

  it('wraps around to the following week if needed', () => {
    const next = findNextProgramDay(days, 4) // Thursday -> next is Monday, 4 days away
    expect(next?.day.title).toBe('Push')
    expect(next?.daysAway).toBe(4)
  })
})

describe('relativeDayLabel', () => {
  it('labels today', () => {
    expect(relativeDayLabel('2026-07-18')).toBe('วันนี้')
  })

  it('labels yesterday', () => {
    expect(relativeDayLabel('2026-07-17')).toBe('เมื่อวาน')
  })

  it('labels older dates with a day count', () => {
    expect(relativeDayLabel('2026-07-10')).toBe('8 วันที่แล้ว')
  })
})

describe('getWeekRange / getPreviousWeekRange', () => {
  it('returns a Monday-to-Sunday range containing today', () => {
    // FIXED_TODAY is Saturday 2026-07-18
    const { start, end } = getWeekRange(new Date(FIXED_TODAY))
    expect(start).toBe('2026-07-13') // Monday
    expect(end).toBe('2026-07-19') // Sunday
  })

  it('returns the immediately preceding week', () => {
    const { start, end } = getPreviousWeekRange(new Date(FIXED_TODAY))
    expect(start).toBe('2026-07-06')
    expect(end).toBe('2026-07-12')
  })
})

describe('suggestMuscleToTrain', () => {
  it('picks the muscle group with the highest recovery % (most ready to train)', () => {
    const rec = suggestMuscleToTrain({ อก: 95, ขา: 20, หลัง: 65 })
    expect(rec?.muscleGroup).toBe('อก')
    expect(rec?.pct).toBe(95)
  })

  it('returns null when there is no data', () => {
    expect(suggestMuscleToTrain({})).toBeNull()
  })
})
