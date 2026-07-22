'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WorkoutTemplate, WorkoutTemplateExercise } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import { todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exercises'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

export default function TemplatesPage() {
  const supabase = createClient()

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [exercisesByTemplate, setExercisesByTemplate] = useState<Record<string, WorkoutTemplateExercise[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [startMessage, setStartMessage] = useState<string | null>(null)
  const [addingToId, setAddingToId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data: tRows, error: tErr } = await supabase
      .from('workout_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (tErr) {
      setLoadError(tErr.message)
      setLoading(false)
      return
    }

    const typedTemplates = (tRows as WorkoutTemplate[]) ?? []
    setTemplates(typedTemplates)

    if (typedTemplates.length > 0) {
      const { data: exRows, error: exErr } = await supabase
        .from('workout_template_exercises')
        .select('*')
        .in(
          'template_id',
          typedTemplates.map((t) => t.id)
        )
        .order('position')

      if (exErr) {
        setLoadError(exErr.message)
        setLoading(false)
        return
      }

      const grouped: Record<string, WorkoutTemplateExercise[]> = {}
      ;(exRows as WorkoutTemplateExercise[]).forEach((ex) => {
        grouped[ex.template_id] = grouped[ex.template_id] ?? []
        grouped[ex.template_id].push(ex)
      })
      setExercisesByTemplate(grouped)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreateTemplate(title: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data, error: err } = await supabase.from('workout_templates').insert({ user_id: user.id, title }).select('*').single()
    if (err) {
      setError(err.message)
      return
    }
    const created = data as WorkoutTemplate
    setTemplates((prev) => [created, ...prev])
    setCreating(false)
    setExpandedId(created.id)
  }

  async function handleDeleteTemplate(id: string) {
    setError(null)
    const { error: err } = await supabase.from('workout_templates').delete().eq('id', id)
    if (err) {
      setError(`ลบเทมเพลตไม่สำเร็จ: ${err.message}`)
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleAddExercise(
    templateId: string,
    fields: {
      name: string
      sets: string
      reps: string
      rir: string
      rest: string
      muscleGroup: MuscleGroup
      secondaryMuscles: string[]
      exerciseLibraryId: string | null
    }
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const position = (exercisesByTemplate[templateId] ?? []).length

    const { data, error: err } = await supabase
      .from('workout_template_exercises')
      .insert({
        template_id: templateId,
        user_id: user.id,
        position,
        exercise_name: fields.name,
        muscle_group: fields.muscleGroup,
        secondary_muscles: fields.secondaryMuscles,
        exercise_library_id: fields.exerciseLibraryId,
        sets: fields.sets ? Number(fields.sets) : null,
        target_reps: fields.reps || null,
        target_rir: fields.rir || null,
        rest: fields.rest || null,
      })
      .select('*')
      .single()

    if (err) {
      setError(err.message)
      return
    }

    setExercisesByTemplate((prev) => ({
      ...prev,
      [templateId]: [...(prev[templateId] ?? []), data as WorkoutTemplateExercise],
    }))
    setAddingToId(null)
  }

  async function handleDeleteExercise(ex: WorkoutTemplateExercise) {
    setError(null)
    const { error: err } = await supabase.from('workout_template_exercises').delete().eq('id', ex.id)
    if (err) {
      setError(`ลบท่าไม่สำเร็จ: ${err.message}`)
      return
    }
    setExercisesByTemplate((prev) => ({
      ...prev,
      [ex.template_id]: (prev[ex.template_id] ?? []).filter((e) => e.id !== ex.id),
    }))
  }

  async function handleStart(template: WorkoutTemplate) {
    const exercises = exercisesByTemplate[template.id] ?? []
    if (exercises.length === 0) return

    setStartingId(template.id)
    setStartMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const payload = exercises.map((ex) => ({
        user_id: user.id,
        type: 'strength' as const,
        performed_at: todayStr(),
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        secondary_muscles: ex.secondary_muscles,
        exercise_library_id: ex.exercise_library_id,
        sets: ex.sets,
        reps: parseRangeToNumber(ex.target_reps),
        weight_kg: ex.default_weight_kg,
        rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
        notes: ex.notes,
      }))

      const { error: wErr } = await supabase.from('workouts').insert(payload)
      if (wErr) {
        setError(`เริ่ม "${template.title}" ไม่สำเร็จ: ${wErr.message}`)
        return
      }

      setStartMessage(`บันทึก "${template.title}" (${payload.length} ท่า) เข้า Log วันนี้แล้ว`)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStartingId(null)
    }
  }

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดเทมเพลตไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">เทมเพลต</h1>
          <p className="text-sm text-muted mt-1">กดเริ่มได้ทุกเมื่อ ไม่ผูกกับวันในสัปดาห์</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <a href="/exercises" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            🔍 ฐานข้อมูลท่า
          </a>
          <a href="/history" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            ดูประวัติ →
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {startMessage && <p className="text-sm text-steel">{startMessage}</p>}

      {templates.length === 0 && !creating && (
        <div className="rounded-lg bg-surface border border-line shadow-elevated border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted mb-3">ยังไม่มีเทมเพลต</p>
          <button
            onClick={() => setCreating(true)}
            className="text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2"
          >
            + สร้างเทมเพลตแรก
          </button>
        </div>
      )}

      {templates.map((t) => {
          const exercises = exercisesByTemplate[t.id] ?? []
          const expanded = expandedId === t.id
          return (
            <div key={t.id} className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
                <button onClick={() => setExpandedId(expanded ? null : t.id)} className="min-w-0 text-left flex-1">
                  <p className="text-sm text-ink font-display tracked uppercase truncate">{t.title}</p>
                  <p className="text-[11px] text-muted">{exercises.length} ท่า</p>
                </button>
                <button
                  onClick={() => handleStart(t)}
                  disabled={startingId === t.id || exercises.length === 0}
                  className="shrink-0 text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] disabled:opacity-40"
                >
                  {startingId === t.id ? '...' : `Start ${t.title}`}
                </button>
              </div>

              {expanded && (
                <>
                  <ul>
                    {exercises.map((ex) => (
                      <li key={ex.id} className="tally-row px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{ex.exercise_name}</p>
                          <p className="text-[11px] text-muted">
                            {ex.sets ?? '–'} เซ็ต × {ex.target_reps ?? '–'} reps
                            {ex.target_rir && ` · RIR ${ex.target_rir}`}
                          </p>
                        </div>
                        <button onClick={() => handleDeleteExercise(ex)} className="text-[11px] text-muted hover:text-rust shrink-0">
                          ลบ
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="px-4 py-3 border-t border-line flex items-center justify-between">
                    <button
                      onClick={() => setAddingToId(t.id)}
                      className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
                    >
                      + เพิ่มท่า
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="text-xs text-muted hover:text-rust transition">
                      ลบเทมเพลตนี้
                    </button>
                  </div>
                  {addingToId === t.id && (
                    <div className="px-4 pb-4">
                      <AddExerciseForm onCancel={() => setAddingToId(null)} onSubmit={(fields) => handleAddExercise(t.id, fields)} />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

      {templates.length > 0 && !creating && (
        <button
          onClick={() => setCreating(true)}
          className="w-full rounded-lg border border-line border-dashed text-muted font-display tracked uppercase py-3 text-sm hover:text-amber transition"
        >
          + เทมเพลตใหม่
        </button>
      )}

      {creating && <NewTemplateForm onCancel={() => setCreating(false)} onSubmit={handleCreateTemplate} />}
    </div>
  )
}

function NewTemplateForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-4 space-y-3">
      <p className="text-sm text-ink font-display tracked uppercase">เทมเพลตใหม่</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="เช่น Push Day"
        className="w-full bg-surface2 text-ink text-sm rounded px-3 py-2 border border-line outline-none focus:border-amber"
      />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs">
          ยกเลิก
        </button>
        <button
          onClick={() => title.trim() && onSubmit(title.trim())}
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99]"
        >
          สร้าง แล้วเพิ่มท่า
        </button>
      </div>
    </div>
  )
}

function AddExerciseForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (fields: {
    name: string
    sets: string
    reps: string
    rir: string
    rest: string
    muscleGroup: MuscleGroup
    secondaryMuscles: string[]
    exerciseLibraryId: string | null
  }) => void
}) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [rest, setRest] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('อื่นๆ')
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [exerciseLibraryId, setExerciseLibraryId] = useState<string | null>(null)

  return (
    <div className="rounded-lg bg-surface2 border border-line px-3 py-3 space-y-2">
      <ExercisePicker
        value={name}
        onChange={(v) => {
          setName(v)
          setExerciseLibraryId(null) // พิมพ์เอง ไม่ได้เลือกจาก dropdown — เคลียร์ FK เดิมทิ้ง
        }}
        onSelect={(ex: ExerciseDef) => {
          setMuscleGroup(ex.muscleGroup)
          setSecondaryMuscles(ex.secondaryMuscles)
          setExerciseLibraryId(ex.id)
        }}
        placeholder="ชื่อท่า"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <MiniField label="เซ็ต" value={sets} onChange={setSets} />
        <MiniField label="Target Reps" value={reps} onChange={setReps} />
        <MiniField label="Target RIR" value={rir} onChange={setRir} />
        <MiniField label="พัก" value={rest} onChange={setRest} />
      </div>
      <select
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
        className="w-full bg-surface text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber"
      >
        {MUSCLE_GROUPS.map((mg) => (
          <option key={mg} value={mg}>
            {mg}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2 text-[11px]">
          ยกเลิก
        </button>
        <button
          onClick={() => name.trim() && onSubmit({ name: name.trim(), sets, reps, rir, rest, muscleGroup, secondaryMuscles, exerciseLibraryId })}
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2 text-[11px] active:scale-[0.99]"
        >
          เพิ่มท่านี้
        </button>
      </div>
    </div>
  )
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}
