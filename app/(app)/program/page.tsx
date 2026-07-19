'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exercises'
import { WEEKDAYS, WEEKDAYS_SHORT, todayDayOfWeek, todayStr } from '@/lib/weekdays'
import { parseRangeToNumber, rirToRpe } from '@/lib/importWorkoutExcel'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

export default function ProgramPage() {
  const supabase = createClient()

  const [selectedDow, setSelectedDow] = useState<number>(todayDayOfWeek())
  const [days, setDays] = useState<ProgramDay[]>([])
  const [exercisesByDay, setExercisesByDay] = useState<Record<string, ProgramExercise[]>>({})
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  const [logMessage, setLogMessage] = useState<string | null>(null)
  const [addingExercise, setAddingExercise] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: dayRows, error: dayErr } = await supabase
      .from('program_days')
      .select('*')
      .order('day_of_week')

    if (dayErr) {
      setLoadError(dayErr.message)
      setLoading(false)
      return
    }

    const typedDays = (dayRows as ProgramDay[]) ?? []
    setDays(typedDays)

    if (typedDays.length > 0) {
      const { data: exRows, error: exErr } = await supabase
        .from('program_exercises')
        .select('*')
        .in(
          'program_day_id',
          typedDays.map((d) => d.id)
        )
        .order('position')

      if (exErr) {
        setLoadError(exErr.message)
        setLoading(false)
        return
      }

      const grouped: Record<string, ProgramExercise[]> = {}
      ;(exRows as ProgramExercise[]).forEach((ex) => {
        grouped[ex.program_day_id] = grouped[ex.program_day_id] ?? []
        grouped[ex.program_day_id].push(ex)
      })
      setExercisesByDay(grouped)
    } else {
      setExercisesByDay({})
    }

    const { data: completions } = await supabase
      .from('program_completions')
      .select('program_exercise_id')
      .eq('completed_at', todayStr())

    setCompletedIds(new Set((completions ?? []).map((c: { program_exercise_id: string }) => c.program_exercise_id)))

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const currentDay = days.find((d) => d.day_of_week === selectedDow) ?? null
  const currentExercises = currentDay ? exercisesByDay[currentDay.id] ?? [] : []

  async function toggleComplete(exerciseId: string, done: boolean) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    if (done) {
      setCompletedIds((prev) => new Set(prev).add(exerciseId))
      const { error: err } = await supabase
        .from('program_completions')
        .upsert(
          { user_id: user.id, program_exercise_id: exerciseId, completed_at: todayStr() },
          { onConflict: 'user_id,program_exercise_id,completed_at' }
        )
      if (err) setError(err.message)
    } else {
      setCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(exerciseId)
        return next
      })
      const { error: err } = await supabase
        .from('program_completions')
        .delete()
        .eq('program_exercise_id', exerciseId)
        .eq('completed_at', todayStr())
      if (err) setError(err.message)
    }
  }

  async function handleLogAllToday() {
    if (!currentDay || currentExercises.length === 0) return
    setLogging(true)
    setLogMessage(null)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const payload = currentExercises.map((ex) => ({
        user_id: user.id,
        type: 'strength' as const,
        performed_at: todayStr(),
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        sets: ex.sets,
        reps: parseRangeToNumber(ex.target_reps),
        weight_kg: ex.default_weight_kg,
        rpe: rirToRpe(parseRangeToNumber(ex.target_rir)),
        notes: ex.rationale,
      }))

      const { error: wErr } = await supabase.from('workouts').insert(payload)
      if (wErr) {
        setError(`บันทึกเข้า Log ไม่สำเร็จ: ${wErr.message}`)
        return
      }

      const completionPayload = currentExercises.map((ex) => ({
        user_id: user.id,
        program_exercise_id: ex.id,
        completed_at: todayStr(),
      }))
      await supabase.from('program_completions').upsert(completionPayload, { onConflict: 'user_id,program_exercise_id,completed_at' })

      setCompletedIds(new Set(currentExercises.map((ex) => ex.id)))
      setLogMessage(`บันทึก ${payload.length} ท่าเข้า Log ของวันนี้แล้ว`)
    } catch (err) {
      setError(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLogging(false)
    }
  }

  async function ensureDayExists(dow: number): Promise<ProgramDay | null> {
    const existing = days.find((d) => d.day_of_week === dow)
    if (existing) return existing

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error: err } = await supabase
      .from('program_days')
      .upsert({ user_id: user.id, day_of_week: dow, title: `วัน${WEEKDAYS[dow]}` }, { onConflict: 'user_id,day_of_week' })
      .select('*')
      .single()

    if (err || !data) {
      setError(err?.message ?? 'สร้างวันไม่สำเร็จ')
      return null
    }

    setDays((prev) => [...prev, data as ProgramDay].sort((a, b) => a.day_of_week - b.day_of_week))
    return data as ProgramDay
  }

  async function handleAddExercise(fields: {
    name: string
    sets: string
    reps: string
    rir: string
    rest: string
    muscleGroup: MuscleGroup
  }) {
    const day = await ensureDayExists(selectedDow)
    if (!day) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const position = (exercisesByDay[day.id] ?? []).length

    const { data, error: err } = await supabase
      .from('program_exercises')
      .insert({
        program_day_id: day.id,
        user_id: user.id,
        position,
        exercise_name: fields.name,
        muscle_group: fields.muscleGroup,
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

    setExercisesByDay((prev) => ({
      ...prev,
      [day.id]: [...(prev[day.id] ?? []), data as ProgramExercise],
    }))
    setAddingExercise(false)
  }

  async function handleUpdateExercise(ex: ProgramExercise, patch: Partial<ProgramExercise>) {
    setExercisesByDay((prev) => ({
      ...prev,
      [ex.program_day_id]: (prev[ex.program_day_id] ?? []).map((e) => (e.id === ex.id ? { ...e, ...patch } : e)),
    }))
    const { error: err } = await supabase.from('program_exercises').update(patch).eq('id', ex.id)
    if (err) setError(err.message)
  }

  async function handleDeleteExercise(ex: ProgramExercise) {
    setExercisesByDay((prev) => ({
      ...prev,
      [ex.program_day_id]: (prev[ex.program_day_id] ?? []).filter((e) => e.id !== ex.id),
    }))
    const { error: err } = await supabase.from('program_exercises').delete().eq('id', ex.id)
    if (err) setError(err.message)
  }

  async function handleRenameDay(day: ProgramDay, title: string) {
    setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, title } : d)))
    const { error: err } = await supabase.from('program_days').update({ title }).eq('id', day.id)
    if (err) setError(err.message)
  }

  const isToday = selectedDow === todayDayOfWeek()

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState title="โหลดโปรแกรมไม่สำเร็จ" message={loadError} onRetry={load} />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">โปรแกรม</h1>
          <p className="text-sm text-muted mt-1">แผนออกกำลังกายประจำสัปดาห์ของคุณ</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <a href="/templates" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            📋 เทมเพลต
          </a>
          <a href="/import" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            📥 นำเข้า
          </a>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_SHORT.map((label, dow) => {
          const hasProgram = days.some((d) => d.day_of_week === dow)
          const selected = selectedDow === dow
          const real = dow === todayDayOfWeek()
          return (
            <button
              key={dow}
              onClick={() => setSelectedDow(dow)}
              className={`relative rounded-lg py-2.5 text-xs font-display tracked uppercase transition ${
                selected ? 'bg-amber text-bg' : 'bg-surface text-muted border border-line'
              }`}
            >
              {label}
              {real && <span className={`absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full ${selected ? 'bg-bg' : 'bg-amber'}`} />}
              {hasProgram && !selected && <span className="block w-1 h-1 rounded-full bg-steel mx-auto mt-1" />}
            </button>
          )
        })}
      </div>

      {!isToday && (
        <p className="text-[11px] text-muted bg-surface2 rounded-lg px-3 py-2">
          กำลังดูแผนของวัน{WEEKDAYS[selectedDow]} — ถ้ากด &quot;บันทึกเข้า Log&quot; จะถูกบันทึกลงวันที่จริงคือวันนี้เสมอ
        </p>
      )}

      {isToday && currentDay && currentExercises.length > 0 && (
        <a
          href="/session"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-amber text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99] transition"
        >
          ▶ เริ่มเซสชันแบบเรียลไทม์
        </a>
      )}

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {logMessage && <p className="text-sm text-steel">{logMessage}</p>}

      {!currentDay && (
        <div className="rounded-lg bg-surface border border-line border-dashed px-4 py-8 text-center space-y-3">
          <p className="text-sm text-muted">ยังไม่ได้ตั้งค่าโปรแกรมสำหรับวัน{WEEKDAYS[selectedDow]}</p>
          <div className="flex gap-2 justify-center">
            <a
              href="/import"
              className="text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2 inline-block"
            >
              นำเข้าจาก Excel
            </a>
            <button
              onClick={() => setAddingExercise(true)}
              className="text-xs font-display tracked uppercase text-ink border border-line rounded-lg px-4 py-2"
            >
              + เพิ่มท่าเอง
            </button>
          </div>
        </div>
      )}

      {currentDay && (
        <div className="rounded-lg bg-surface border border-line overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <input
              value={currentDay.title}
              onChange={(e) => handleRenameDay(currentDay, e.target.value)}
              className="bg-transparent text-ink font-display tracked uppercase text-sm outline-none w-full"
            />
          </div>

          <ul>
            {currentExercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                done={completedIds.has(ex.id)}
                onToggle={(done) => toggleComplete(ex.id, done)}
                onUpdate={(patch) => handleUpdateExercise(ex, patch)}
                onDelete={() => handleDeleteExercise(ex)}
              />
            ))}
          </ul>

          <div className="px-4 py-3 border-t border-line">
            <button
              onClick={() => setAddingExercise(true)}
              className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
            >
              + เพิ่มท่า
            </button>
          </div>

          {currentExercises.length > 0 && (
            <div className="px-4 pb-4">
              <button
                onClick={handleLogAllToday}
                disabled={logging}
                className="w-full rounded-lg bg-amber text-bg font-display tracked uppercase py-3 text-sm active:scale-[0.99] disabled:opacity-50 transition"
              >
                {logging ? 'กำลังบันทึก...' : `บันทึกเข้า Log วันนี้ทั้งหมด (${currentExercises.length} ท่า)`}
              </button>
            </div>
          )}
        </div>
      )}

      {addingExercise && (
        <AddExerciseForm onCancel={() => setAddingExercise(false)} onSubmit={handleAddExercise} />
      )}
    </div>
  )
}

function ExerciseRow({
  exercise,
  done,
  onToggle,
  onUpdate,
  onDelete,
}: {
  exercise: ProgramExercise
  done: boolean
  onToggle: (done: boolean) => void
  onUpdate: (patch: Partial<ProgramExercise>) => void
  onDelete: () => void
}) {
  const { unit, toDisplay, toKg, format } = useWeightUnit()
  const [editing, setEditing] = useState(false)

  return (
    <li className="tally-row px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 accent-amber shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${done ? 'text-muted line-through' : 'text-ink'}`}>{exercise.exercise_name}</p>
          {!editing && (
            <p className="text-[11px] text-muted mt-0.5">
              {exercise.sets ?? '–'} เซ็ต × {exercise.target_reps ?? '–'} reps
              {exercise.target_rir && ` · RIR ${exercise.target_rir}`}
              {exercise.rest && ` · พัก ${exercise.rest}`}
              {exercise.default_weight_kg != null && ` · ${format(exercise.default_weight_kg)}`}
            </p>
          )}
          {!editing && exercise.rationale && <p className="text-[11px] text-muted/70 mt-1 italic">{exercise.rationale}</p>}
        </div>
        <button onClick={() => setEditing((v) => !v)} className="text-[11px] text-muted hover:text-amber shrink-0">
          {editing ? 'เสร็จ' : 'แก้ไข'}
        </button>
      </div>

      {editing && (
        <div className="pl-6 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <MiniField label="เซ็ต" value={exercise.sets != null ? String(exercise.sets) : ''} onBlur={(v) => onUpdate({ sets: v ? Number(v) : null })} />
            <MiniField label="Target Reps" value={exercise.target_reps ?? ''} onBlur={(v) => onUpdate({ target_reps: v || null })} />
            <MiniField label="Target RIR" value={exercise.target_rir ?? ''} onBlur={(v) => onUpdate({ target_rir: v || null })} />
            <MiniField label="พัก" value={exercise.rest ?? ''} onBlur={(v) => onUpdate({ rest: v || null })} />
            <MiniField
              label={`น้ำหนักเริ่มต้น (${unit})`}
              value={exercise.default_weight_kg != null ? String(toDisplay(exercise.default_weight_kg)) : ''}
              onBlur={(v) => onUpdate({ default_weight_kg: v ? toKg(Number(v)) : null })}
            />
            <label className="block">
              <span className="block text-[9px] tracked uppercase text-muted mb-0.5">กลุ่มกล้ามเนื้อ</span>
              <select
                value={(exercise.muscle_group as MuscleGroup) ?? 'อื่นๆ'}
                onChange={(e) => onUpdate({ muscle_group: e.target.value })}
                className="w-full bg-surface2 text-ink text-xs rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
              >
                {MUSCLE_GROUPS.map((mg) => (
                  <option key={mg} value={mg}>
                    {mg}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={onDelete} className="text-[11px] text-rusttext hover:underline">
            ลบท่านี้
          </button>
        </div>
      )}
    </li>
  )
}

function MiniField({ label, value, onBlur }: { label: string; value: string; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onBlur(local)}
        className="w-full bg-surface2 text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}

function AddExerciseForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (fields: { name: string; sets: string; reps: string; rir: string; rest: string; muscleGroup: MuscleGroup }) => void
}) {
  const [name, setName] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [rest, setRest] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('อื่นๆ')

  return (
    <div className="rounded-lg bg-surface border border-line px-4 py-4 space-y-3">
      <p className="text-sm text-ink font-display tracked uppercase">เพิ่มท่าใหม่</p>
      <ExercisePicker
        value={name}
        onChange={setName}
        onSelect={(ex: ExerciseDef) => {
          setMuscleGroup(ex.muscleGroup)
        }}
        placeholder="ชื่อท่า"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <MiniField label="เซ็ต" value={sets} onBlur={setSets} />
        <MiniField label="Target Reps" value={reps} onBlur={setReps} />
        <MiniField label="Target RIR" value={rir} onBlur={setRir} />
        <MiniField label="พัก" value={rest} onBlur={setRest} />
      </div>
      <select
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
        className="w-full bg-surface2 text-ink text-xs rounded px-2 py-2 border border-line outline-none focus:border-amber"
      >
        {MUSCLE_GROUPS.map((mg) => (
          <option key={mg} value={mg}>
            {mg}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs"
        >
          ยกเลิก
        </button>
        <button
          onClick={() => name.trim() && onSubmit({ name: name.trim(), sets, reps, rir, rest, muscleGroup })}
          className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99]"
        >
          เพิ่มท่านี้
        </button>
      </div>
    </div>
  )
}
