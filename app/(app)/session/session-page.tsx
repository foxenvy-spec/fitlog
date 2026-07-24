'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProgramDay, ProgramExercise, Workout } from '@/lib/types'
import { todayDayOfWeek, todayStr } from '@/lib/weekdays'
import { MUSCLE_GROUP_COLORS, RECOVERY_MUSCLES, type MuscleGroup } from '@/lib/muscle-groups'
import {
  parseRestSeconds,
  initSessionSet,
  initSessionStates,
  firstUnfinishedIndex,
  nextUnvisitedIndex,
  computeSessionSummary,
  aggregateMuscleLoads,
  getSkippedExercises,
  findExtraLoggedExercises,
  makeAdhocExercise,
  isAdhocExercise,
  type SessionSetState,
  type LoggedWorkoutRow,
  type LoggedSetRow,
  type LastPerformance,
} from '@/lib/workoutSession'
import ExercisePicker from '@/components/ExercisePicker'
import type { ExerciseDef } from '@/lib/exerciseLibrary'
import { estimateCaloriesToday } from '@/lib/dashboardStats'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import { dropSetWeightKg } from '@/lib/weightUnit'
import { useToast } from '@/components/Toast'
import WeightUnitToggle from '@/components/WeightUnitToggle'
import { computeSessionMuscleRecovery, tierForPct, type MuscleRecoveryScore } from '@/lib/recoveryScore'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { useVoiceEnabled } from '@/lib/useVoiceEnabled'
import { speak } from '@/lib/speech'
import { NumberStepper } from '@/components/timers/TimerShell'
import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

type Phase = 'loading' | 'error' | 'empty' | 'active' | 'done'

interface PRHit {
  exerciseName: string
  weightKg: number
  deltaKg: number
}

interface SummaryExtras {
  calories: number
  prs: PRHit[]
  recovery: { overall: number; byMuscle: MuscleRecoveryScore[] }
}

export default function SessionPage() {
  const supabase = createClient()
  const { unit, toDisplay, toKg, format } = useWeightUnit()
  const { showToast } = useToast()

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [day, setDay] = useState<ProgramDay | null>(null)
  const [exercises, setExercises] = useState<ProgramExercise[]>([])
  const [states, setStates] = useState<Record<string, SessionSetState>>({})
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [summaryExtras, setSummaryExtras] = useState<SummaryExtras | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  // "เพิ่มท่า" เอง ระหว่างเซสชัน — ไว้สำหรับท่านอกแผนที่อยากแทรกเข้ามาเล่นเพิ่ม
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseDef, setNewExerciseDef] = useState<ExerciseDef | null>(null)
  const [addExerciseError, setAddExerciseError] = useState<string | null>(null)

  // นาฬิกาเซสชันรวม — เดินตั้งแต่เปิดหน้า ใช้บอกเวลาที่ใช้ไปในสรุปตอนจบ
  const session = useStopwatch()
  const sessionStartedRef = useRef(false)

  // กันหน้าจอดับตลอดเซสชัน ไม่ต้องรอให้ rest timer ทำงานก่อน
  useWakeLock(phase === 'active')

  const load = useCallback(async () => {
    setPhase('loading')
    setErrorMsg(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setPhase('empty')
      return
    }

    const dow = todayDayOfWeek()
    const { data: dayRow, error: dayErr } = await supabase
      .from('program_days')
      .select('*')
      .eq('day_of_week', dow)
      .maybeSingle()

    if (dayErr) {
      setErrorMsg(dayErr.message)
      setPhase('error')
      return
    }

    if (!dayRow) {
      setPhase('empty')
      return
    }

    const { data: exRows, error: exErr } = await supabase
      .from('program_exercises')
      .select('*')
      .eq('program_day_id', (dayRow as ProgramDay).id)
      .order('position')

    if (exErr) {
      setErrorMsg(exErr.message)
      setPhase('error')
      return
    }

    const typedExercises = (exRows as ProgramExercise[]) ?? []
    if (typedExercises.length === 0) {
      setPhase('empty')
      return
    }

    // ดึงท่าที่บันทึกไปแล้ว "วันนี้" กลับมาทั้งหมด (เผื่อกดออกจากหน้านี้/รีเฟรชระหว่างเล่น) — ไม่กรองแค่
    // ท่าที่อยู่ในแผน เพราะท่าที่กด "เพิ่มท่า" เองระหว่างเซสชันก็ต้องรอดจากการรีเฟรชด้วยเหมือนกัน
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, exercise_name, muscle_group, rpe')
      .eq('user_id', user.id)
      .eq('type', 'strength')
      .eq('performed_at', todayStr())

    const typedWorkoutRows = (workoutRows as (LoggedWorkoutRow & { muscle_group: string | null })[]) ?? []

    // ท่าที่ log ไปแล้ววันนี้แต่ไม่ได้อยู่ในแผน = ท่าที่เคย "เพิ่มท่า" เองมาก่อน — สร้างเป็นท่า ad-hoc
    // ต่อท้ายรายการท่าตามแผน ไม่งั้นรีเฟรชแล้วท่านี้จะหายไปทั้งที่บันทึกจริงอยู่แล้ว
    const planNames = new Set(typedExercises.map((ex) => ex.exercise_name))
    const extraLogged = findExtraLoggedExercises(typedWorkoutRows, planNames)
    const adhocExercises = extraLogged.map((w, i) =>
      makeAdhocExercise({
        id: w.id,
        exerciseName: w.exercise_name,
        muscleGroup: w.muscle_group,
        position: typedExercises.length + i,
      })
    )
    const combinedExercises = [...typedExercises, ...adhocExercises]

    const workoutIds = typedWorkoutRows.map((w) => w.id)
    const { data: setRows } =
      workoutIds.length > 0
        ? await supabase
            .from('workout_sets')
            .select('workout_id, set_number, reps, weight_kg')
            .in('workout_id', workoutIds)
        : { data: [] as LoggedSetRow[] }

    // ผลงานล่าสุด "ครั้งก่อน" (ไม่ใช่วันนี้) ของแต่ละท่าในแผน — เอาไว้ตั้งค่าเริ่มต้น reps/น้ำหนัก
    // ให้ท่าที่ยังไม่ได้ log วันนี้ แทนที่จะเริ่มจาก 0/ค่าเป้าหมายเฉยๆ (เดิมมีแค่ log วันนี้เท่านั้นที่จำได้)
    const planExerciseNames = typedExercises.map((ex) => ex.exercise_name)
    const lastPerformanceByName: Record<string, LastPerformance> = {}
    if (planExerciseNames.length > 0) {
      // ดึงกว้างๆ ไม่กรองชื่อท่าด้วย .in() ตรงๆ เพราะ exercise_name ระหว่างแผน (program_exercises)
      // กับที่เคย log จริง (workouts) อาจตัวพิมพ์เล็ก/ใหญ่หรือช่องว่างหัวท้ายไม่ตรงกันเป๊ะ ทำให้ exact
      // match แบบ .eq()/.in() หลุดเงียบๆ — เทียบแบบ trim+lowercase เอาเองแทน เหมือนที่หน้า /log
      // ใช้ .ilike() กันเคสนี้อยู่แล้ว
      const { data: priorWorkouts } = await supabase
        .from('workouts')
        .select('id, exercise_name, reps, weight_kg')
        .eq('user_id', user.id)
        .eq('type', 'strength')
        .lt('performed_at', todayStr())
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false })

      const typedPriorWorkouts =
        (priorWorkouts as { id: string; exercise_name: string | null; reps: number | null; weight_kg: number | null }[]) ??
        []
      console.log('[fitlog-debug] planExerciseNames', planExerciseNames)
      console.log('[fitlog-debug] typedPriorWorkouts count', typedPriorWorkouts.length, typedPriorWorkouts.slice(0, 5))

      const normalize = (s: string) => s.trim().toLowerCase()
      const planNamesNormalized = new Set(planExerciseNames.map(normalize))

      // เก็บแค่ครั้งล่าสุดสุดต่อชื่อท่า (normalize แล้ว) เพราะ query เรียง performed_at ล่าสุดก่อนแล้ว
      const latestWorkoutByNormalizedName = new Map<string, (typeof typedPriorWorkouts)[number]>()
      typedPriorWorkouts.forEach((w) => {
        if (!w.exercise_name) return
        const key = normalize(w.exercise_name)
        if (planNamesNormalized.has(key) && !latestWorkoutByNormalizedName.has(key)) {
          latestWorkoutByNormalizedName.set(key, w)
        }
      })

      const priorWorkoutIds = Array.from(latestWorkoutByNormalizedName.values()).map((w) => w.id)
      const { data: priorSets } =
        priorWorkoutIds.length > 0
          ? await supabase
              .from('workout_sets')
              .select('workout_id, set_number, reps, weight_kg')
              .in('workout_id', priorWorkoutIds)
              .eq('set_number', 1)
          : { data: [] as LoggedSetRow[] }
      const firstSetByWorkoutId = new Map(
        ((priorSets as LoggedSetRow[]) ?? []).map((s) => [s.workout_id, s])
      )

      planExerciseNames.forEach((name) => {
        const w = latestWorkoutByNormalizedName.get(normalize(name))
        if (!w) return
        // มี workout_sets (เซ็ตแรก) ให้ใช้ก่อน — แม่นกว่า เพราะเก็บทีละเซ็ตจริง ไม่ใช่ top set เดียว
        // ถ้าเป็นแถวเก่าก่อนมี workout_sets ค่อย fallback ไปใช้ reps/weight_kg บนแถว workouts เอง
        const firstSet = firstSetByWorkoutId.get(w.id)
        if (firstSet) {
          lastPerformanceByName[name] = { reps: firstSet.reps, weightKg: firstSet.weight_kg }
        } else if (w.reps !== null && w.weight_kg !== null) {
          lastPerformanceByName[name] = { reps: w.reps, weightKg: w.weight_kg }
        }
      })
    }
    console.log('[fitlog-debug] lastPerformanceByName', lastPerformanceByName)

    const initialStates = initSessionStates(
      combinedExercises,
      typedWorkoutRows,
      (setRows as LoggedSetRow[]) ?? [],
      lastPerformanceByName
    )

    setDay(dayRow as ProgramDay)
    setExercises(combinedExercises)
    setStates(initialStates)
    setIndex(firstUnfinishedIndex(combinedExercises, initialStates))
    setPhase('active')
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (phase === 'active' && !sessionStartedRef.current) {
      sessionStartedRef.current = true
      session.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const current = exercises[index] ?? null
  const currentState = current ? states[current.id] : null
  const targetSets = current?.sets ?? 3

  function updateCurrent(patch: Partial<SessionSetState>) {
    if (!current) return
    setStates((prev) => ({ ...prev, [current.id]: { ...prev[current.id], ...patch } }))
  }

  // "เพิ่มท่า" เอง ระหว่างเซสชัน — รับได้ทั้งเลือกจากคลังท่า (ExercisePicker) และพิมพ์ชื่อเองอิสระ
  // ไม่ผูกกับ program_exercises จริง (ดู makeAdhocExercise) แต่เข้า flow เดียวกับท่าอื่นทุกอย่าง
  // ท่านี้ไม่ผ่าน initSessionStates ตอนโหลดหน้า (ซึ่งดึงผลงานล่าสุดให้ทุกท่าในแผนไปแล้ว) — ต้อง
  // ดึงผลงานล่าสุดของท่านี้เองแยกตรงนี้ ไม่งั้นท่าที่เพิ่มเองจะขึ้น 0/0 เสมอแม้เคยเล่นท่านี้มาก่อน
  async function addExercise() {
    const name = newExerciseName.trim()
    if (!name) {
      setAddExerciseError('กรุณาพิมพ์หรือเลือกชื่อท่าก่อน')
      return
    }
    setAddExerciseError(null)
    const newEx = makeAdhocExercise({
      id: crypto.randomUUID(),
      exerciseName: name,
      muscleGroup: newExerciseDef?.muscleGroup ?? null,
      position: exercises.length,
    })

    let last: LastPerformance | null = null
    const {
      data: { user },
    } = await supabase.auth.getUser()
    console.log('[fitlog-debug] addExercise looking up last performance for name=', JSON.stringify(name))
    if (user) {
      const { data: priorWorkout, error: priorWorkoutError } = await supabase
        .from('workouts')
        .select('id, reps, weight_kg')
        .eq('user_id', user.id)
        .eq('type', 'strength')
        .ilike('exercise_name', name)
        .lt('performed_at', todayStr())
        .order('performed_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      console.log('[fitlog-debug] addExercise priorWorkout=', priorWorkout, 'error=', priorWorkoutError)
      const typedPriorWorkout = priorWorkout as { id: string; reps: number | null; weight_kg: number | null } | null
      if (typedPriorWorkout) {
        const { data: firstSet, error: firstSetError } = await supabase
          .from('workout_sets')
          .select('reps, weight_kg')
          .eq('workout_id', typedPriorWorkout.id)
          .eq('set_number', 1)
          .maybeSingle()
        console.log('[fitlog-debug] addExercise firstSet=', firstSet, 'error=', firstSetError)
        const typedFirstSet = firstSet as { reps: number; weight_kg: number } | null
        if (typedFirstSet) {
          last = { reps: typedFirstSet.reps, weightKg: typedFirstSet.weight_kg }
        } else if (typedPriorWorkout.reps !== null && typedPriorWorkout.weight_kg !== null) {
          last = { reps: typedPriorWorkout.reps, weightKg: typedPriorWorkout.weight_kg }
        }
      }
    }
    console.log('[fitlog-debug] addExercise final last=', last)

    setExercises((prev) => [...prev, newEx])
    setStates((prev) => ({ ...prev, [newEx.id]: initSessionSet(newEx, last) }))
    setIndex(exercises.length)
    setNewExerciseName('')
    setNewExerciseDef(null)
    setShowAddExercise(false)
  }

  // กด "เซ็ตนี้เสร็จแล้ว" — จำ reps/น้ำหนักที่กรอกอยู่ ณ ตอนนี้เป็นเซ็ตจริงเซ็ตหนึ่ง (ไม่ใช่แค่นับจำนวน)
  // ทำให้ drop set หรือเซ็ตท้ายๆ ที่ reps ตกลง ถูกเก็บค่าจริงแยกทีละเซ็ต ไม่ถูกปัดเป็นค่าเดียวซ้ำทุกเซ็ต
  function logSet() {
    if (!current || !currentState) return
    if (!currentState.reps || currentState.reps <= 0) {
      setErrorMsg('กรุณาใส่จำนวน reps ที่ทำได้ก่อนกดเซ็ตเสร็จ')
      return
    }
    setErrorMsg(null)
    updateCurrent({
      setsLog: [...currentState.setsLog, { reps: currentState.reps, weightKg: currentState.weightKg ?? 0 }],
    })
  }

  // "ลบเซ็ตล่าสุด" — เอาเซ็ตท้ายสุดออก แล้วดึงค่า reps/น้ำหนักของเซ็ตนั้นกลับมาเป็น draft
  // ให้แก้ไขแล้วกดเสร็จใหม่ได้ทันที แทนที่จะแค่ลดตัวนับ
  function removeLastSet() {
    if (!current || !currentState || currentState.setsLog.length === 0) return
    const popped = currentState.setsLog[currentState.setsLog.length - 1]
    updateCurrent({
      setsLog: currentState.setsLog.slice(0, -1),
      reps: popped.reps,
      weightKg: popped.weightKg,
    })
  }

  async function logCurrentExercise() {
    if (!current || !currentState) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setErrorMsg('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      if (currentState.setsLog.length > 0) {
        // top set = เซ็ตที่หนักที่สุด (ถ้าเท่ากันเทียบ reps) — เก็บลง workouts.reps/weight_kg
        // เพื่อให้ยังใช้เป็นค่าเดี่ยวสำหรับ PR / ประมาณ 1RM ได้เหมือนหน้า /log
        const topSet = currentState.setsLog.reduce((best, s) => {
          if (s.weightKg > best.weightKg) return s
          if (s.weightKg === best.weightKg && s.reps > best.reps) return s
          return best
        }, currentState.setsLog[0])
        // total_volume_kg: รวมจาก reps x น้ำหนัก จริงทีละเซ็ต (ไม่ใช่ setsDone * ค่าเดียวเหมือนเดิม)
        const totalVolumeKg = currentState.setsLog.reduce((sum, s) => sum + s.reps * s.weightKg, 0)
        const payload = {
          user_id: user.id,
          type: 'strength' as const,
          performed_at: todayStr(),
          exercise_name: current.exercise_name,
          muscle_group: current.muscle_group,
          sets: currentState.setsLog.length,
          reps: topSet.reps,
          weight_kg: topSet.weightKg,
          rpe: currentState.rpe,
          notes: current.rationale,
          total_volume_kg: totalVolumeKg,
        }

        // ถ้าเคยบันทึกท่านี้ไปแล้วในเซสชันนี้ (เช่น กดย้อนกลับมาแก้ผ่าน progress chips ด้านบน)
        // ต้องอัปเดตแถวเดิมแทนการ insert ใหม่ ไม่งั้นจะได้รายการซ้ำซ้อนในประวัติ/สถิติ
        const { data: upserted, error: wErr } = currentState.workoutId
          ? await supabase.from('workouts').update(payload).eq('id', currentState.workoutId).select('id').single()
          : await supabase.from('workouts').insert(payload).select('id').single()

        if (wErr) {
          setErrorMsg(`บันทึกไม่สำเร็จ: ${wErr.message}`)
          return
        }

        const workoutId = (upserted as { id: string } | null)?.id ?? currentState.workoutId

        if (workoutId) {
          // แก้ไขซ้ำ (กดย้อนมาแก้ผ่าน progress chips) — ลบเซ็ตเก่าทั้งหมดแล้วเขียนชุดใหม่ทับ
          // ง่ายกว่า diff ทีละเซ็ต และจำนวน/ลำดับเซ็ตอาจเปลี่ยนไปจากเดิม
          if (currentState.workoutId) {
            await supabase.from('workout_sets').delete().eq('workout_id', workoutId)
          }
          const setsPayload = currentState.setsLog.map((s, i) => ({
            workout_id: workoutId,
            user_id: user.id,
            set_number: i + 1,
            reps: s.reps,
            weight_kg: s.weightKg,
            completed: true,
          }))
          const { error: setsError } = await supabase.from('workout_sets').insert(setsPayload)
          if (setsError) {
            // แถวสรุป (workouts) บันทึกสำเร็จแล้ว แค่รายละเอียดทีละเซ็ตไม่ครบ — ตัวเลขรวมยังถูกต้อง
            setErrorMsg('บันทึกสำเร็จ แต่รายละเอียดทีละเซ็ตบันทึกไม่ครบ')
          }
        }

        // program_completions ผูก FK กับ program_exercises เท่านั้น — ท่าที่ผู้ใช้กด "เพิ่มท่า" เองระหว่าง
        // เซสชัน (ไม่ได้อยู่ในแผน) จึงต้องข้ามขั้นตอนนี้ไป ไม่งั้น insert จะพังเพราะไม่มีแถวจริงให้ผูก
        if (!isAdhocExercise(current)) {
          await supabase
            .from('program_completions')
            .upsert(
              { user_id: user.id, program_exercise_id: current.id, completed_at: todayStr() },
              { onConflict: 'user_id,program_exercise_id,completed_at' }
            )
        }

        // ใช้ states ที่เพิ่งอัปเดตนี้ (ไม่ใช่ตัวแปร states เดิมจาก closure ที่ยังไม่ทันอัปเดต)
        // ไปคำนวณท่าถัดไปทันที กัน goNext เห็นค่า logged เก่าที่ยังเป็น false อยู่
        const merged = {
          ...states,
          [current.id]: { ...currentState, logged: true, workoutId },
        }
        setStates(merged)
        showToast('บันทึกแล้ว ✓')
        goNext(merged)
        return
      }

      goNext()
    } catch (err) {
      setErrorMsg(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  // กด "ข้ามท่านี้" — ทำเครื่องหมายว่าท่านี้ถูกดูรอบนี้แล้ว (skipped) แยกจาก logged=false เฉยๆ
  // ที่แปลว่า "ยังไม่ถึงคิว" เพื่อไม่ให้ nextUnvisitedIndex วนกลับมาที่ท่านี้ซ้ำ
  function skipCurrent() {
    if (!current) return
    const merged = { ...states, [current.id]: { ...states[current.id], skipped: true } }
    setStates(merged)
    goNext(merged)
  }

  // หาท่าถัดไปที่ยังไม่ถูกบันทึก/ข้าม โดยวนรอบทั้ง array (ไม่ใช่แค่ +1 ตามตำแหน่งเดิม)
  // เพราะผู้ใช้อาจกด progress chips ข้ามไปทำท่าท้ายๆ ก่อน — ตำแหน่งใน array จึงไม่ได้แปลว่า
  // เป็นท่าสุดท้ายที่เหลือจริงๆ เซสชันจะจบก็ต่อเมื่อทุกท่าถูกบันทึกหรือข้ามไปหมดแล้วเท่านั้น
  function goNext(latestStates: Record<string, SessionSetState> = states) {
    const next = nextUnvisitedIndex(exercises, latestStates, index)
    if (next === null) {
      session.pause()
      setPhase('done')
    } else {
      setIndex(next)
    }
  }

  const loadSummaryExtras = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const loggedList = exercises
        .map((ex) => ({ ex, state: states[ex.id] }))
        .filter((e) => e.state?.logged)

      const durationMin = Math.round(session.elapsedMs / 60000)

      const [{ data: latestMetric }, { data: priorRows }, { data: recentMuscleRows }] = await Promise.all([
        supabase.from('body_metrics').select('weight_kg').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
        loggedList.length > 0
          ? supabase
              .from('workouts')
              .select('exercise_name, weight_kg')
              .eq('type', 'strength')
              .lt('performed_at', todayStr())
              .in(
                'exercise_name',
                loggedList.map((e) => e.ex.exercise_name)
              )
          : Promise.resolve({ data: [] as { exercise_name: string; weight_kg: number | null }[] }),
        supabase
          .from('workouts')
          .select('muscle_group, performed_at')
          .eq('type', 'strength')
          .lt('performed_at', todayStr())
          .order('performed_at', { ascending: false })
          .limit(500),
      ])

      const bodyWeightKg = (latestMetric as { weight_kg: number | null } | null)?.weight_kg ?? null
      const calories = estimateCaloriesToday([] as Workout[], durationMin, bodyWeightKg)

      const priorBest: Record<string, number> = {}
      ;((priorRows as { exercise_name: string; weight_kg: number | null }[]) ?? []).forEach((r) => {
        if (r.weight_kg === null) return
        priorBest[r.exercise_name] = Math.max(priorBest[r.exercise_name] ?? 0, r.weight_kg)
      })
      const prs: PRHit[] = loggedList
        .filter((e) => e.state.weightKg !== null && priorBest[e.ex.exercise_name] !== undefined)
        .filter((e) => (e.state.weightKg as number) > priorBest[e.ex.exercise_name])
        .map((e) => ({
          exerciseName: e.ex.exercise_name,
          weightKg: e.state.weightKg as number,
          deltaKg: Math.round(((e.state.weightKg as number) - priorBest[e.ex.exercise_name]) * 10) / 10,
        }))
        .sort((a, b) => b.deltaKg - a.deltaKg)

      const trainedToday = aggregateMuscleLoads(
        loggedList.map((e) => ({ muscleGroup: e.ex.muscle_group, sets: e.state.setsLog.length, rpe: e.state.rpe }))
      )
      const priorLastTrainedDate: Record<string, string | null> = {}
      const muscleRows = (recentMuscleRows as { muscle_group: string | null; performed_at: string }[]) ?? []
      RECOVERY_MUSCLES.forEach((mg) => {
        if (trainedToday[mg]) return
        priorLastTrainedDate[mg] = muscleRows.find((r) => r.muscle_group === mg)?.performed_at ?? null
      })
      const recovery = computeSessionMuscleRecovery(trainedToday, priorLastTrainedDate)

      setSummaryExtras({ calories, prs, recovery })
    } catch {
      // สรุปเสริมพวกนี้เป็นของแถม — ถ้าโหลดไม่สำเร็จก็ยังโชว์ตัวเลขหลัก (เวลา/วอลุ่ม/เซ็ต) ได้ตามปกติ
    } finally {
      setSummaryLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, exercises, states, session.elapsedMs])

  useEffect(() => {
    if (phase === 'done' && !summaryExtras && !summaryLoading) {
      loadSummaryExtras()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function shareSession() {
    const summary = computeSessionSummary(
      Object.values(states)
        .filter((s) => s.logged)
        .map((s) => ({ setsLog: s.setsLog }))
    )
    const skipped = getSkippedExercises(exercises, states)
    const lines = [
      `🏋️ ${day?.title ?? 'Workout'} เสร็จแล้ว!`,
      `⏱ ${formatClock(session.elapsedMs)} · ${summary.exerciseCount}/${exercises.length} ท่า · ${summary.totalSets} เซ็ต`,
    ]
    if (summary.totalVolumeKg > 0) lines.push(`💪 วอลุ่มรวม ${Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString()} ${unit}`)
    if (skipped.length > 0) lines.push(`⏭️ ข้ามไป: ${skipped.map((s) => s.exerciseName).join(', ')}`)
    if (summaryExtras?.prs.length) {
      lines.push(`🏆 PR ใหม่: ${summaryExtras.prs[0].exerciseName} +${format(summaryExtras.prs[0].deltaKg)}`)
    }
    const text = lines.join('\n')

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        // ผู้ใช้กดยกเลิก share sheet — ไม่ต้องแจ้งอะไร
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      setShareMsg('คัดลอกสรุปแล้ว')
      setTimeout(() => setShareMsg(null), 2000)
    }
  }

  if (phase === 'loading') {
    return <LoadingState message="กำลังเตรียมเซสชัน..." />
  }

  if (phase === 'error') {
    return <ErrorState title="เปิดเซสชันไม่สำเร็จ" message={errorMsg ?? undefined} onRetry={load} />
  }

  if (phase === 'empty') {
    return (
      <div className="rounded-lg bg-surface border border-line shadow-elevated border-dashed px-4 py-10 text-center space-y-3">
        <p className="text-sm text-muted">ยังไม่มีโปรแกรมตั้งไว้สำหรับวันนี้ เลยเริ่มเซสชันไม่ได้</p>
        <div className="flex gap-2 justify-center">
          <a href="/program" className="text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 inline-block">
            ไปตั้งโปรแกรม
          </a>
          <a href="/log" className="text-xs font-display tracked uppercase text-ink border border-line rounded-lg px-4 py-2 inline-block">
            บันทึกอิสระแทน
          </a>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const summary = computeSessionSummary(
      Object.values(states).filter((s) => s.logged).map((s) => ({ setsLog: s.setsLog }))
    )
    const skipped = getSkippedExercises(exercises, states)
    return (
      <div className="space-y-5 text-center py-4">
        <p className="text-4xl">🎉</p>
        <div>
          <p className="font-display text-2xl tracked uppercase text-ink">เซสชันเสร็จแล้ว</p>
          <p className="text-xs text-muted mt-1">{day?.title}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryCell label="เวลาที่ใช้" value={formatClock(session.elapsedMs)} />
          <SummaryCell label="ท่าที่ทำ" value={`${summary.exerciseCount}/${exercises.length}`} />
          <SummaryCell label="เซ็ตรวม" value={String(summary.totalSets)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SummaryCell
            label={`วอลุ่มรวม (${unit})`}
            value={summary.totalVolumeKg > 0 ? Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString() : '–'}
          />
          <SummaryCell
            label="แคลอรี่ (ประมาณ)"
            value={summaryLoading ? '…' : summaryExtras ? `${summaryExtras.calories} kcal` : '–'}
          />
        </div>

        {skipped.length > 0 && (
          <div className="rounded-lg bg-surface2 border border-line px-4 py-3 text-left space-y-1">
            <p className="text-[10px] tracked uppercase text-muted">⏭️ ข้ามไป {skipped.length} ท่า</p>
            <p className="text-xs text-ink">{skipped.map((s) => s.exerciseName).join(', ')}</p>
            <p className="text-[11px] text-muted">ลองแทรกในเซสชันหน้าดูนะ</p>
          </div>
        )}

        {summaryExtras && summaryExtras.prs.length > 0 && (
          <div className="rounded-lg bg-surface2 border border-amber/30 px-4 py-3 text-left space-y-1">
            <p className="text-[10px] tracked uppercase text-amber">🏆 สถิติใหม่</p>
            {summaryExtras.prs.slice(0, 2).map((pr) => (
              <p key={pr.exerciseName} className="text-xs text-ink">
                {pr.exerciseName} <span className="text-amber font-mono">+{format(pr.deltaKg)}</span>
              </p>
            ))}
            {summaryExtras.prs.length > 2 && (
              <p className="text-[11px] text-muted">และอีก {summaryExtras.prs.length - 2} ท่า</p>
            )}
          </div>
        )}

        {summaryLoading && !summaryExtras && (
          <p className="text-xs text-muted">กำลังประเมินความพร้อมสำหรับครั้งถัดไป...</p>
        )}

        {summaryExtras && (
          <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 text-left space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] tracked uppercase text-muted">ความพร้อมครั้งถัดไป</p>
              <p className={`font-mono text-lg ${recoveryTextColor(summaryExtras.recovery.overall)}`}>
                {tierEmoji(summaryExtras.recovery.overall)} {summaryExtras.recovery.overall}%
              </p>
            </div>
            <div className="space-y-1.5">
              {summaryExtras.recovery.byMuscle.map((m) => (
                <div key={m.muscleGroup} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted w-16 shrink-0">{m.muscleGroup}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className={`h-full rounded-full ${recoveryBarColor(m.tier)}`} style={{ width: `${m.pct}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-ink w-9 text-right">{m.pct}%</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted/70">
              ประเมินจากวอลุ่ม/ความหนักที่เพิ่งฝึกและวันที่ฝึกล่าสุดของแต่ละกลุ่มกล้ามเนื้อ (ยังไม่รวมข้อมูลการนอน)
            </p>
          </div>
        )}

        {shareMsg && <p className="text-xs text-amber">{shareMsg}</p>}
        {errorMsg && <p className="text-xs text-rusttext">{errorMsg}</p>}

        <div className="flex gap-2 pt-2">
          <a
            href="/dashboard"
            className="flex-1 rounded-lg bg-amber text-bg font-display tracked uppercase py-3 text-sm active:scale-[0.99] transition"
          >
            กลับหน้าแรก
          </a>
          <button
            type="button"
            onClick={shareSession}
            className="flex-1 rounded-lg border border-line text-ink font-display tracked uppercase py-3 text-sm active:scale-[0.99] transition"
          >
            แชร์
          </button>
        </div>
        <a href="/history" className="block text-[11px] text-muted hover:text-amber transition">
          ดูประวัติทั้งหมด
        </a>
      </div>
    )
  }

  if (!current || !currentState) return null

  const mg = (current.muscle_group as MuscleGroup) ?? null
  const mgColor = mg ? MUSCLE_GROUP_COLORS[mg] : undefined
  const setsRemaining = Math.max(0, targetSets - currentState.setsLog.length)

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracked uppercase text-muted">
          ท่าที่ <span className="text-ink font-mono">{index + 1}</span>/{exercises.length}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-mono text-muted tabular">{formatClock(session.elapsedMs)}</p>
          <button
            type="button"
            onClick={() => {
              session.pause()
              setPhase('done')
            }}
            className="text-[11px] text-muted hover:text-rusttext transition"
          >
            จบก่อน
          </button>
        </div>
      </div>

      {/* progress chips */}
      <div className="flex gap-1">
        {exercises.map((ex, i) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-1.5 flex-1 rounded-full transition ${
              i === index ? 'bg-amber' : states[ex.id]?.logged ? 'bg-steel' : 'bg-surface2'
            }`}
            aria-label={ex.exercise_name}
          />
        ))}
      </div>

      {showAddExercise ? (
        <div className="rounded-lg bg-surface border border-line shadow-elevated px-4 py-3.5 space-y-2.5">
          <p className="text-[10px] tracked uppercase text-muted">เพิ่มท่านอกแผน</p>
          <ExercisePicker
            value={newExerciseName}
            onChange={(name) => {
              setNewExerciseName(name)
              setNewExerciseDef(null)
            }}
            onSelect={(ex) => setNewExerciseDef(ex)}
            placeholder="พิมพ์ชื่อท่า หรือเลือกจากคลัง เช่น bench หรือ สควอท"
          />
          {addExerciseError && <p className="text-xs text-rusttext">{addExerciseError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddExercise(false)
                setNewExerciseName('')
                setNewExerciseDef(null)
                setAddExerciseError(null)
              }}
              className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-2.5 text-xs transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={addExercise}
              className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-2.5 text-xs active:scale-[0.99] transition"
            >
              เพิ่มท่านี้
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddExercise(true)}
          className="w-full rounded-lg border border-dashed border-line text-muted hover:text-amber hover:border-amber/50 font-display tracked uppercase py-2.5 text-xs transition"
        >
          + เพิ่มท่า
        </button>
      )}

      <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
        <div className="px-4 py-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            {mg && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mgColor }} />}
            <p className="font-display text-lg tracked uppercase text-ink truncate">{current.exercise_name}</p>
          </div>
          <p className="text-[11px] text-muted mt-1">
            เป้าหมาย {targetSets} เซ็ต × {current.target_reps ?? '–'} reps
            {current.target_rir && ` · RIR ${current.target_rir}`}
            {current.rest && ` · พัก ${current.rest}`}
          </p>
          {current.rationale && <p className="text-[11px] text-muted/70 mt-1 italic">{current.rationale}</p>}
        </div>

        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between bg-surface2 rounded-lg px-4 py-3">
            <div>
              <p className="text-[10px] tracked uppercase text-muted">เซ็ตที่ทำแล้ว</p>
              <p className="font-mono text-2xl text-ink mt-0.5">
                {currentState.setsLog.length}
                <span className="text-sm text-muted">/{targetSets}</span>
              </p>
            </div>
            <RestTimerButton
              key={current.id}
              restSeconds={parseRestSeconds(current.rest)}
              onSetLogged={currentState.setsLog.length}
            />
          </div>

          {currentState.setsLog.length > 0 && (
            <ul className="space-y-1">
              {currentState.setsLog.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-[11px] font-mono text-muted bg-surface2 rounded px-2.5 py-1"
                >
                  <span>เซ็ต {i + 1}</span>
                  <span className="text-ink">
                    {format(s.weightKg)} × {s.reps} reps
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <WeightUnitToggle />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <NumberStepper
              label="Reps ที่ทำได้"
              value={currentState.reps ?? 0}
              onChange={(v) => updateCurrent({ reps: v })}
              step={1}
              min={0}
            />
            <NumberStepper
              label="น้ำหนัก"
              unit={unit}
              value={toDisplay(currentState.weightKg ?? 0)}
              onChange={(v) => updateCurrent({ weightKg: toKg(v) })}
              step={unit === 'lb' ? 5 : 2.5}
              min={0}
            />
          </div>

          {/* Drop Set — ลดน้ำหนักด่วนสำหรับเซ็ตถัดไปโดยไม่ต้องกด stepper ทีละครั้ง ปัดเข้า step
              เดียวกับ NumberStepper น้ำหนักด้านบน (2.5kg / 5lb) กันได้ตัวเลขแปลกๆ เช่น 63.75kg
              ไม่ลดต่ำกว่า 0 — ใช้ currentState.weightKg (หน่วย kg เสมอ) เป็นฐานคำนวณเพื่อไม่ให้
              ปัดเศษผิดพลาดจากการแปลงหน่วยไปมาซ้ำๆ ระหว่างเซ็ต */}
          {(currentState.weightKg ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracked uppercase text-muted shrink-0">Drop Set</span>
              {[10, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => updateCurrent({ weightKg: dropSetWeightKg(currentState.weightKg ?? 0, pct, unit) })}
                  className="flex-1 rounded-lg border border-line text-muted hover:text-amber hover:border-amber/50 transition py-1.5 text-[11px] font-display tracked uppercase active:scale-[0.98]"
                >
                  −{pct}%
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={logSet}
            className="w-full rounded-lg bg-steel text-bg font-display tracked uppercase py-3.5 text-sm active:scale-[0.98] transition"
          >
            ✅ เซ็ตนี้เสร็จแล้ว{setsRemaining > 0 ? ` (เหลืออีก ${setsRemaining})` : ''}
          </button>

          {currentState.setsLog.length > 0 && (
            <button
              type="button"
              onClick={removeLastSet}
              className="w-full text-[11px] text-muted hover:text-amber transition"
            >
              แก้ไข — ลบเซ็ตล่าสุด
            </button>
          )}
        </div>
      </div>

      {errorMsg && <p className="text-xs text-rusttext text-center">{errorMsg}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={skipCurrent}
          disabled={saving}
          className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-3 text-xs disabled:opacity-50 transition"
        >
          ข้ามท่านี้
        </button>
        <button
          type="button"
          onClick={logCurrentExercise}
          disabled={saving || currentState.setsLog.length === 0}
          className="flex-[2] rounded-lg bg-amber text-bg font-display tracked uppercase py-3 text-xs disabled:opacity-40 active:scale-[0.99] transition"
        >
          {saving
            ? 'กำลังบันทึก...'
            : index >= exercises.length - 1
              ? 'บันทึก & จบเซสชัน'
              : 'บันทึก & ท่าถัดไป ▶'}
        </button>
      </div>
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg py-3">
      <p className="font-mono text-lg text-ink tabular">{value}</p>
      <p className="text-[9px] tracked uppercase text-muted mt-0.5">{label}</p>
    </div>
  )
}

function tierEmoji(pct: number) {
  const tier = tierForPct(pct)
  if (tier === 'green') return '🟢'
  if (tier === 'yellow') return '🟡'
  if (tier === 'orange') return '🟠'
  return '🔴'
}

function recoveryTextColor(pct: number) {
  const tier = tierForPct(pct)
  if (tier === 'green') return 'text-steel'
  if (tier === 'yellow') return 'text-amber'
  return 'text-rusttext'
}

function recoveryBarColor(tier: 'green' | 'yellow' | 'orange' | 'red') {
  if (tier === 'green') return 'bg-steel'
  if (tier === 'yellow') return 'bg-amber'
  return 'bg-rust'
}

// ตัวจับเวลาพักแบบย่อ ฝังอยู่ในการ์ดของท่าปัจจุบัน — เริ่มนับอัตโนมัติทุกครั้งที่กด
// "เซ็ตนี้เสร็จแล้ว" (ติดตามผ่าน onSetLogged ที่เปลี่ยนค่าทุกครั้งที่เซ็ตเพิ่มขึ้น)
function RestTimerButton({ restSeconds, onSetLogged }: { restSeconds: number; onSetLogged: number }) {
  const { enabled: voiceEnabled } = useVoiceEnabled()
  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const finishedRef = useRef(false)
  const tickedRef = useRef(-1)
  const prevCountRef = useRef(onSetLogged)

  useWakeLock(running)

  const totalMs = restSeconds * 1000
  const remainingMs = Math.max(0, totalMs - elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)

  // เซ็ตเพิ่มขึ้น (กดปุ่ม "เซ็ตนี้เสร็จแล้ว") -> เริ่มพักอัตโนมัติ
  useEffect(() => {
    if (onSetLogged > prevCountRef.current) {
      prevCountRef.current = onSetLogged
      finishedRef.current = false
      tickedRef.current = -1
      reset()
      start()
    } else {
      prevCountRef.current = onSetLogged
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSetLogged])

  useEffect(() => {
    if (!running) return
    if (remainingMs <= 0 && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak('พักครบแล้ว ไปต่อ')
      pause()
      return
    }
    if (remainingSec <= 3 && remainingSec >= 1 && tickedRef.current !== remainingSec) {
      tickedRef.current = remainingSec
      beepTick()
    }
  }, [remainingMs, remainingSec, running, pause, voiceEnabled])

  if (!running && elapsedMs === 0) {
    return <p className="text-[10px] text-muted text-right">พัก {restSeconds}s หลังกดเซ็ต</p>
  }

  const done = !running && finishedRef.current

  return (
    <div className="text-right">
      <p className={`font-mono text-2xl tabular ${done ? 'text-amber' : 'text-steel'}`}>{formatClock(remainingMs)}</p>
      <button
        type="button"
        onClick={() => {
          finishedRef.current = true
          pause()
        }}
        className="text-[10px] text-muted hover:text-amber transition"
      >
        {done ? 'พักครบแล้ว' : 'ข้ามพัก'}
      </button>
    </div>
  )
}
