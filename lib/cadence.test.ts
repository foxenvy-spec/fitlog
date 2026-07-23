import { describe, it, expect } from 'vitest'
import { cadenceUnitFor, cadenceUnitLabel, cadenceFieldLabel } from './cadence'

describe('cadenceUnitFor', () => {
  it('returns rpm for cycling', () => {
    expect(cadenceUnitFor('ปั่นจักรยาน')).toBe('rpm')
  })

  it('returns spm for running', () => {
    expect(cadenceUnitFor('วิ่ง')).toBe('spm')
  })

  it('returns spm for unknown/custom types', () => {
    expect(cadenceUnitFor('พายเรือ')).toBe('spm')
  })

  it('returns spm when cardioType is null or empty', () => {
    expect(cadenceUnitFor(null)).toBe('spm')
    expect(cadenceUnitFor('')).toBe('spm')
  })
})

describe('cadenceUnitLabel', () => {
  it('formats each unit', () => {
    expect(cadenceUnitLabel('rpm')).toBe('rpm')
    expect(cadenceUnitLabel('spm')).toBe('spm')
  })
})

describe('cadenceFieldLabel', () => {
  it('mentions rpm for cycling', () => {
    expect(cadenceFieldLabel('ปั่นจักรยาน')).toContain('rpm')
  })

  it('mentions spm for running', () => {
    expect(cadenceFieldLabel('วิ่ง')).toContain('spm')
  })
})
