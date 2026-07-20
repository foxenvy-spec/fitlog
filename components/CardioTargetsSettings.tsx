'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveWeeklyCardioTargets, type WeeklyCardioTargets } from '@/lib/weeklyCardioTargets'

export default function CardioTargetsSettings({
  open,
  targets,
  onClose,
  onSaved,
}: {
  open: boolean
  targets: WeeklyCardioTargets
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [draft, setDraft] = useState<WeeklyCardioTargets>(targets)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the draft to the latest saved targets each time the sheet opens.
  useEffect(() => {
    if (open) setDraft(targets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบผู้ใช้ที่เข้าสู่ระบบ')
      await saveWeeklyCardioTargets(supabase, user.id, draft)
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
        aria-labelledby="cardio-targets-title"
      >
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-4" aria-hidden="true" />
        <div className="flex items-center justify-between mb-3">
          <p id="cardio-targets-title" className="font-display text-lg tracked uppercase text-ink">
            เป้าหมายคาร์ดิโอ/สัปดาห์
          </p>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-sm px-1">
            ปิด
          </button>
        </div>

        <div className="space-y-1">
          <label className="flex items-center justify-between py-2 border-b border-line">
            <span className="text-sm text-ink">นาที/สัปดาห์</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              className="w-20 text-right text-sm bg-surface2 border border-line rounded px-2 py-1 text-ink"
              aria-label="เป้าหมายนาทีคาร์ดิโอต่อสัปดาห์"
            />
          </label>
          <label className="flex items-center justify-between py-2 border-b border-line last:border-0">
            <span className="text-sm text-ink">ครั้ง/สัปดาห์</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={draft.sessions}
              onChange={(e) => setDraft({ ...draft, sessions: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              className="w-20 text-right text-sm bg-surface2 border border-line rounded px-2 py-1 text-ink"
              aria-label="เป้าหมายจำนวนครั้งคาร์ดิโอต่อสัปดาห์"
            />
          </label>
        </div>

        {error && <p className="text-[11px] text-rust mt-3">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-4 rounded-lg bg-amber text-bg font-display tracked uppercase text-sm py-2.5 disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'}
        </button>
      </div>
    </div>
  )
}
