import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_WEEKLY_VOLUME_TARGETS } from './dashboardStats'
import { VOLUME_MUSCLES } from './muscle-groups'

// ตาราง weekly_volume_targets เก็บเป็นคอลัมน์ภาษาอังกฤษ (ดู migration 005) ส่วนที่เหลือ
// ของแอปยังอ้างกลุ่มกล้ามเนื้อเป็นภาษาไทยเหมือนเดิมทุกที่ (VOLUME_MUSCLES, WEEKLY_VOLUME_TARGETS
// ฯลฯ) — mapping นี้จึงเป็นจุดเดียวที่แปลงไปมาระหว่างสองฝั่ง
export const VOLUME_TARGET_COLUMN: Record<(typeof VOLUME_MUSCLES)[number], string> = {
  'อก': 'chest',
  'หลัง': 'back',
  'ขา': 'legs',
  'ไหล่': 'shoulders',
  'แขน': 'arms',
  'แกนกลางลำตัว': 'core',
}

export type WeeklyVolumeTargetsRow = {
  user_id: string
  chest: number | null
  back: number | null
  legs: number | null
  shoulders: number | null
  arms: number | null
  core: number | null
  updated_at: string
}

export type WeeklyVolumeTargets = Record<(typeof VOLUME_MUSCLES)[number], number>

// รวมค่าจากแถวในตาราง (ถ้ามี) เข้ากับค่า default — คอลัมน์ไหนเป็น null/ไม่มีแถวเลย ใช้ default แทน
// เพื่อให้ผู้ใช้ตั้งเป้าหมายเฉพาะบางกลุ่มกล้ามเนื้อได้โดยไม่ต้องกรอกครบทุกช่อง
export function mergeWeeklyVolumeTargets(
  row: Pick<WeeklyVolumeTargetsRow, 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core'> | null
): WeeklyVolumeTargets {
  const merged = { ...DEFAULT_WEEKLY_VOLUME_TARGETS } as WeeklyVolumeTargets
  if (!row) return merged
  VOLUME_MUSCLES.forEach((mg) => {
    const column = VOLUME_TARGET_COLUMN[mg] as keyof typeof row
    const value = row[column]
    if (typeof value === 'number' && value > 0) merged[mg] = value
  })
  return merged
}

// ดึงเป้าหมายของผู้ใช้ปัจจุบัน (ตาม RLS ของ session ใน supabase client) รวมกับ default แล้ว
export async function fetchWeeklyVolumeTargets(supabase: SupabaseClient): Promise<WeeklyVolumeTargets> {
  const { data } = await supabase.from('weekly_volume_targets').select('*').maybeSingle()
  return mergeWeeklyVolumeTargets(data as WeeklyVolumeTargetsRow | null)
}

// บันทึกเป้าหมายของผู้ใช้ (upsert แถวเดียวต่อ user) — ค่าที่เท่ากับ default เดิมยังคงถูกบันทึก
// ตรงๆ เป็นตัวเลข ไม่ได้เก็บเป็น null เพื่อความชัดเจนว่าผู้ใช้ยืนยันค่านี้แล้ว
export async function saveWeeklyVolumeTargets(supabase: SupabaseClient, userId: string, targets: WeeklyVolumeTargets) {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
  VOLUME_MUSCLES.forEach((mg) => {
    row[VOLUME_TARGET_COLUMN[mg]] = targets[mg]
  })
  const { error } = await supabase.from('weekly_volume_targets').upsert(row, { onConflict: 'user_id' })
  if (error) throw error
}
