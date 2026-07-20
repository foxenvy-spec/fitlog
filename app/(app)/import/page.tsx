'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Workout, WorkoutType } from '@/lib/types'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/muscle-groups'
import { WEEKDAYS, defaultWeekdayForIndex } from '@/lib/weekdays'
import { getExerciseLibrary } from '@/lib/exerciseLibrary'
import {
  parseWorkoutExcel,
  type ParsedWorkbook,
  type ParsedDay,
  type ParsedExerciseRow,
  type ParsedBodyLogRow,
} from '@/lib/importWorkoutExcel'

type Mode = 'log' | 'program'

function todayStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

export default function ImportPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('log')
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null)
  const [dayDates, setDayDates] = useState<Record<string, string>>({})
  const [dayWeekdays, setDayWeekdays] = useState<Record<string, number>>({})
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ workouts: number; bodyMetrics: number; programDays: number } | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParsing(true)
    setError(null)
    setResult(null)
    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      // โหลด Exercise Library ก่อน parse เพื่อให้จับคู่ชื่อท่ากับกลุ่มกล้ามเนื้อได้แม่นยำ
      // (ถ้าโหลดไม่สำเร็จ ยังพอ parse ต่อได้ แค่ fallback ไปเดากลุ่มกล้ามเนื้อจากชื่อวันแทนทุกท่า)
      let exercises: Awaited<ReturnType<typeof getExerciseLibrary>> = []
      try {
        exercises = await getExerciseLibrary()
      } catch (libErr) {
        console.error('โหลด Exercise Library ไม่สำเร็จ ระหว่าง import', libErr)
      }
      const parsedResult = parseWorkoutExcel(buffer, exercises)
      setParsed(parsedResult)

      const dates: Record<string, string> = {}
      const weekdays: Record<string, number> = {}
      parsedResult.days.forEach((day, i) => {
        dates[day.sheetName] = todayStr(i)
        weekdays[day.sheetName] = defaultWeekdayForIndex(i)
      })
      setDayDates(dates)
      setDayWeekdays(weekdays)
    } catch (err) {
      setError('ไม่สามารถอ่านไฟล์นี้ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง')
      setParsed(null)
    } finally {
      setParsing(false)
    }
  }

  function updateExercise(sheetName: string, id: string, patch: Partial<ParsedExerciseRow>) {
    setParsed((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((day) =>
          day.sheetName !== sheetName
            ? day
            : {
                ...day,
                exercises: day.exercises.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex)),
              }
        ),
      }
    })
  }

  function updateBodyLogRow(id: string, patch: Partial<ParsedBodyLogRow>) {
    setParsed((prev) => {
      if (!prev) return prev
      return { ...prev, bodyLog: prev.bodyLog.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
    })
  }

  function toggleDayAll(day: ParsedDay, include: boolean) {
    setParsed((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.sheetName !== day.sheetName
            ? d
            : { ...d, exercises: d.exercises.map((ex) => ({ ...ex, include })) }
        ),
      }
    })
  }

  async function handleImport() {
    if (!parsed) return
    setError(null)
    setSaving(true)

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()

      if (userErr || !user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      let workoutCount = 0
      let bodyCount = 0
      let programDayCount = 0

      if (mode === 'log') {
        const workoutPayload: (Partial<Workout> & { user_id: string; type: WorkoutType; performed_at: string })[] = []
        parsed.days.forEach((day) => {
          const date = dayDates[day.sheetName] ?? todayStr()
          day.exercises
            .filter((ex) => ex.include)
            .forEach((ex) => {
              workoutPayload.push({
                user_id: user.id,
                type: 'strength',
                performed_at: date,
                exercise_name: ex.name,
                muscle_group: ex.muscleGroup,
                secondary_muscles: ex.secondaryMuscles,
                exercise_library_id: ex.matchedExerciseId,
                sets: ex.sets,
                reps: ex.reps,
                weight_kg: ex.weight_kg,
                rpe: ex.rpe,
                notes: ex.notes,
              })
            })
        })

        if (workoutPayload.length > 0) {
          const { error: wErr, data: wData } = await supabase.from('workouts').insert(workoutPayload).select('id')
          if (wErr) {
            setError(`นำเข้ารายการออกกำลังกายไม่สำเร็จ: ${wErr.message}`)
            return
          }
          workoutCount = wData?.length ?? workoutPayload.length
        }
      } else {
        // mode === 'program' — เขียนเข้า program_days / program_exercises แทน
        for (const day of parsed.days) {
          const included = day.exercises.filter((ex) => ex.include)
          if (included.length === 0) continue

          const dayOfWeek = dayWeekdays[day.sheetName] ?? 1

          const { data: dayRow, error: dayErr } = await supabase
            .from('program_days')
            .upsert(
              { user_id: user.id, day_of_week: dayOfWeek, title: day.title },
              { onConflict: 'user_id,day_of_week' }
            )
            .select('id')
            .single()

          if (dayErr || !dayRow) {
            setError(`บันทึกโปรแกรมวัน "${day.title}" ไม่สำเร็จ: ${dayErr?.message ?? 'ไม่ทราบสาเหตุ'}`)
            return
          }

          const { error: delErr } = await supabase.from('program_exercises').delete().eq('program_day_id', dayRow.id)
          if (delErr) {
            setError(`ล้างท่าเดิมของวัน "${day.title}" ไม่สำเร็จ: ${delErr.message}`)
            return
          }

          const exercisePayload = included.map((ex, i) => ({
            program_day_id: dayRow.id,
            user_id: user.id,
            position: i,
            exercise_name: ex.name,
            muscle_group: ex.muscleGroup,
            secondary_muscles: ex.secondaryMuscles,
            exercise_library_id: ex.matchedExerciseId,
            sets: ex.sets,
            target_reps: ex.targetRepsRaw ?? (ex.reps !== null ? String(ex.reps) : null),
            target_rir: ex.targetRirRaw ?? (ex.rir !== null ? String(ex.rir) : null),
            rest: ex.restRaw,
            rationale: ex.rationale,
            default_weight_kg: ex.weight_kg,
            notes: ex.notes,
          }))

          const { error: exErr } = await supabase.from('program_exercises').insert(exercisePayload)
          if (exErr) {
            setError(`บันทึกท่าของวัน "${day.title}" ไม่สำเร็จ: ${exErr.message}`)
            return
          }

          programDayCount++
        }
      }

      const bodyMetricPayload = parsed.bodyLog
        .filter((r) => r.include && r.date)
        .map((r) => ({
          user_id: user.id,
          measured_at: r.date as string,
          weight_kg: r.weight_kg,
          waist_cm: r.waist_cm,
          chest_cm: r.chest_cm,
          notes: r.notes,
        }))

      if (bodyMetricPayload.length > 0) {
        const { error: bErr, data: bData } = await supabase
          .from('body_metrics')
          .insert(bodyMetricPayload)
          .select('id')
        if (bErr) {
          setError(`นำเข้าข้อมูลร่างกายไม่สำเร็จ: ${bErr.message}`)
          return
        }
        bodyCount = bData?.length ?? bodyMetricPayload.length
      }

      setResult({ workouts: workoutCount, bodyMetrics: bodyCount, programDays: programDayCount })
    } catch (err) {
      setError(`เกิดข้อผิดพลาดที่ไม่คาดคิด: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setParsed(null)
    setResult(null)
    setError(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">นำเข้าจาก Excel</h1>
        <p className="text-sm text-muted mt-1">
          อัปโหลดตารางโปรแกรมฝึก (.xlsx) เพื่อดึงท่าออกกำลังกายเข้ามาที่แอปอัตโนมัติ
        </p>
      </div>

      <div>
        <p className="text-xs tracked uppercase text-muted mb-1.5">นำเข้าเป็น</p>
        <div className="flex rounded-full bg-surface p-1 border border-line">
          <button
            type="button"
            onClick={() => setMode('log')}
            className={`flex-1 py-2 rounded-full text-xs font-display tracked uppercase transition ${
              mode === 'log' ? 'bg-steel text-bg' : 'text-muted'
            }`}
          >
            ประวัติย้อนหลัง
          </button>
          <button
            type="button"
            onClick={() => setMode('program')}
            className={`flex-1 py-2 rounded-full text-xs font-display tracked uppercase transition ${
              mode === 'program' ? 'bg-amber text-bg' : 'text-muted'
            }`}
          >
            โปรแกรมประจำสัปดาห์
          </button>
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          {mode === 'log'
            ? 'บันทึกเป็นรายการที่ "ทำไปแล้ว" ในวันที่ที่เลือก จะไปโผล่ที่หน้าประวัติทันที'
            : 'ตั้งเป็นแผนประจำวันในสัปดาห์ ไว้ดูซ้ำได้ทุกสัปดาห์ที่หน้า "โปรแกรม" — ยังไม่ถูกบันทึกเป็นประวัติจนกว่าจะกดทำจริง'}
        </p>
      </div>

      {!parsed && (
        <div className="rounded-lg bg-surface border border-line border-dashed px-4 py-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
            id="excel-upload"
          />
          <label
            htmlFor="excel-upload"
            className="inline-block cursor-pointer rounded-lg bg-steel text-bg font-display tracked uppercase px-5 py-3 text-sm active:scale-[0.99] transition"
          >
            {parsing ? 'กำลังอ่านไฟล์...' : 'เลือกไฟล์ .xlsx'}
          </label>
          <p className="text-xs text-muted mt-3">รองรับไฟล์ที่มีตารางท่าออกกำลังกายแบบ Sets / Reps / RIR ต่อวัน</p>
        </div>
      )}

      {error && <p className="text-sm text-rusttext">{error}</p>}

      {parsed && parsed.warnings.length > 0 && (
        <div className="rounded-lg bg-surface2 border border-amber/30 px-4 py-3 space-y-1">
          {parsed.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-surface border border-line px-4 py-4 text-center space-y-2">
          <p className="text-sm text-ink font-display tracked uppercase">นำเข้าสำเร็จ ✓</p>
          <p className="text-xs text-muted">
            {result.workouts > 0 && `บันทึกท่าออกกำลังกาย ${result.workouts} รายการ`}
            {result.programDays > 0 && `ตั้งโปรแกรม ${result.programDays} วัน`}
            {result.bodyMetrics > 0 && ` · ข้อมูลร่างกาย ${result.bodyMetrics} รายการ`}
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <a
              href={mode === 'log' ? '/history' : '/program'}
              className="text-xs tracked uppercase text-amber hover:underline"
            >
              {mode === 'log' ? 'ดูประวัติ →' : 'ดูโปรแกรม →'}
            </a>
            <button onClick={reset} className="text-xs tracked uppercase text-muted hover:text-ink">
              นำเข้าไฟล์อื่น
            </button>
          </div>
        </div>
      )}

      {parsed && !result && (
        <>
          <p className="text-xs text-muted font-mono truncate">{fileName}</p>

          {parsed.days.length === 0 && parsed.bodyLog.length === 0 && (
            <p className="text-sm text-muted bg-surface border border-line rounded-lg px-4 py-6 text-center">
              ไม่พบข้อมูลที่รองรับในไฟล์นี้
            </p>
          )}

          {parsed.days.map((day) => (
            <DayCard
              key={day.sheetName}
              day={day}
              mode={mode}
              date={dayDates[day.sheetName] ?? todayStr()}
              onDateChange={(v) => setDayDates((prev) => ({ ...prev, [day.sheetName]: v }))}
              weekday={dayWeekdays[day.sheetName] ?? 1}
              onWeekdayChange={(v) => setDayWeekdays((prev) => ({ ...prev, [day.sheetName]: v }))}
              onToggleAll={(include) => toggleDayAll(day, include)}
              onUpdateExercise={(id, patch) => updateExercise(day.sheetName, id, patch)}
            />
          ))}

          {parsed.bodyLog.length > 0 && (
            <BodyLogCard bodyLog={parsed.bodyLog} onUpdate={updateBodyLogRow} />
          )}

          {(parsed.days.length > 0 || parsed.bodyLog.length > 0) && (
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 rounded-lg border border-line text-muted font-display tracked uppercase py-3 text-sm hover:text-ink transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleImport}
                disabled={saving}
                className="flex-[2] rounded-lg bg-steel text-bg font-display tracked uppercase py-3 text-sm active:scale-[0.99] disabled:opacity-50 transition"
              >
                {saving ? 'กำลังนำเข้า...' : 'นำเข้าข้อมูล'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DayCard({
  day,
  mode,
  date,
  onDateChange,
  weekday,
  onWeekdayChange,
  onToggleAll,
  onUpdateExercise,
}: {
  day: ParsedDay
  mode: Mode
  date: string
  onDateChange: (v: string) => void
  weekday: number
  onWeekdayChange: (v: number) => void
  onToggleAll: (include: boolean) => void
  onUpdateExercise: (id: string, patch: Partial<ParsedExerciseRow>) => void
}) {
  const includedCount = day.exercises.filter((e) => e.include).length

  return (
    <div className="rounded-lg bg-surface border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-ink font-display tracked uppercase truncate">{day.title}</p>
          <p className="text-[11px] text-muted">
            {includedCount}/{day.exercises.length} ท่าที่จะนำเข้า
          </p>
        </div>
        {mode === 'log' ? (
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-surface2 text-ink text-xs font-mono rounded px-2 py-1.5 border border-line outline-none focus:border-amber shrink-0"
          />
        ) : (
          <select
            value={weekday}
            onChange={(e) => onWeekdayChange(Number(e.target.value))}
            className="bg-surface2 text-ink text-xs rounded px-2 py-1.5 border border-line outline-none focus:border-amber shrink-0"
          >
            {WEEKDAYS.map((w, i) => (
              <option key={i} value={i}>
                วัน{w}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="px-4 pt-2 pb-1 flex gap-3">
        <button
          onClick={() => onToggleAll(true)}
          className="text-[11px] tracked uppercase text-muted hover:text-amber"
        >
          เลือกทั้งหมด
        </button>
        <button
          onClick={() => onToggleAll(false)}
          className="text-[11px] tracked uppercase text-muted hover:text-amber"
        >
          ไม่เลือกเลย
        </button>
      </div>

      <ul>
        {day.exercises.map((ex) => (
          <li key={ex.id} className="tally-row px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={ex.include}
                onChange={(e) => onUpdateExercise(ex.id, { include: e.target.checked })}
                className="mt-1 accent-amber shrink-0"
              />
              <input
                value={ex.name}
                onChange={(e) => onUpdateExercise(ex.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-ink text-sm outline-none border-b border-transparent focus:border-line"
              />
            </div>
            {ex.include && <MatchBadge confidence={ex.matchConfidence} />}
            {ex.include && mode === 'log' && (
              <div className="grid grid-cols-4 gap-1.5 pl-6">
                <NumberField label="เซ็ต" value={ex.sets} onChange={(v) => onUpdateExercise(ex.id, { sets: v })} />
                <NumberField label="Reps" value={ex.reps} onChange={(v) => onUpdateExercise(ex.id, { reps: v })} />
                <NumberField
                  label="กก."
                  value={ex.weight_kg}
                  step={0.5}
                  onChange={(v) => onUpdateExercise(ex.id, { weight_kg: v })}
                />
                <NumberField label="RPE" value={ex.rpe} step={0.5} onChange={(v) => onUpdateExercise(ex.id, { rpe: v })} />
              </div>
            )}
            {ex.include && mode === 'program' && (
              <div className="grid grid-cols-2 gap-1.5 pl-6">
                <TextField
                  label="เซ็ต"
                  value={ex.sets !== null ? String(ex.sets) : ''}
                  onChange={(v) => onUpdateExercise(ex.id, { sets: v ? Number(v) : null })}
                />
                <TextField
                  label="Target Reps"
                  value={ex.targetRepsRaw ?? ''}
                  onChange={(v) => onUpdateExercise(ex.id, { targetRepsRaw: v || null })}
                />
                <TextField
                  label="Target RIR"
                  value={ex.targetRirRaw ?? ''}
                  onChange={(v) => onUpdateExercise(ex.id, { targetRirRaw: v || null })}
                />
                <TextField label="พัก" value={ex.restRaw ?? ''} onChange={(v) => onUpdateExercise(ex.id, { restRaw: v || null })} />
                <NumberField
                  label="น้ำหนักเริ่มต้น (กก.)"
                  value={ex.weight_kg}
                  step={0.5}
                  onChange={(v) => onUpdateExercise(ex.id, { weight_kg: v })}
                />
              </div>
            )}
            {ex.include && (
              <div className="pl-6 space-y-1">
                <select
                  value={ex.muscleGroup}
                  onChange={(e) => onUpdateExercise(ex.id, { muscleGroup: e.target.value as MuscleGroup })}
                  className="bg-surface2 text-xs text-muted rounded px-2 py-1 border border-line outline-none focus:border-amber"
                >
                  {MUSCLE_GROUPS.map((mg) => (
                    <option key={mg} value={mg}>
                      {mg}
                    </option>
                  ))}
                </select>
                {ex.secondaryMuscles.length > 0 && (
                  <p className="text-[11px] text-muted/70">กล้ามเนื้อรอง: {ex.secondaryMuscles.join(', ')}</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BodyLogCard({
  bodyLog,
  onUpdate,
}: {
  bodyLog: ParsedBodyLogRow[]
  onUpdate: (id: string, patch: Partial<ParsedBodyLogRow>) => void
}) {
  return (
    <div className="rounded-lg bg-surface border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <p className="text-sm text-ink font-display tracked uppercase">บันทึกสัดส่วนร่างกาย</p>
        <p className="text-[11px] text-muted">พบ {bodyLog.length} แถวที่มีวันที่กรอกไว้</p>
      </div>
      <ul>
        {bodyLog.map((row) => (
          <li key={row.id} className="tally-row px-4 py-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={row.include}
              onChange={(e) => onUpdate(row.id, { include: e.target.checked })}
              className="accent-amber shrink-0"
            />
            <span className="text-xs font-mono text-muted shrink-0">{row.date}</span>
            <NumberField label="กก." value={row.weight_kg} step={0.1} onChange={(v) => onUpdate(row.id, { weight_kg: v })} />
            <NumberField label="เอว" value={row.waist_cm} step={0.5} onChange={(v) => onUpdate(row.id, { waist_cm: v })} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// แสดงว่าชื่อท่านี้จับคู่กับ Exercise Library ได้แม่นแค่ไหน — ให้ผู้ใช้รู้ว่าแถวไหนควรตรวจสอบซ้ำ
function MatchBadge({ confidence }: { confidence: ParsedExerciseRow['matchConfidence'] }) {
  if (confidence === 'exact' || confidence === 'loose') return null // ตรงชัดเจน ไม่ต้องเตือน

  if (confidence === 'fuzzy') {
    return (
      <p className="pl-6 text-[10px] tracked uppercase text-amber">
        จับคู่แบบไม่ตรงเป๊ะ (fuzzy) — ตรวจสอบชื่อท่า/กลุ่มกล้ามเนื้ออีกครั้ง
      </p>
    )
  }

  // confidence === null — ไม่พบใน Library เลย
  return (
    <p className="pl-6 text-[10px] tracked uppercase text-muted">
      ไม่พบใน Library — เดากลุ่มกล้ามเนื้อจากชื่อวันแทน
    </p>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  step?: number
}) {
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-surface2 text-ink text-xs font-mono text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="block text-[9px] tracked uppercase text-muted mb-0.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface2 text-ink text-xs text-center rounded px-1 py-1.5 border border-line outline-none focus:border-amber"
      />
    </label>
  )
}
