import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeSessionMuscleRecovery, tierForPct } from './recoveryScore'

const FIXED_TODAY = '2026-07-18T09:00:00'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_TODAY))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tierForPct', () => {
  it('buckets percentages into the expected tiers', () => {
    expect(tierForPct(100)).toBe('green')
    expect(tierForPct(75)).toBe('green')
    expect(tierForPct(60)).toBe('yellow')
    expect(tierForPct(40)).toBe('orange')
    expect(tierForPct(10)).toBe('red')
  })
})

describe('computeSessionMuscleRecovery', () => {
  it('gives a heavily-trained muscle a lower readiness than a lightly-trained one', () => {
    const { byMuscle } = computeSessionMuscleRecovery(
      {
        อก: { sets: 12, avgRpe: 9 }, // hard chest day, well over the weekly target in one session
        ไหล่: { sets: 2, avgRpe: 6 }, // just a light accessory hit
      },
      {}
    )
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    const shoulders = byMuscle.find((m) => m.muscleGroup === 'ไหล่')!
    expect(chest.trainedToday).toBe(true)
    expect(shoulders.trainedToday).toBe(true)
    expect(chest.pct).toBeLessThan(shoulders.pct)
    expect(chest.tier).not.toBe('green')
  })

  it('never drops a trained muscle below 10% or above 100%', () => {
    const { byMuscle } = computeSessionMuscleRecovery({ อก: { sets: 50, avgRpe: 10 } }, {})
    const chest = byMuscle.find((m) => m.muscleGroup === 'อก')!
    expect(chest.pct).toBeGreaterThanOrEqual(10)
    expect(chest.pct).toBeLessThanOrEqual(100)
  })

  it('falls back to the time-based recovery estimate for muscles not trained today', () => {
    const { byMuscle } = computeSessionMuscleRecovery({}, { หลัง: '2026-07-17' }) // trained yesterday
    const back = byMuscle.find((m) => m.muscleGroup === 'หลัง')!
    expect(back.trainedToday).toBe(false)
    expect(back.pct).toBeLessThan(100) // recently trained, not fully rested
  })

  it('treats an untouched muscle with no history as fully ready', () => {
    const { byMuscle } = computeSessionMuscleRecovery({}, {})
    const legs = byMuscle.find((m) => m.muscleGroup === 'ขา')!
    expect(legs.trainedToday).toBe(false)
    expect(legs.pct).toBe(100)
  })

  it('averages all tracked muscle groups into an overall score', () => {
    const { overall, byMuscle } = computeSessionMuscleRecovery({}, {})
    const expectedAvg = Math.round(byMuscle.reduce((s, m) => s + m.pct, 0) / byMuscle.length)
    expect(overall).toBe(expectedAvg)
    expect(overall).toBe(100) // nothing trained, nothing recent -> fully ready across the board
  })
})
