'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { searchExercises, type ExerciseDef } from '@/lib/exercises'
import { equipmentLabel } from '@/lib/exerciseLibrary'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, muscleGroupLabel, type MuscleGroup, type MuscleLabelLang } from '@/lib/muscle-groups'
import { loadMuscleLabelLang, saveMuscleLabelLang } from '@/lib/muscleLabelPrefs'
import MuscleLangToggle from '@/components/MuscleLangToggle'

interface ExercisePickerProps {
  value: string
  onChange: (name: string) => void
  onSelect: (ex: ExerciseDef) => void
  placeholder?: string
}

export default function ExercisePicker({ value, onChange, onSelect, placeholder }: ExercisePickerProps) {
  const [open, setOpen] = useState(false)
  const [browseMuscle, setBrowseMuscle] = useState<MuscleGroup | null>(null)
  const [lang, setLang] = useState<MuscleLabelLang>('th')
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: exercises = [], isLoading } = useExerciseLibrary()

  useEffect(() => {
    setLang(loadMuscleLabelLang())
  }, [])

  function updateLang(next: MuscleLabelLang) {
    setLang(next)
    saveMuscleLabelLang(next)
  }

  const searchResults = useMemo(() => searchExercises(exercises, value, 8), [exercises, value])

  const browseResults = useMemo(() => {
    const list = browseMuscle ? exercises.filter((ex) => ex.muscleGroup === browseMuscle) : exercises
    return list.slice(0, 24)
  }, [exercises, browseMuscle])

  const showSearch = value.trim().length > 0
  const results = showSearch ? searchResults : browseResults

  function handlePick(ex: ExerciseDef) {
    onChange(ex.name)
    onSelect(ex)
    setOpen(false)
  }

  function handleFocus() {
    if (blurTimeout.current) clearTimeout(blurTimeout.current)
    setOpen(true)
  }

  function handleBlur() {
    // delay so a click on a dropdown option registers before closing
    blurTimeout.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className="relative">
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'พิมพ์ชื่อท่า เช่น bench หรือ สควอท'}
        className="input"
        autoComplete="off"
      />

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-lg bg-surface2 border border-line shadow-lg overflow-hidden">
          {!showSearch && (
            <div className="px-2 pt-2 pb-1.5 space-y-1.5">
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                <MuscleTab active={browseMuscle === null} onClick={() => setBrowseMuscle(null)} label="ทั้งหมด" />
                {MUSCLE_GROUPS.map((mg) => (
                  <MuscleTab
                    key={mg}
                    active={browseMuscle === mg}
                    onClick={() => setBrowseMuscle(mg)}
                    label={muscleGroupLabel(mg, lang)}
                    color={MUSCLE_GROUP_COLORS[mg]}
                  />
                ))}
              </div>
              <div className="flex justify-end">
                <MuscleLangToggle lang={lang} onChange={updateLang} />
              </div>
            </div>
          )}

          <ul className="max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <li className="px-3 py-4 text-xs text-muted text-center">
                {isLoading ? 'กำลังโหลดฐานข้อมูลท่า...' : 'ไม่พบท่านี้ในฐานข้อมูล — พิมพ์ชื่อเองแล้วบันทึกได้เลย'}
              </li>
            ) : (
              results.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePick(ex)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface transition"
                  >
                    {ex.imageUrl ? (
                      <img
                        src={ex.imageUrl}
                        alt={ex.name}
                        loading="lazy"
                        className="shrink-0 w-9 h-9 rounded-md object-cover bg-panel"
                      />
                    ) : (
                      <span
                        className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-sm"
                        style={{ backgroundColor: MUSCLE_GROUP_COLORS[ex.muscleGroup] + '33' }}
                      >
                        {ex.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink truncate">{ex.name}</span>
                      <span className="block text-[11px] text-muted truncate">{equipmentLabel(ex.equipment)}</span>
                    </span>
                    <span
                      className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border"
                      style={{
                        color: MUSCLE_GROUP_COLORS[ex.muscleGroup],
                        borderColor: MUSCLE_GROUP_COLORS[ex.muscleGroup] + '66',
                      }}
                    >
                      {muscleGroupLabel(ex.muscleGroup, lang)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-line px-3 py-2">
            <a
              href="/exercises"
              className="text-[11px] font-display tracked uppercase text-muted hover:text-amber transition"
            >
              ดูฐานข้อมูลท่าออกกำลังกายทั้งหมด →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function MuscleTab({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
        active ? 'bg-steel text-bg border-steel' : 'bg-surface border-line text-muted'
      }`}
      style={!active && color ? { borderColor: color + '55', color } : undefined}
    >
      {label}
    </button>
  )
}
