'use client'

import { useEffect, useRef, useState } from 'react'
import type { DashboardPrefs } from '@/lib/dashboardPrefs'

interface ToggleDef {
  key: keyof DashboardPrefs
  label: string
}

const TOGGLES: ToggleDef[] = [
  { key: 'showCalories', label: 'Calories' },
  { key: 'showRecovery', label: 'Recovery' },
  { key: 'showBodyWeight', label: 'Weight' },
  { key: 'showPR', label: 'Next PR' },
  { key: 'showAICoach', label: 'AI Coach' },
]

export default function DashboardSettings({
  open,
  prefs,
  onChange,
  onClose,
  displayName,
  displayNamePlaceholder,
  onSaveDisplayName,
}: {
  open: boolean
  prefs: DashboardPrefs
  onChange: (prefs: DashboardPrefs) => void
  onClose: () => void
  displayName: string
  displayNamePlaceholder: string
  onSaveDisplayName: (name: string) => Promise<void>
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // ช่องกรอกชื่อมี state ของตัวเองแยกจาก prop เพื่อให้พิมพ์ได้ลื่นๆ ก่อนกดบันทึก
  // sync กลับตาม prop ทุกครั้งที่ sheet เปิดใหม่ (เผื่อค่าที่บันทึกไว้เปลี่ยนจากที่อื่น)
  const [nameInput, setNameInput] = useState(displayName)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (open) {
      setNameInput(displayName)
      setSaveState('idle')
    }
  }, [open, displayName])

  async function handleSaveName() {
    setSaveState('saving')
    try {
      await onSaveDisplayName(nameInput)
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const nameChanged = nameInput.trim() !== displayName.trim()

  // Move focus into the sheet when it opens, and back to whatever opened it
  // when it closes — keyboard users shouldn't lose their place.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      closeBtnRef.current?.focus()
    } else {
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [open])

  // Escape closes the sheet, same as tapping the backdrop.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-bg/70" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-sm bg-surface border-t border-line rounded-t-xl px-5 pt-4 pb-6 safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-settings-title"
      >
        <div className="w-10 h-1 rounded-full bg-line mx-auto mb-4" aria-hidden="true" />
        <div className="flex items-center justify-between mb-3">
          <p id="dashboard-settings-title" className="font-display text-lg tracked uppercase text-ink">
            ปรับแต่ง Dashboard
          </p>
          <button ref={closeBtnRef} type="button" onClick={onClose} className="text-muted hover:text-ink text-sm px-1">
            ปิด
          </button>
        </div>

        <div className="mb-4">
          <label htmlFor="dashboard-display-name" className="block text-sm text-ink mb-1.5">
            ชื่อที่แสดง
          </label>
          <div className="flex items-center gap-2">
            <input
              id="dashboard-display-name"
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value)
                setSaveState('idle')
              }}
              placeholder={displayNamePlaceholder}
              maxLength={40}
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={!nameChanged || saveState === 'saving'}
              className="shrink-0 rounded-lg bg-amber text-bg text-xs font-display tracked uppercase px-3.5 py-3 disabled:opacity-40 transition"
            >
              {saveState === 'saving' ? '...' : 'บันทึก'}
            </button>
          </div>
          <p className="text-[11px] text-muted mt-1.5">
            {saveState === 'saved' && '✓ บันทึกแล้ว'}
            {saveState === 'error' && 'บันทึกไม่สำเร็จ ลองอีกครั้ง'}
            {saveState !== 'saved' &&
              saveState !== 'error' &&
              `เว้นว่างไว้จะใช้ชื่อจากอีเมล (${displayNamePlaceholder}) แทน`}
          </p>
        </div>

        <div className="border-t border-line" />

        <div className="space-y-1 mt-3">
          {TOGGLES.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center justify-between py-2.5 border-b border-line last:border-0 cursor-pointer"
            >
              <span className="text-sm text-ink">{label}</span>
              <Switch checked={prefs[key]} onChange={(v) => onChange({ ...prefs, [key]: v })} label={label} />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition shrink-0 ${checked ? 'bg-amber' : 'bg-surface2'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-ink transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
