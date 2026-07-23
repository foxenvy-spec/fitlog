import { describe, it, expect } from 'vitest'
import { computeVO2Max, classifyVO2Max } from './vo2max'

describe('computeVO2Max', () => {
  it('computes using the Uth formula', () => {
    expect(computeVO2Max(190, 60)).toBeCloseTo(48.5, 1)
  })

  it('returns null when either value is missing', () => {
    expect(computeVO2Max(null, 60)).toBeNull()
    expect(computeVO2Max(190, null)).toBeNull()
  })

  it('returns null when values are zero or negative', () => {
    expect(computeVO2Max(0, 60)).toBeNull()
    expect(computeVO2Max(190, 0)).toBeNull()
    expect(computeVO2Max(-190, 60)).toBeNull()
  })

  it('returns null when resting HR is not below max HR (invalid input)', () => {
    expect(computeVO2Max(100, 100)).toBeNull()
    expect(computeVO2Max(100, 120)).toBeNull()
  })
})

describe('classifyVO2Max', () => {
  it('classifies high values as excellent', () => {
    expect(classifyVO2Max(60).key).toBe('excellent')
  })

  it('classifies low values as needing improvement', () => {
    expect(classifyVO2Max(20).key).toBe('low')
  })

  it('classifies mid-range values as fair', () => {
    expect(classifyVO2Max(38).key).toBe('fair')
  })
})
