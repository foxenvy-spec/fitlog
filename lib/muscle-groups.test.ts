import { describe, it, expect } from 'vitest'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS_EN, muscleGroupLabel, guessSecondaryMuscles } from './muscle-groups'

describe('muscleGroupLabel', () => {
  it('returns the Thai muscle group name unchanged for lang=th', () => {
    expect(muscleGroupLabel('อก', 'th')).toBe('อก')
    expect(muscleGroupLabel('หลัง', 'th')).toBe('หลัง')
  })

  it('returns the English label for lang=en', () => {
    expect(muscleGroupLabel('อก', 'en')).toBe('Chest')
    expect(muscleGroupLabel('หลัง', 'en')).toBe('Back')
    expect(muscleGroupLabel('ขา', 'en')).toBe('Legs')
    expect(muscleGroupLabel('ไหล่', 'en')).toBe('Shoulders')
  })

  it('has an English label defined for every muscle group', () => {
    MUSCLE_GROUPS.forEach((mg) => {
      expect(MUSCLE_GROUP_LABELS_EN[mg]).toBeTruthy()
    })
  })
})

describe('guessSecondaryMuscles', () => {
  it('guesses shoulders + arms for chest press variants', () => {
    expect(guessSecondaryMuscles('Incline Barbell/Smith Press', 'อก')).toEqual(['ไหล่', 'แขน'])
    expect(guessSecondaryMuscles('Flat Dumbbell Press', 'อก')).toEqual(['ไหล่', 'แขน'])
  })

  it('guesses shoulders only for fly variants', () => {
    expect(guessSecondaryMuscles('Dumbbell Fly (ค้างตอนยืด)', 'อก')).toEqual(['ไหล่'])
  })

  it('guesses arms for rows, pulldowns, and pull-ups', () => {
    expect(guessSecondaryMuscles('Barbell Row', 'หลัง')).toEqual(['แขน'])
    expect(guessSecondaryMuscles('Lat Pulldown', 'หลัง')).toEqual(['แขน'])
    expect(guessSecondaryMuscles('Pull-up', 'หลัง')).toEqual(['แขน'])
  })

  it('guesses legs + core for deadlifts and core only for squats', () => {
    expect(guessSecondaryMuscles('Romanian Deadlift', 'หลัง')).toEqual(['ขา', 'แกนกลางลำตัว'])
    expect(guessSecondaryMuscles('Back Squat', 'ขา')).toEqual(['แกนกลางลำตัว'])
  })

  it('returns no secondary muscles for isolation moves', () => {
    expect(guessSecondaryMuscles('Leg Curl', 'ขา')).toEqual([])
    expect(guessSecondaryMuscles('Bicep Curl', 'แขน')).toEqual([])
    expect(guessSecondaryMuscles('Lateral Raise', 'ไหล่')).toEqual([])
  })

  it('falls back to the primary-muscle default when no keyword matches', () => {
    expect(guessSecondaryMuscles('Mystery Machine Move', 'อก')).toEqual(['ไหล่', 'แขน'])
    expect(guessSecondaryMuscles('Mystery Machine Move', 'แขน')).toEqual([])
  })

  it('never includes the primary muscle in the secondary list', () => {
    expect(guessSecondaryMuscles('Overhead Press', 'ไหล่')).not.toContain('ไหล่')
  })
})
