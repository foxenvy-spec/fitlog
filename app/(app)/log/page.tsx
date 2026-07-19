'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutSet, WorkoutType } from '@/lib/types'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS } from '@/lib/muscle-groups'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ExercisePicker from '@/components/ExercisePicker'
import { findExerciseByName, type ExerciseDef } from '@/lib/exercises'
import LoadingState from '@/components/LoadingState'
import SetEntryList, { newSetRow, type SetRow } from '@/components/SetEntryList'

const CARDIO_PRESETS = ['วิ่ง', 'ปั่นจักรยาน', 'ว่ายน้ำ', 'เดินเร็ว', 'กระโดดเชือก']

function todayStr() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

function shortDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export default function LogPage() {
  const supabase = createClient()
  const { unit, toDisplay, toKg, format } = useWeightUnit()
  const [type, setType] = useState<WorkoutType>('strength')
  const [date, setDate] = useState(todayStr())

  // strength fields
  const [exerciseName, setExerciseName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [setRows, setSetRows] = useState<SetRow[]>([])
  const [rpe, setRpe] = useState('')

  // cardio fields
  const [cardioType, setCardioType] = useState('')
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')

  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [prFlash, setPrFlash] = useState(false)

  const [today, setToday] = useState<Workout[]>([])
  const [loadingToday, setLoadingToday] = useState(true)
  const [todayError, setTodayError] = useState<string | null>(null)
  const [lastEntry, setLastEntry] = useState<Workout | null>(null)

  // ค่าที่มาจาก DB เป็น kg เสมอ — ฟอร์มกรอกและแสดงผลในหน่วยที่ผู้ใช้เลือกไว้ตอนนี้ (unit)
  // ดังนั้นตอนดึงเซ็ตเก่ามาเติมฟอร์ม ต้องแปลง kg -> หน่วยที่แสดง ก่อนใส่ใน SetRow.weight
  const buildRowsFromWorkout = useCallback(
    async (workout: Workout): Promise<SetRow[]> => {
      const { data: existingSets } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('workout_id', workout.id)
        .order('set_number')
      const rows = (existingSets as WorkoutSet[]) ?? []
      if (rows.length > 0) {
        return rows.map((s) =>
          newSetRow(s.reps !== null ? String(s.reps) : '', s.weight_kg !== null ? String(toDisplay(s.weight_kg)) : '')
        )
      }
      // แถวเก่าก่อนมี workout_sets — จำลองเป็นหลายเซ็ตค่าเท่ากันจาก sets/reps/weight_kg เดิม
      if (workout.sets) {
        return Array.from({ length: workout.sets }, () =>
          newSetRow(
            workout.reps !== null ? String(workout.reps) : '',
            workout.weight_kg !== null ? String(toDisplay(workout.weight_kg)) : ''
          )
        )
      }
      return []
    },
    [supabase, toDisplay]
  )

  const loadLastEntry = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        setLastEntry(null)
        return
      }
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('type', 'strength')
        .ilike('exercise_name', name.trim())
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const last = (data as Workout) ?? null
      setLastEntry(last)
      // Auto Fill: เพิ่งเลือกท่านี้ ยังไม่มีเซ็ตอะไรกรอกไว้ในฟอร์ม — เติมค่าจากครั้งก่อนให้เลย
      // ผู้ใช้แค่ไล่กด ✓ ทีละเซ็ตตอนทำจริง ไม่ต้องพิมพ์น้ำหนัก/reps ใหม่จากศูนย์
      if (last && setRows.length === 0) {
        setSetRows(await buildRowsFromWorkout(last))
      }
    },
    [supabase, buildRowsFromWorkout, setRows.length]
  )

  const loadToday = useCallback(async () => {
    setLoadingToday(true)
    setTodayError(null)
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('performed_at', date)
      .order('created_at', { ascending: false })
    if (error) {
      setTodayError(error.message)
      setLoadingToday(false)
      return
    }
    setToday((data as Workout[]) ?? [])
    setLoadingToday(false)
  }, [supabase, date])

  useEffect(() => {
    loadToday()
  }, [loadToday])

  function resetForm() {
    setExerciseName('')
    setMuscleGroup('')
    setSecondaryMuscles([])
    setSetRows([])
    setRpe('')
    setCardioType('')
    setDistance('')
    setDuration('')
    setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      return
    }

    if (type === 'strength') {
      const doneRows = setRows.filter((r) => r.done && r.weight !== '' && r.reps !== '')
      if (doneRows.length === 0) {
        setError('ติ๊ก ✓ อย่างน้อย 1 เซ็ตที่ทำเสร็จแล้วก่อนบันทึก')
        return
      }

      setSaving(true)

      // top set = เซ็ตที่หนักที่สุด (ถ้าเท่ากันเทียบ reps) — ใช้แทนค่าน้ำหนักเดี่ยวเดิมสำหรับ PR / ประมาณ 1RM
      // r.weight ที่ผู้ใช้กรอกเป็นหน่วยที่เลือกแสดงอยู่ตอนนี้ (unit) — ต้องแปลงเป็น kg ก่อนเทียบ/บันทึก
      // เพราะ DB เก็บ weight_kg เป็น kg เสมอไม่ว่าจะแสดงผลเป็นหน่วยไหน
      const topSet = doneRows.reduce((best, r) => {
        if (Number(r.weight) > Number(best.weight)) return r
        if (Number(r.weight) === Number(best.weight) && Number(r.reps) > Number(best.reps)) return r
        return best
      }, doneRows[0])
      const topWeightKg = toKg(Number(topSet.weight))
      const totalVolumeKg = doneRows.reduce((sum, r) => sum + toKg(Number(r.weight)) * Number(r.reps), 0)

      let isPR = false
      if (exerciseName) {
        const { data: prevBest } = await supabase
          .from('workouts')
          .select('weight_kg')
          .eq('type', 'strength')
          .eq('exercise_name', exerciseName)
          .order('weight_kg', { ascending: false })
          .limit(1)
          .maybeSingle()
        const prevMax = (prevBest?.weight_kg as number | null) ?? 0
        if (topWeightKg > prevMax) isPR = true
      }

      const payload = {
        user_id: user.id,
        type,
        performed_at: date,
        exercise_name: exerciseName || null,
        muscle_group: muscleGroup || null,
        sets: doneRows.length,
        reps: Number(topSet.reps),
        weight_kg: topWeightKg,
        rpe: rpe ? Number(rpe) : null,
        notes: notes || null,
        total_volume_kg: totalVolumeKg,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('workouts')
        .insert(payload)
        .select('id')
        .single()

      if (insertError || !inserted) {
        setSaving(false)
        setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }

      const setsPayload = doneRows.map((r, i) => ({
        workout_id: inserted.id,
        user_id: user.id,
        set_number: i + 1,
        reps: Number(r.reps),
        weight_kg: toKg(Number(r.weight)),
        completed: true,
      }))
      const { error: setsError } = await supabase.from('workout_sets').insert(setsPayload)

      setSaving(false)

      if (setsError) {
        // แถวสรุป (workouts) บันทึกสำเร็จแล้ว แค่รายละเอียดทีละเซ็ตไม่ครบ — ตัวเลขรวมยังถูกต้อง
        setError('บันทึกสำเร็จ แต่รายละเอียดทีละเซ็ตบันทึกไม่ครบ')
      }

      resetForm()
      setLastEntry(null)
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
      if (isPR) {
        setPrFlash(true)
        setTimeout(() => setPrFlash(false), 2500)
      }
      loadToday()
      return
    }

    setSaving(true)

    const payload: Partial<Workout> & { user_id: string; type: WorkoutType; performed_at: string } = {
      user_id: user.id,
      type,
      performed_at: date,
      cardio_type: cardioType || null,
      distance_km: distance ? Number(distance) : null,
      duration_min: duration ? Number(duration) : null,
      notes: notes || null,
    }

    const { error } = await supabase.from('workouts').insert(payload)

    setSaving(false)

    if (error) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }

    resetForm()
    setFlash(true)
    setTimeout(() => setFlash(false), 1200)
    loadToday()
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from('workouts').delete().eq('id', id)
    if (err) {
      setError(`ลบไม่สำเร็จ: ${err.message}`)
      return
    }
    loadToday()
  }

  function handleExerciseSelect(ex: ExerciseDef) {
    setMuscleGroup(ex.muscleGroup)
    setSecondaryMuscles(ex.secondaryMuscles)
    loadLastEntry(ex.name)
  }

  async function handleCopyLast() {
    let query = supabase.from('workouts').select('*').eq('type', type)
    if (type === 'strength' && exerciseName) {
      query = query.eq('exercise_name', exerciseName)
    } else if (type === 'cardio' && cardioType) {
      query = query.eq('cardio_type', cardioType)
    }
    const { data } = await query.order('performed_at', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const last = data as Workout | null
    if (!last) return
    if (type === 'strength') {
      setExerciseName(last.exercise_name ?? '')
      setMuscleGroup(last.muscle_group ?? '')
      setRpe(last.rpe !== null ? String(last.rpe) : '')
      setSetRows(await buildRowsFromWorkout(last))
    } else {
      setCardioType(last.cardio_type ?? '')
      setDistance(last.distance_km !== null ? String(last.distance_km) : '')
      setDuration(last.duration_min !== null ? String(last.duration_min) : '')
    }
  }

  // ค่าน้ำหนักที่หนักที่สุดที่กรอกไว้ตอนนี้ (หน่วยที่แสดงอยู่) ใช้เทียบกับครั้งก่อนใน DeltaBadge
  const currentTopWeight =
    setRows.length > 0 ? Math.max(...setRows.map((r) => (r.weight ? Number(r.weight) : 0))) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">บันทึกวันนี้</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 bg-transparent text-muted text-sm font-mono outline-none border-b border-transparent focus:border-line"
        />
      </div>

      {/* Type toggle */}
      <div className="flex rounded-full bg-surface p-1 border border-line">
        <button
          type="button"
          onClick={() => setType('strength')}
          className={`flex-1 py-2.5 rounded-full text-sm font-display tracked uppercase transition ${
            type === 'strength' ? 'bg-steel text-bg' : 'text-muted'
          }`}
        >
          เวทเทรนนิ่ง
        </button>
        <button
          type="button"
          onClick={() => setType('cardio')}
          className={`flex-1 py-2.5 rounded-full text-sm font-display tracked uppercase transition ${
            type === 'cardio' ? 'bg-rust text-ink' : 'text-muted'
          }`}
        >
          คาร์ดิโอ
        </button>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleCopyLast}
          className="text-xs font-display tracked uppercase text-muted hover:text-amber transition"
        >
          ⧉ คัดลอกจากครั้งก่อน
        </button>
        <div className="flex gap-3">
          <a href="/exercises" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            🔍 ฐานข้อมูลท่า
          </a>
          <a href="/templates" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            📋 เทมเพลต
          </a>
          <a href="/import" className="text-xs font-display tracked uppercase text-muted hover:text-amber transition">
            📥 นำเข้าจาก Excel
          </a>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {type === 'strength' ? (
          <>
            <Field label="ท่าออกกำลังกาย">
              <ExercisePicker
                value={exerciseName}
                onChange={(name) => {
                  setExerciseName(name)
                  // ผู้ใช้พิมพ์เอง (ไม่ได้เลือกจาก dropdown) — เช็คว่าชื่อที่พิมพ์ตรงกับ
                  // ชื่อ/นามแฝงของท่าไหนในฐานข้อมูลไหม เจอแล้วเติม primary + secondary muscle ให้เลย
                  // รองรับหลายชื่อเรียกของท่าเดียวกัน เช่น "Bench Press" / "Barbell Bench Press" / "Flat BB Bench"
                  const match = findExerciseByName(name)
                  if (match) {
                    setMuscleGroup(match.muscleGroup)
                    setSecondaryMuscles(match.secondaryMuscles)
                  }
                }}
                onSelect={handleExerciseSelect}
              />
              {secondaryMuscles.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted">
                  กล้ามเนื้อรอง:{' '}
                  {secondaryMuscles.map((mg, i) => (
                    <span key={mg} style={{ color: MUSCLE_GROUP_COLORS[mg as keyof typeof MUSCLE_GROUP_COLORS] }}>
                      {mg}
                      {i < secondaryMuscles.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
              {lastEntry && (
                <div className="mt-2 rounded-lg bg-surface2 border border-line px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    ครั้งก่อน ({shortDate(lastEntry.performed_at)}): {lastEntry.sets}×{lastEntry.reps} @{' '}
                    {format(lastEntry.weight_kg)}
                  </span>
                  <DeltaBadge current={currentTopWeight} previous={lastEntry.weight_kg !== null ? toDisplay(lastEntry.weight_kg) : null} />
                </div>
              )}
            </Field>
            <Field label="กล้ามเนื้อที่ใช้ (สำหรับสถิติ Muscle Distribution)">
              <div className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.map((mg) => (
                  <button
                    key={mg}
                    type="button"
                    onClick={() => setMuscleGroup(mg)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition ${
                      muscleGroup === mg
                        ? 'bg-steel text-bg border-steel'
                        : 'bg-surface2 border-line text-muted hover:text-ink hover:border-amber/50'
                    }`}
                  >
                    {mg}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="เซ็ต — ติ๊ก ✓ ทีละเซ็ตตอนทำเสร็จ">
              <SetEntryList rows={setRows} onChange={setSetRows} weightUnit={unit} />
            </Field>
            <Field label="RPE — ความหนักที่รู้สึก (ไม่บังคับ)">
              <div className="flex flex-wrap gap-1.5">
                {['', '6', '7', '8', '9', '10'].map((v) => (
                  <button
                    key={v || 'none'}
                    type="button"
                    onClick={() => setRpe(v)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition ${
                      rpe === v
                        ? 'bg-amber text-bg border-amber'
                        : 'bg-surface2 border-line text-muted hover:text-ink hover:border-amber/50'
                    }`}
                  >
                    {v === '' ? 'ไม่ระบุ' : v}
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="ประเภทคาร์ดิโอ">
              <input
                required
                value={cardioType}
                onChange={(e) => setCardioType(e.target.value)}
                placeholder="เช่น วิ่ง"
                className="input"
              />
              <ChipRow options={CARDIO_PRESETS} onPick={setCardioType} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ระยะทาง (กม.)">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  className="input font-mono text-center"
                />
              </Field>
              <Field label="เวลา (นาที)">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="input font-mono text-center"
                />
              </Field>
            </div>
          </>
        )}

        <Field label="โน้ตเพิ่มเติม (ถ้ามี)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ความรู้สึก, สภาพร่างกาย ฯลฯ"
            className="input"
          />
        </Field>

        {error && <p className="text-sm text-rusttext">{error}</p>}

        {prFlash && (
          <p className="text-center text-sm font-display tracked uppercase text-amber">
            🏆 สถิติใหม่ส่วนตัว (PR)!
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`w-full rounded-lg font-display tracked uppercase py-3.5 text-lg transition active:scale-[0.99] disabled:opacity-50 ${
            type === 'strength' ? 'bg-steel text-bg' : 'bg-rust text-ink'
          } ${flash ? 'ring-2 ring-amber' : ''}`}
        >
          {saving ? 'กำลังบันทึก...' : flash ? 'บันทึกแล้ว ✓' : 'บันทึก'}
        </button>
      </form>

      <div>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-2">
          รายการวันนี้ {loadingToday ? '' : `(${today.length})`}
        </h2>
        {loadingToday ? (
          <LoadingState />
        ) : todayError ? (
          <div className="rounded-lg bg-surface border border-rustdim px-4 py-6 text-center space-y-2">
            <p className="text-sm text-muted">โหลดรายการวันนี้ไม่สำเร็จ: {todayError}</p>
            <button
              type="button"
              onClick={loadToday}
              className="text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 inline-block"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : today.length === 0 ? (
          <p className="text-sm text-muted bg-surface border border-line rounded-lg px-4 py-6 text-center">
            ยังไม่มีรายการ เริ่มบันทึกเซ็ตแรกได้เลย
          </p>
        ) : (
          <ul className="rounded-lg bg-surface border border-line overflow-hidden">
            {today.map((w) => (
              <li key={w.id} className="tally-row flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-ink text-sm">
                    {w.type === 'strength' ? (
                      <>
                        <span className="text-steel font-display tracked uppercase text-xs mr-2">STR</span>
                        {w.exercise_name} — {w.sets}×{w.reps} @ {format(w.weight_kg)}
                        {w.rpe !== null && <span className="text-muted"> · RPE {w.rpe}</span>}
                      </>
                    ) : (
                      <>
                        <span className="text-rusttext font-display tracked uppercase text-xs mr-2">CAR</span>
                        {w.cardio_type} — {w.distance_km}km / {w.duration_min}min
                      </>
                    )}
                  </p>
                  {w.notes && <p className="text-xs text-muted mt-0.5">{w.notes}</p>}
                </div>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="text-muted hover:text-rust text-xs shrink-0 ml-3"
                  aria-label="ลบรายการ"
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <a
        href="/history"
        className="block text-center text-xs tracked uppercase text-muted hover:text-amber transition py-2"
      >
        ดูประวัติทั้งหมด →
      </a>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs tracked uppercase text-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function ChipRow({ options, onPick }: { options: string[]; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onPick(opt)}
          className="text-xs px-2.5 py-1 rounded-full bg-surface2 border border-line text-muted hover:text-ink hover:border-amber/50 transition"
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function DeltaBadge({ current, previous }: { current: number | null; previous: number | null }) {
  const { unit } = useWeightUnit()
  if (current === null || previous === null || current === previous) return null
  const diff = Math.round((current - previous) * 10) / 10
  const up = diff > 0
  return (
    <span className={`text-[11px] font-mono shrink-0 ${up ? 'text-steel' : 'text-rusttext'}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {diff}
      {unit}
    </span>
  )
}
