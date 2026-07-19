'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { formatWeight, kgToUnit, unitToKg, type WeightUnit } from '@/lib/weightUnit'

const STORAGE_KEY = 'fitlog:weightUnit'
const DEFAULT_UNIT: WeightUnit = 'kg'

interface WeightUnitContextValue {
  unit: WeightUnit
  setUnit: (unit: WeightUnit) => void
  // kg (จาก DB) -> ตัวเลขในหน่วยที่เลือกแสดงอยู่ตอนนี้
  toDisplay: (kg: number) => number
  // ตัวเลขที่ผู้ใช้พิมพ์ในหน่วยที่เลือกอยู่ -> kg (สำหรับเก็บ DB)
  toKg: (value: number) => number
  // ตัวเลข kg -> ข้อความพร้อมหน่วยต่อท้าย เช่น "62.5 kg" หรือ "137.8 lb"
  format: (kg: number | null | undefined, decimals?: number) => string
}

const WeightUnitContext = createContext<WeightUnitContextValue | null>(null)

export function WeightUnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>(DEFAULT_UNIT)

  // อ่านค่าที่เคยตั้งไว้จาก localStorage ตอน mount (ฝั่ง client เท่านั้น — SSR ยังคง render
  // เป็น default 'kg' ไปก่อน แล้วค่อยสลับหลัง hydrate ถ้าผู้ใช้เคยเลือก lb ไว้)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw === 'kg' || raw === 'lb') setUnitState(raw)
    } catch {
      // localStorage อาจไม่พร้อมใช้งาน (private mode ฯลฯ) — ปล่อยผ่านเงียบๆ ใช้ default ต่อไป
    }
  }, [])

  const setUnit = useCallback((next: WeightUnit) => {
    setUnitState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ไม่ต้องทำอะไร — แค่จะไม่จำข้ามเซสชัน
    }
  }, [])

  const value = useMemo<WeightUnitContextValue>(
    () => ({
      unit,
      setUnit,
      toDisplay: (kg: number) => kgToUnit(kg, unit),
      toKg: (value: number) => unitToKg(value, unit),
      format: (kg: number | null | undefined, decimals?: number) => formatWeight(kg, unit, decimals),
    }),
    [unit, setUnit]
  )

  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>
}

export function useWeightUnit(): WeightUnitContextValue {
  const ctx = useContext(WeightUnitContext)
  if (!ctx) throw new Error('useWeightUnit ต้องถูกเรียกใต้ WeightUnitProvider')
  return ctx
}
