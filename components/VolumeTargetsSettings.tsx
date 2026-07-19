'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveWeeklyVolumeTargets, type WeeklyVolumeTargets } from '@/lib/weeklyVolumeTargets'
import { VOLUME_MUSCLES } from '@/lib/muscle-groups'

// Preset ระดับความหนักที่พบบ่อย — ยังปรับตัวเลขต่อกลุ่มกล้ามเนื้อเองได้เสมอหลังเลือก preset
// (ตัวเลขอ้างอิงหลักการฝึกเพื่อไฮเปอร์โทรฟีทั่วไป ไม่ใช่คำแนะนำทางการแพทย์)
const PRESETS: { label: string; targets: WeeklyVolumeTargets }[] = [
  {
    label: 'Beginner',
    targets: { อก: 6, หลัง: 6, ขา: 6, ไหล่: 4, แขน: 4, แกนกลางลำตัว: 4 },
  },
  {
    label: 'Intermediate',
    targets: { อก: 10, หลัง: 10, ขา: 12, ไหล่: 8, แขน: 8, แกนกลางลำตัว: 6 },
  },
  {
    label: 'Advanced',
    targets: { อก: 16, หลัง: 16, ขา: 18, ไหล่: 12, แขน: 12, แกนกลางลำตัว: 10 },
  },
]

export default function VolumeTargetsSettings({
  open,
  targets,
  onClose,
  onSaved,
}: {
  open: boolean
  targets: WeeklyVolumeTargets
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [draft, setDraft] = useState<WeeklyVolumeTargets>(targets)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // Reset the draft to the latest saved targets each time the sheet opens.
  useEffect(() => {
    if (open) setDraft(targets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      closeBtnRef.current?.focus()
    } else if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus()
    }
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
      await saveWeeklyVolumeTargets(supabase, user.id, draft)
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
        className="relative w-full max-w-sm bg-surface border-t border-line rounded-t-xl px-5 pt-4 pb-6 safe-bottom max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="volume-targets-title"
      >
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-4" aria-hidden="true" />
        <div className="flex items-center justify-between mb-3">
          <p id="volume-targets-title" className="font-display text-lg tracked uppercase text-ink">
            เป้าหมายเซ็ต/สัปดาห์
          </p>
          <button ref={closeBtnRef} type="button" onClick={onClose} className="text-muted hover:text-ink text-sm px-1">
            ปิด
          </button>
        </div>

        <div className="flex gap-1.5 mb-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setDraft({ ...draft, ...preset.targets })}
              className="text-[11px] px-2.5 py-1 rounded-full border border-line text-muted hover:text-ink hover:border-ink/40"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          {VOLUME_MUSCLES.map((mg) => (
            <label key={mg} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <span className="text-sm text-ink">{mg}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={draft[mg]}
                onChange={(e) => {
                  const value = Math.max(0, Math.round(Number(e.target.value) || 0))
                  setDraft({ ...draft, [mg]: value })
                }}
                className="w-16 text-right text-sm bg-surface2 border border-line rounded px-2 py-1 text-ink"
                aria-label={`เป้าหมาย ${mg} เซ็ตต่อสัปดาห์`}
              />
            </label>
          ))}
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
