'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutSet, WorkoutType } from '@/lib/types'
import { MUSCLE_GROUPS, MUSCLE_GROUP_COLORS } from '@/lib/muscle-groups'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import ExercisePicker from '@/components/ExercisePicker'
import { findExerciseByName, type ExerciseDef } from '@/lib/exercises'
import { useExerciseLibrary } from '@/lib/useExerciseLibrary'
import LoadingState from '@/components/LoadingState'
import SetEntryList, { newSetRow, type SetRow } from '@/components/SetEntryList'
import ImportCardioPhoto from '@/components/ImportCardioPhotoGemini'
import MuscleDiagram from '@/components/MuscleDiagram'
import { computePaceSpeed, formatPace } from '@/lib/cardioPace'
import { classifyHRZone, HR_ZONES, DEFAULT_MAX_HEART_RATE } from '@/lib/heartRate'

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
  return (
    <Suspense fallback={<LoadingState />}>
      <LogPageInner />
    </Suspense>
  )
}

function LogPageInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { unit, toDisplay, toKg, format } = useWeightUnit()
  const { data: exercises = [] } = useExerciseLibrary()

  // ใช้จัด Heart Rate Zone ของชีพจรเฉลี่ยที่กรอก/นำเข้ามา — ค่าเดียวกับที่ตั้งไว้ใน Weekly Cardio Volume
  // (ดู components/HeartRateSettings.tsx) ถ้ายังไม่เคยตั้งจะได้ค่าประมาณมาตรฐานแทน
  const { data: maxHeartRate } = useQuery({
    queryKey: ['profile-max-heart-rate'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return DEFAULT_MAX_HEART_RATE
      const { data } = await supabase.from('profiles').select('max_heart_rate').eq('user_id', user.id).maybeSingle()
      return (data as { max_heart_rate: number | null } | null)?.max_heart_rate ?? DEFAULT_MAX_HEART_RATE
    },
    staleTime: 60_000,
  })

  const [type, setType] = useState<WorkoutType>('strength')
  const [date, setDate] = useState(todayStr())
  const [editingId, setEditingId] = useState<string | null>(null)

  // strength fields
  const [exerciseName, setExerciseName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [setRows, setSetRows] = useState<SetRow[]>([])
  const [rpe, setRpe] = useState('')

  // cardio fields
  const [cardioType, setCardioType] = useState('')
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')
  const [avgHeartRate, setAvgHeartRate] = useState('')
  const [caloriesKcal, setCaloriesKcal] = useState('')

  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>([])
  const [exerciseLibraryId, setExerciseLibraryId] = useState<string | null>(null)
  const [highlighterMuscles, setHighlighterMuscles] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [prFlash, setPrFlash] = useState(false)

  const [today, setToday] = useState<Workout[]>([])

  // รูปท่าออกกำลังกายจริง (ไม่ใช่ไดอะแกรมกล้ามเนื้อ) — เอาไว้โชว์คู่กับ MuscleDiagram ตอนเลือกท่า
  // ใช้ exerciseLibraryId ก่อน (แม่นสุด, ตรงกับท่าที่เลือกจาก dropdown เป๊ะๆ) ถ้าไม่มีค่อย fallback
  // ไปหาแบบชื่อ/นามแฝง เผื่อผู้ใช้พิมพ์ชื่อเองแต่ตรงกับท่าที่มีอยู่ในฐานข้อมูล
  const selectedExercise = useMemo(() => {
    if (exerciseLibraryId) {
      const byId = exercises.find((e) => e.id === exerciseLibraryId)
      if (byId) return byId
    }
    return exerciseName ? findExerciseByName(exercises, exerciseName) : null
  }, [exercises, exerciseLibraryId, exerciseName])
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

  // เปิดหน้านี้พร้อม ?edit=<id> (เช่น กดปุ่ม "แก้ไข" จากหน้าประวัติ) — โหลดรายการนั้นเข้าฟอร์ม
  // แล้วล้าง query param ทิ้งกัน refresh แล้วเด้งเข้าโหมดแก้ไขซ้ำอีกครั้งโดยไม่ตั้งใจ
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    ;(async () => {
      const { data } = await supabase.from('workouts').select('*').eq('id', editId).maybeSingle()
      if (data) await loadWorkoutIntoForm(data as Workout)
      router.replace('/log')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // เติมข้อมูลรายการเดิมเข้าฟอร์ม เพื่อแก้ไข (วันที่ผิด/น้ำหนักผิด ฯลฯ) แทนที่จะลบแล้วพิมพ์ใหม่
  async function loadWorkoutIntoForm(w: Workout) {
    setEditingId(w.id)
    setType(w.type)
    setDate(w.performed_at)
    setNotes(w.notes ?? '')
    setError(null)
    setLastEntry(null)
    if (w.type === 'strength') {
      setExerciseName(w.exercise_name ?? '')
      setMuscleGroup(w.muscle_group ?? '')
      if (w.secondary_muscles && w.secondary_muscles.length > 0) {
        setSecondaryMuscles(w.secondary_muscles)
      } else {
        // แถวเก่าที่บันทึกก่อนมีคอลัมน์ secondary_muscles — เดาจาก Library แทน
        const match = w.exercise_name ? findExerciseByName(exercises, w.exercise_name) : null
        setSecondaryMuscles(match?.secondaryMuscles ?? [])
      }
      setExerciseLibraryId(w.exercise_library_id ?? null)
      const known =
        (w.exercise_library_id ? exercises.find((e) => e.id === w.exercise_library_id) : null) ??
        (w.exercise_name ? findExerciseByName(exercises, w.exercise_name) : null)
      setHighlighterMuscles(known?.highlighterMuscles ?? [])
      setRpe(w.rpe !== null ? String(w.rpe) : '')
      const rows = await buildRowsFromWorkout(w)
      // เซ็ตพวกนี้ทำเสร็จไปแล้วจริง (มาจากรายการที่บันทึกแล้ว) — ติ๊ก done ให้เลย
      // ไม่งั้นตอนกดบันทึกซ้ำ ระบบจะกรองทิ้งเพราะคิดว่ายังไม่เสร็จ (ดู doneRows ใน handleSubmit)
      setSetRows(rows.map((r) => ({ ...r, done: true })))
      setCardioType('')
      setDistance('')
      setDuration('')
      setAvgHeartRate('')
      setCaloriesKcal('')
    } else {
      setCardioType(w.cardio_type ?? '')
      setDistance(w.distance_km !== null ? String(w.distance_km) : '')
      setDuration(w.duration_min !== null ? String(w.duration_min) : '')
      setAvgHeartRate(w.avg_heart_rate !== null && w.avg_heart_rate !== undefined ? String(w.avg_heart_rate) : '')
      setCaloriesKcal(w.calories_kcal !== null && w.calories_kcal !== undefined ? String(w.calories_kcal) : '')
      setExerciseName('')
      setMuscleGroup('')
      setSecondaryMuscles([])
      setExerciseLibraryId(null)
      setHighlighterMuscles([])
      setSetRows([])
      setRpe('')
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDate(todayStr())
    resetForm()
    setError(null)
  }

  function resetForm() {
    setExerciseName('')
    setMuscleGroup('')
    setSecondaryMuscles([])
    setExerciseLibraryId(null)
    setHighlighterMuscles([])
    setSetRows([])
    setRpe('')
    setCardioType('')
    setDistance('')
    setDuration('')
    setAvgHeartRate('')
    setCaloriesKcal('')
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
        let prQuery = supabase
          .from('workouts')
          .select('weight_kg')
          .eq('type', 'strength')
          .eq('exercise_name', exerciseName)
        // แก้ไขรายการเดิมอยู่ — ไม่เอาแถวตัวเองมาเทียบกับตัวเอง ไม่งั้นจะไม่มีวันเป็น PR ใหม่ได้เลย
        if (editingId) prQuery = prQuery.neq('id', editingId)
        const { data: prevBest } = await prQuery.order('weight_kg', { ascending: false }).limit(1).maybeSingle()
        const prevMax = (prevBest?.weight_kg as number | null) ?? 0
        if (topWeightKg > prevMax) isPR = true
      }

      const payload = {
        user_id: user.id,
        type,
        performed_at: date,
        exercise_name: exerciseName || null,
        muscle_group: muscleGroup || null,
        secondary_muscles: secondaryMuscles,
        exercise_library_id: exerciseLibraryId,
        sets: doneRows.length,
        reps: Number(topSet.reps),
        weight_kg: topWeightKg,
        rpe: rpe ? Number(rpe) : null,
        notes: notes || null,
        total_volume_kg: totalVolumeKg,
      }

      const workoutId = editingId
        ? await (async () => {
            const { error: updateError } = await supabase.from('workouts').update(payload).eq('id', editingId)
            if (updateError) return null
            // ลบเซ็ตเก่าทั้งหมดแล้วเขียนชุดใหม่ทับ — ง่ายกว่า diff ทีละเซ็ต และจำนวน/ลำดับเซ็ตอาจเปลี่ยนไปจากเดิม
            await supabase.from('workout_sets').delete().eq('workout_id', editingId)
            return editingId
          })()
        : await (async () => {
            const { data: inserted, error: insertError } = await supabase
              .from('workouts')
              .insert(payload)
              .select('id')
              .single()
            if (insertError || !inserted) return null
            return inserted.id as string
          })()

      if (!workoutId) {
        setSaving(false)
        setError(editingId ? 'บันทึกการแก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง' : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }

      const setsPayload = doneRows.map((r, i) => ({
        workout_id: workoutId,
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
      setEditingId(null)
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
      avg_heart_rate: avgHeartRate ? Math.round(Number(avgHeartRate)) : null,
      calories_kcal: caloriesKcal ? Number(caloriesKcal) : null,
      notes: notes || null,
    }

    const { error } = editingId
      ? await supabase.from('workouts').update(payload).eq('id', editingId)
      : await supabase.from('workouts').insert(payload)

    setSaving(false)

    if (error) {
      setError(editingId ? 'บันทึกการแก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง' : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }

    setEditingId(null)
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
    setExerciseLibraryId(ex.id)
    setHighlighterMuscles(ex.highlighterMuscles)
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
      setSecondaryMuscles(last.secondary_muscles ?? [])
      setExerciseLibraryId(last.exercise_library_id ?? null)
      const known =
        (last.exercise_library_id ? exercises.find((e) => e.id === last.exercise_library_id) : null) ??
        (last.exercise_name ? findExerciseByName(exercises, last.exercise_name) : null)
      setHighlighterMuscles(known?.highlighterMuscles ?? [])
      setRpe(last.rpe !== null ? String(last.rpe) : '')
      setSetRows(await buildRowsFromWorkout(last))
    } else {
      setCardioType(last.cardio_type ?? '')
      setDistance(last.distance_km !== null ? String(last.distance_km) : '')
      setDuration(last.duration_min !== null ? String(last.duration_min) : '')
      setAvgHeartRate(last.avg_heart_rate !== null && last.avg_heart_rate !== undefined ? String(last.avg_heart_rate) : '')
      setCaloriesKcal(last.calories_kcal !== null && last.calories_kcal !== undefined ? String(last.calories_kcal) : '')
    }
  }

  // ค่าน้ำหนักที่หนักที่สุดที่กรอกไว้ตอนนี้ (หน่วยที่แสดงอยู่) ใช้เทียบกับครั้งก่อนใน DeltaBadge
  const currentTopWeight =
    setRows.length > 0 ? Math.max(...setRows.map((r) => (r.weight ? Number(r.weight) : 0))) : null

  // Pace/Speed คำนวณสดจากระยะทาง+เวลาที่กรอกอยู่ตอนนี้ — ไม่เก็บลง DB แยก เป็นแค่ตัวช่วยแสดงผล
  const paceSpeed = computePaceSpeed(distance ? Number(distance) : null, duration ? Number(duration) : null)
  // Heart Rate Zone ของชีพจรเฉลี่ยที่กรอก/นำเข้ามา เทียบกับชีพจรสูงสุดของผู้ใช้ (ตั้งค่าไว้ที่ Weekly Cardio Volume)
  const hrZoneDef = avgHeartRate
    ? HR_ZONES.find((z) => z.key === classifyHRZone(Number(avgHeartRate), maxHeartRate ?? DEFAULT_MAX_HEART_RATE))
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">{editingId ? 'แก้ไขรายการ' : 'บันทึกวันนี้'}</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 bg-transparent text-muted text-sm font-mono outline-none border-b border-transparent focus:border-line"
        />
      </div>

      {editingId && (
        <div className="rounded-lg bg-amber/10 border border-amber/40 px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-amber font-display tracked uppercase">กำลังแก้ไขรายการเดิม</span>
          <button
            type="button"
            onClick={cancelEdit}
            className="text-xs text-muted hover:text-ink underline underline-offset-2"
          >
            ยกเลิกการแก้ไข
          </button>
        </div>
      )}

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

      <form id="log-form" onSubmit={handleSubmit} className="space-y-4">
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
                  const match = findExerciseByName(exercises, name)
                  if (match) {
                    setMuscleGroup(match.muscleGroup)
                    setSecondaryMuscles(match.secondaryMuscles)
                    setExerciseLibraryId(match.id)
                    setHighlighterMuscles(match.highlighterMuscles)
                  } else {
                    // ชื่อไม่ตรงกับท่าไหนใน Library แล้ว — เคลียร์ FK เดิมทิ้ง กันชี้ไปท่าอื่นผิดๆ
                    setExerciseLibraryId(null)
                    setHighlighterMuscles([])
                  }
                }}
                onSelect={handleExerciseSelect}
              />
              {(selectedExercise?.imageUrl || highlighterMuscles.length > 0) && (
                <div className="mt-2 flex items-start gap-2">
                  {selectedExercise?.imageUrl && (
                    <img
                      src={selectedExercise.imageUrl}
                      alt={selectedExercise.name}
                      loading="lazy"
                      className="flex-1 min-w-0 rounded-xl bg-panel object-cover aspect-square"
                    />
                  )}
                  {highlighterMuscles.length > 0 && (
                    <div className="flex-1 min-w-0 rounded-xl bg-panel flex items-center justify-center py-2 self-stretch">
                      <MuscleDiagram exerciseName={exerciseName} highlighterMuscles={highlighterMuscles} />
                    </div>
                  )}
                </div>
              )}
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
            <ImportCardioPhoto
              onExtracted={(result) => {
                if (result.cardio_type) setCardioType(result.cardio_type)
                if (result.distance_km !== null) setDistance(String(result.distance_km))
                if (result.duration_min !== null) setDuration(String(result.duration_min))
                if (result.avg_heart_rate !== null) setAvgHeartRate(String(result.avg_heart_rate))
                if (result.calories_kcal !== null) setCaloriesKcal(String(result.calories_kcal))
              }}
            />
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
                  step="0.01"
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
                  step="0.01"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="input font-mono text-center"
                />
              </Field>
              <Field label="ชีพจรเฉลี่ย (bpm) — ไม่บังคับ">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="1"
                  value={avgHeartRate}
                  onChange={(e) => setAvgHeartRate(e.target.value)}
                  className="input font-mono text-center"
                />
                {hrZoneDef && (
                  <p className="text-[11px] font-mono mt-1.5 flex items-center justify-center gap-1.5" style={{ color: hrZoneDef.color }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hrZoneDef.color }} />
                    {hrZoneDef.label}
                  </p>
                )}
              </Field>
              <Field label="แคลอรี่จริง (kcal) — ไม่บังคับ">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={caloriesKcal}
                  onChange={(e) => setCaloriesKcal(e.target.value)}
                  className="input font-mono text-center"
                  placeholder="ถ้าไม่กรอกจะประมาณให้เอง"
                />
              </Field>
            </div>

            {paceSpeed && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-surface2 px-3 py-2.5 text-center">
                  <p className="text-[10px] tracked uppercase text-muted">Pace เฉลี่ย</p>
                  <p className="font-mono text-lg text-ink mt-0.5">
                    {formatPace(paceSpeed.paceMinPerKm)}
                    <span className="text-xs text-muted ml-1">/km</span>
                  </p>
                </div>
                <div className="rounded-md bg-surface2 px-3 py-2.5 text-center">
                  <p className="text-[10px] tracked uppercase text-muted">Avg Speed</p>
                  <p className="font-mono text-lg text-ink mt-0.5">
                    {paceSpeed.speedKmh.toFixed(1)}
                    <span className="text-xs text-muted ml-1">km/h</span>
                  </p>
                </div>
              </div>
            )}
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
          {saving ? 'กำลังบันทึก...' : flash ? 'บันทึกแล้ว ✓' : editingId ? 'บันทึกการแก้ไข' : 'บันทึก'}
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
          <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-8 text-center space-y-3">
            <div className="text-3xl">🏋️</div>
            <p className="text-sm text-muted">ยังไม่มีรายการวันนี้ เริ่มบันทึกเซ็ตแรกได้เลย</p>
            <a
              href="#log-form"
              className="inline-block text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] transition"
            >
              + บันทึกเซ็ตแรก
            </a>
          </div>
        ) : (
          <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
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
                        {w.avg_heart_rate !== null && w.avg_heart_rate !== undefined && ` · ${w.avg_heart_rate}bpm`}
                      </>
                    )}
                  </p>
                  {w.notes && <p className="text-xs text-muted mt-0.5">{w.notes}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <button
                    type="button"
                    onClick={() => loadWorkoutIntoForm(w)}
                    className="text-muted hover:text-amber text-xs"
                    aria-label="แก้ไขรายการ"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="text-muted hover:text-rust text-xs"
                    aria-label="ลบรายการ"
                  >
                    ลบ
                  </button>
                </div>
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
