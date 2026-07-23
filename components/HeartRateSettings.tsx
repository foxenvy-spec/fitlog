'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveMaxHeartRate, saveRestingHeartRate } from '@/lib/profile'
import { DEFAULT_MAX_HEART_RATE } from '@/lib/heartRate'
import { computeVO2Max, classifyVO2Max } from '@/lib/vo2max'

export default function HeartRateSettings({
  open,
  maxHeartRate,
  restingHeartRate,
  onClose,
  onSaved,
}: {
  open: boolean
  maxHeartRate: number
  restingHeartRate: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [draft, setDraft] = useState(String(maxHeartRate))
  const [restingDraft, setRestingDraft] = useState(restingHeartRate !== null ? String(restingHeartRate) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(String(maxHeartRate))
      setRestingDraft(restingHeartRate !== null ? String(restingHeartRate) : '')
    }
  }, [open, maxHeartRate, restingHeartRate])

  if (!open) return null

  // พรีวิว VO2Max สดจากค่าที่กำลังกรอกอยู่ในฟอร์ม (ยังไม่ได้บันทึก) — ให้เห็นผลทันทีก่อนกดบันทึก
  const previewMaxHR = draft.trim() === '' ? maxHeartRate : Number(draft)
  const previewRestingHR = restingDraft.trim() === '' ? null : Number(restingDraft)
  const vo2max = computeVO2Max(previewMaxHR, previewRestingHR)
  const vo2maxCategory = vo2max !== null ? classifyVO2Max(vo2max) : null

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const value = draft.trim() === '' ? null : Math.round(Number(draft))
      const restingValue = restingDraft.trim() === '' ? null : Math.round(Number(restingDraft))
      await Promise.all([
        saveMaxHeartRate(supabase, value && value > 0 ? value : null),
        saveRestingHeartRate(supabase, restingValue && restingValue > 0 ? restingValue : null),
      ])
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
            ชีพจร & VO2Max
          </p>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-sm px-1">
            ปิด
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-muted mb-1.5">
              ชีพจรสูงสุด — ถ้าไม่ทราบ ประมาณคร่าวๆ ได้จาก 220 − อายุ
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
          </div>
          <div>
            <p className="text-[11px] text-muted mb-1.5">ชีพจรขณะพัก — วัดตอนตื่นนอนตอนเช้าจะแม่นสุด</p>
            <input
              type="number"
              inputMode="numeric"
              min={30}
              max={120}
              placeholder="เช่น 60"
              value={restingDraft}
              onChange={(e) => setRestingDraft(e.target.value)}
              className="w-full text-center text-lg font-mono bg-surface2 border border-line rounded px-2 py-2 text-ink"
              aria-label="ชีพจรขณะพัก (bpm)"
            />
          </div>
        </div>

        <div className="mt-4 rounded-md bg-surface2 px-3 py-2.5 text-center">
          <p className="text-[10px] tracked uppercase text-muted">VO2Max โดยประมาณ</p>
          {vo2max !== null ? (
            <p className="font-mono text-lg text-ink mt-0.5">
              {vo2max}
              <span className="text-xs text-muted ml-1">ml/kg/min</span>
              {vo2maxCategory && <span className="text-xs text-muted ml-1.5">· {vo2maxCategory.label}</span>}
            </p>
          ) : (
            <p className="text-[11px] text-muted mt-0.5">กรอกชีพจรขณะพักเพื่อดูค่าประมาณ</p>
          )}
          <p className="text-[10px] text-muted/70 mt-1">
            * ประมาณจากสูตร Uth (15.3 × ชีพจรสูงสุด/ชีพจรขณะพัก) ไม่ใช่ค่าจากการทดสอบจริง
          </p>
        </div>

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
