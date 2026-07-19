import { describe, it, expect } from 'vitest'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS_EN, muscleGroupLabel } from './muscle-groups'

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
