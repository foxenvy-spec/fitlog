'use client'

import { useEffect, useMemo, useState } from 'react'
import { searchExercises, type ExerciseDef } from '@/lib/exercises'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS, muscleGroupLabel, type MuscleGroup, type MuscleLabelLang } from '@/lib/muscle-groups'
import { loadMuscleLabelLang, saveMuscleLabelLang } from '@/lib/muscleLabelPrefs'
import MuscleLangToggle from '@/components/MuscleLangToggle'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/components/ErrorState'

export default function ExercisesPage() {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lang, setLang] = useState<MuscleLabelLang>('th')
  const { data: exercises = [], isLoading, isError, refetch } = useExerciseLibrary()

  useEffect(() => {
    setLang(loadMuscleLabelLang())
  }, [])

  function updateLang(next: MuscleLabelLang) {
    setLang(next)
    saveMuscleLabelLang(next)
  }

  const list = useMemo(() => {
    if (query.trim()) return searchExercises(exercises, query, 50)
    return muscle ? exercises.filter((ex) => ex.muscleGroup === muscle) : exercises
  }, [exercises, query, muscle])

  if (isLoading) return <LoadingState />
  if (isError) {
    return (
      <ErrorState
        title="โหลดฐานข้อมูลท่าออกกำลังกายไม่สำเร็จ"
        message="ตรวจสอบการเชื่อมต่อแล้วลองใหม่"
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">ฐานข้อมูลท่าออกกำลังกาย</h1>
          <p className="text-sm text-muted mt-1">{exercises.length} ท่า — ค้นหาหรือเลือกจากรายการ</p>
        </div>
        <MuscleLangToggle lang={lang} onChange={updateLang} />
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาท่า เช่น bench, squat, สควอท"
        className="input"
        autoComplete="off"
      />

      {!query.trim() && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <FilterChip active={muscle === null} onClick={() => setMuscle(null)} label="ทั้งหมด" />
          {MUSCLE_GROUPS.map((mg) => (
            <FilterChip
              key={mg}
              active={muscle === mg}
              onClick={() => setMuscle(mg)}
              label={muscleGroupLabel(mg, lang)}
              color={MUSCLE_GROUP_COLORS[mg]}
            />
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted bg-surface border border-line rounded-lg px-4 py-6 text-center">
          ไม่พบท่านี้ในฐานข้อมูล
        </p>
      ) : (
        <ul className="rounded-lg bg-surface border border-line overflow-hidden">
          {list.map((ex) => {
            const expanded = expandedId === ex.id
            return (
              <li key={ex.id} className="tally-row">
                <button
                  onClick={() => setExpandedId(expanded ? null : ex.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base"
                    style={{ backgroundColor: MUSCLE_GROUP_COLORS[ex.muscleGroup] + '33' }}
                  >
                    {ex.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink truncate">{ex.name}</span>
                    <span className="block text-[11px] text-muted truncate">
                      {ex.nameTh} · {ex.equipment}
                    </span>
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
                  <span className="text-muted text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && <ExerciseDetail ex={ex} lang={lang} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ExerciseDetail({ ex, lang }: { ex: ExerciseDef; lang: MuscleLabelLang }) {
  return (
    <div className="px-4 pb-4 -mt-1 space-y-3">
      <div>
        <p className="text-[10px] tracked uppercase text-muted mb-1">กล้ามเนื้อหลัก</p>
        <span
          className="inline-block text-xs px-2.5 py-1 rounded-full border"
          style={{
            color: MUSCLE_GROUP_COLORS[ex.muscleGroup],
            borderColor: MUSCLE_GROUP_COLORS[ex.muscleGroup] + '66',
            backgroundColor: MUSCLE_GROUP_COLORS[ex.muscleGroup] + '1A',
          }}
        >
          {muscleGroupLabel(ex.muscleGroup, lang)}
        </span>
      </div>

      {ex.secondaryMuscles.length > 0 && (
        <div>
          <p className="text-[10px] tracked uppercase text-muted mb-1">กล้ามเนื้อรอง</p>
          <div className="flex flex-wrap gap-1.5">
            {ex.secondaryMuscles.map((mg) => (
              <span
                key={mg}
                className="text-xs px-2.5 py-1 rounded-full border"
                style={{
                  color: MUSCLE_GROUP_COLORS[mg],
                  borderColor: MUSCLE_GROUP_COLORS[mg] + '55',
                }}
              >
                {muscleGroupLabel(mg, lang)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] tracked uppercase text-muted mb-1.5">วิธีเล่น</p>
        <ol className="space-y-1.5">
          {ex.instructions.map((step, i) => (
            <li key={i} className="text-sm text-ink flex gap-2">
              <span className="text-amber font-mono shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <a
        href={`/exercises/${encodeURIComponent(ex.name)}`}
        className="block text-center text-xs tracked uppercase text-amber hover:underline py-2"
      >
        📊 ดูสถิติของท่านี้ (PR · 1RM · Volume) →
      </a>
    </div>
  )
}

function FilterChip({
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
      onClick={onClick}
      className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${
        active ? 'bg-steel text-bg border-steel' : 'bg-surface2 border-line text-muted'
      }`}
      style={!active && color ? { borderColor: color + '55', color } : undefined}
    >
      {label}
    </button>
  )
}
