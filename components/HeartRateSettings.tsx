'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveMaxHeartRate } from '@/lib/profile'
import { DEFAULT_MAX_HEART_RATE } from '@/lib/heartRate'

export default function HeartRateSettings({
  open,
  maxHeartRate,
  onClose,
  onSaved,
}: {
  open: boolean
  maxHeartRate: number
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [draft, setDraft] = useState(String(maxHeartRate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setDraft(String(maxHeartRate))
  }, [open, maxHeartRate])

  if (!open) return null

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const value = draft.trim() === '' ? null : Math.round(Number(draft))
      await saveMaxHeartRate(supabase, value && value > 0 ? value : null)
      onSaved()
    } catch {
      setError('บันทึกไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-bg/70" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-sm bg-surface border-t border-line rounded-t-xl px-5 pt-4 pb-6 safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hr-settings-title"
      >
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-4" aria-hidden="true" />
        <div className="flex items-center justify-between mb-3">
          <p id="hr-settings-title" className="font-display text-lg tracked uppercase text-ink">
            ชีพจรสูงสุด
          </p>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-sm px-1">
            ปิด
          </button>
        </div>

        <p className="text-[11px] text-muted mb-3">
          ใช้คำนวณ Heart Rate Zone ใน Weekly Cardio Volume ถ้าไม่ทราบค่าจริง (เช่น จากการทดสอบ) ประมาณคร่าวๆ ได้จาก 220 −
          อายุ
        </p>

        <input
          type="number"
          inputMode="numeric"
          min={100}
          max={230}
          placeholder={String(DEFAULT_MAX_HEART_RATE)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full text-center text-lg font-mono bg-surface2 border border-line rounded px-2 py-2 text-ink"
          aria-label="ชีพจรสูงสุด (bpm)"
        />

        {error && <p className="text-[11px] text-rust mt-3">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-4 rounded-lg bg-amber text-bg font-display tracked uppercase text-sm py-2.5 disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}
