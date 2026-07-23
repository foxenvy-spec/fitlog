import { describe, it, expect } from 'vitest'
import type { Workout } from './types'
import { computeWeeklyCardioVolume } from './weeklyCardioVolume'

function makeCardio(overrides: Partial<Workout>): Workout {
  return {
    id: 'w1',
    user_id: 'u1',
    type: 'cardio',
    performed_at: '2026-07-18',
    exercise_name: null,
    muscle_group: null,
    secondary_muscles: [],
    exercise_library_id: null,
    sets: null,
    reps: null,
    weight_kg: null,
    rpe: null,
    cardio_type: 'วิ่ง',
    distance_km: null,
    duration_min: null,
    avg_heart_rate: null,
    cadence: null,
    calories_kcal: null,
    notes: null,
    created_at: '2026-07-18T10:00:00Z',
    total_volume_kg: null,
    ...overrides,
  }
}

describe('computeWeeklyCardioVolume', () => {
  it('returns all zeros for an empty week', () => {
    const result = computeWeeklyCardioVolume([], 70, 190)
    expect(result.totalMinutes).toBe(0)
    expect(result.sessions).toBe(0)
    expect(result.totalCalories).toBe(0)
    expect(result.totalDistanceKm).toBe(0)
    expect(result.hrZones.sessionsWithHR).toBe(0)
  })

  it('sums minutes, sessions, and distance across sessions', () => {
    const workouts = [
      makeCardio({ duration_min: 30, distance_km: 5 }),
      makeCardio({ duration_min: 45, distance_km: 8, cardio_type: 'ปั่นจักรยาน' }),
    ]
    const result = computeWeeklyCardioVolume(workouts, 70, 190)
    expect(result.totalMinutes).toBe(75)
    expect(result.sessions).toBe(2)
    expect(result.totalDistanceKm).toBe(13)
  })

  it('prefers real calories_kcal over the MET estimate when present', () => {
    const workouts = [makeCardio({ duration_min: 30, calories_kcal: 500 })]
    const result = computeWeeklyCardioVolume(workouts, 70, 190)
    expect(result.totalCalories).toBe(500)
  })

  it('falls back to the MET-based estimate when calories_kcal is missing', () => {
    const workouts = [makeCardio({ duration_min: 30, cardio_type: 'วิ่ง' })]
    const result = computeWeeklyCardioVolume(workouts, 70, 190)
    // 9.0 MET * 3.5 * 70kg / 200 * 30min = 330.75
    expect(result.totalCalories).toBeGreaterThan(0)
    expect(result.totalCalories).toBe(Math.round((9.0 * 3.5 * 70) / 200 * 30))
  })

  it('aggregates HR zone minutes from sessions that have avg_heart_rate', () => {
    const workouts = [
      makeCardio({ duration_min: 30, avg_heart_rate: 100 }), // z1
      makeCardio({ duration_min: 20, avg_heart_rate: null }), // no HR data
    ]
    const result = computeWeeklyCardioVolume(workouts, 70, 190)
    expect(result.hrZones.sessionsWithHR).toBe(1)
    expect(result.hrZones.totalCardioSessions).toBe(2)
    expect(result.hrZones.minutesByZone.z1).toBe(30)
  })

  it('averages cadence separately for spm (run/walk) vs rpm (cycling) sessions', () => {
    const workouts = [
      makeCardio({ cardio_type: 'วิ่ง', cadence: 170 }),
      makeCardio({ cardio_type: 'วิ่ง', cadence: 180 }),
      makeCardio({ cardio_type: 'ปั่นจักรยาน', cadence: 90 }),
    ]
    const result = computeWeeklyCardioVolume(workouts, 70, 190)
    expect(result.avgCadenceSpm).toBe(175)
    expect(result.avgCadenceRpm).toBe(90)
  })

  it('returns null cadence averages when no sessions have cadence data', () => {
    const workouts = [makeCardio({ cardio_type: 'วิ่ง', cadence: null })]
    const result = computeWeeklyCardioVolume(workouts, 70, 190)
    expect(result.avgCadenceSpm).toBeNull()
    expect(result.avgCadenceRpm).toBeNull()
  })
})
