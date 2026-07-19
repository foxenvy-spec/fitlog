import { describe, it, expect } from 'vitest'
import { findExerciseByName, searchExercises } from './exercises'

describe('findExerciseByName', () => {
  it('matches the canonical English name, Thai name, or any alias for the same exercise', () => {
    const names = ['Bench Press', 'เบนช์เพรส', 'Flat Bench Press', 'Barbell Bench Press', 'Flat BB Bench']
    names.forEach((name) => {
      const match = findExerciseByName(name)
      expect(match?.id).toBe('bench-press')
    })
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(findExerciseByName('  flat bb bench  ')?.id).toBe('bench-press')
    expect(findExerciseByName('BARBELL BENCH PRESS')?.id).toBe('bench-press')
  })

  it('returns the matched exercise primary + secondary muscles', () => {
    const match = findExerciseByName('Barbell Bench Press')
    expect(match?.muscleGroup).toBe('อก')
    expect(match?.secondaryMuscles).toEqual(['ไหล่', 'แขน'])
  })

  it('returns undefined for unknown or empty names', () => {
    expect(findExerciseByName('some made up exercise name')).toBeUndefined()
    expect(findExerciseByName('')).toBeUndefined()
    expect(findExerciseByName('   ')).toBeUndefined()
  })
})

describe('searchExercises still supports partial matches for the picker dropdown', () => {
  it('finds bench press variants by partial text', () => {
    const results = searchExercises('bb bench')
    expect(results.some((ex) => ex.id === 'bench-press')).toBe(true)
  })
})
