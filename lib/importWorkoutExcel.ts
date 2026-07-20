import * as XLSX from 'xlsx'
import { MUSCLE_GROUPS, type MuscleGroup } from './muscle-groups'
import { matchExercise, type ExerciseMatchType } from './exercises'
import type { ExerciseDef } from './exerciseLibrary'

export interface ParsedExerciseRow {
  id: string
  name: string
  sets: number | null
  reps: number | null
  rir: number | null
  rpe: number | null
  weight_kg: number | null
  notes: string | null
  muscleGroup: MuscleGroup
  include: boolean
  // ข้อความช่วงดิบจากไฟล์ (เช่น "6-8", "1-2", "2-3 min") — ใช้แสดงผลตอนบันทึกเป็นโปรแกรม
  targetRepsRaw: string | null
  targetRirRaw: string | null
  restRaw: string | null
  rationale: string | null
  // ผลการจับคู่กับ Exercise Library — null = ไม่พบท่านี้ใน Library เลย (fallback ไปเดากลุ่มกล้ามเนื้อจากชื่อวันแทน)
  matchedExerciseId: string | null
  matchConfidence: ExerciseMatchType | null
  secondaryMuscles: string[]
}

export interface ParsedDay {
  sheetName: string
  title: string
  exercises: ParsedExerciseRow[]
}

export interface ParsedBodyLogRow {
  id: string
  date: string | null
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  notes: string | null
  include: boolean
}

export interface ParsedWorkbook {
  days: ParsedDay[]
  bodyLog: ParsedBodyLogRow[]
  warnings: string[]
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function guessMuscleGroup(text: string): MuscleGroup {
  const t = text.toLowerCase()
  if (/push|chest|อก/.test(t)) return 'อก'
  if (/pull|back|หลัง|lat|row|deadlift/.test(t)) return 'หลัง'
  if (/leg|lower|quad|hamstring|glute|calf|ขา/.test(t)) return 'ขา'
  if (/shoulder|delt|ไหล่/.test(t)) return 'ไหล่'
  if (/arm|bicep|tricep|แขน/.test(t)) return 'แขน'
  if (/core|ab(s)?|แกนกลาง/.test(t)) return 'แกนกลางลำตัว'
  if (/upper|full body|ทั้งตัว/.test(t)) return 'ทั้งตัว'
  return 'อื่นๆ'
}

// รองรับค่าที่เป็นตัวเลข, ช่วง เช่น "6-8", หรือมีหน่วยกำกับ เช่น "20 ปอนด์"
function parseRangeToNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Math.round(raw * 10) / 10
  const nums = String(raw).match(/[\d.]+/g)
  if (!nums || nums.length === 0) return null
  const values = nums.map(Number).filter((n) => !Number.isNaN(n))
  if (values.length === 0) return null
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return Math.round(avg * 10) / 10
}

const LB_TO_KG = 0.453592

// คืนค่าเป็น กก. เสมอ — ถ้าพบหน่วยปอนด์ในข้อความจะแปลงให้อัตโนมัติ
function parseWeightToKg(raw: unknown): { value: number | null; convertedFromLb: boolean } {
  if (raw === null || raw === undefined || raw === '') return { value: null, convertedFromLb: false }
  if (typeof raw === 'number') return { value: Math.round(raw * 10) / 10, convertedFromLb: false }
  const str = String(raw)
  const match = str.match(/[\d.]+/)
  if (!match) return { value: null, convertedFromLb: false }
  const num = Number(match[0])
  if (Number.isNaN(num)) return { value: null, convertedFromLb: false }
  const isPounds = /ปอนด?์?|lb/i.test(str)
  if (isPounds) {
    return { value: Math.round(num * LB_TO_KG * 10) / 10, convertedFromLb: true }
  }
  return { value: num, convertedFromLb: false }
}

function rirToRpe(rir: number | null): number | null {
  if (rir === null) return null
  const rpe = 10 - rir
  return Math.min(10, Math.max(1, Math.round(rpe * 2) / 2))
}

function excelDateToIso(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) {
    const offset = raw.getTimezoneOffset()
    const local = new Date(raw.getTime() - offset * 60000)
    return local.toISOString().slice(0, 10)
  }
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (!parsed) return null
    const mm = String(parsed.m).padStart(2, '0')
    const dd = String(parsed.d).padStart(2, '0')
    return `${parsed.y}-${mm}-${dd}`
  }
  const str = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm)
    const hasHash = cells.some((c) => c === '#')
    const hasExercise = cells.some((c) => c.includes('exercise'))
    if (hasHash && hasExercise) return i
  }
  return -1
}

function findBodyLogHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm)
    const hasDate = cells.some((c) => c === 'date' || c.includes('วันที่'))
    const hasWeight = cells.some((c) => c.includes('weight') || c.includes('น้ำหนัก'))
    if (hasDate && hasWeight) return i
  }
  return -1
}

function isRowEmpty(row: unknown[] | undefined): boolean {
  if (!row) return true
  return row.every((c) => c === null || c === undefined || String(c).trim() === '')
}

function parseDaySheet(sheetName: string, rows: unknown[][], warnings: string[], exercises: ExerciseDef[]): ParsedDay | null {
  const headerRowIdx = findHeaderRow(rows)
  if (headerRowIdx === -1) return null

  const headerRow = rows[headerRowIdx] ?? []
  const col: Record<string, number> = {}
  const weekKgCols: number[] = []

  headerRow.forEach((cell, i) => {
    const h = norm(cell)
    if (!h) return
    if (h === '#') col.num = i
    else if (h.includes('exercise')) col.exercise = i
    else if (h.includes('rir')) col.rir = i
    else if (h.includes('set')) col.sets = i
    else if (h.includes('rep')) col.reps = i
    else if (h.includes('rest')) col.rest = i
    else if (h.includes('rational') || h.includes('เหตุผล') || h.includes('หลักสูตร')) col.rationale = i
    else if (h.includes('note')) col.notes = i
    else if (h.startsWith('week')) weekKgCols.push(i)
  })

  if (col.exercise === undefined) return null

  // ชื่อวัน: ใช้แถวแรกสุดของชีตถ้ามีข้อความ ไม่งั้น fallback เป็นชื่อชีต
  const titleCell = rows.find((r) => !isRowEmpty(r))?.find((c) => norm(c).length > 0)
  const title = titleCell ? String(titleCell) : sheetName.replace(/_/g, ' ')
  const dayMuscleGuess = guessMuscleGroup(`${sheetName} ${title}`)

  const exercises: ParsedExerciseRow[] = []
  let convertedLbCount = 0
  let fuzzyMatchCount = 0
  let noMatchCount = 0

  for (let r = headerRowIdx + 2; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (isRowEmpty(row)) break
    const nameRaw = col.exercise !== undefined ? row[col.exercise] : null
    if (nameRaw === null || nameRaw === undefined || String(nameRaw).trim() === '') continue

    const setsVal = col.sets !== undefined ? parseRangeToNumber(row[col.sets]) : null
    const targetReps = col.reps !== undefined ? parseRangeToNumber(row[col.reps]) : null
    const targetRir = col.rir !== undefined ? parseRangeToNumber(row[col.rir]) : null
    const rest = col.rest !== undefined ? row[col.rest] : null
    const rationale = col.rationale !== undefined ? row[col.rationale] : null
    const extraNotes = col.notes !== undefined ? row[col.notes] : null

    // หาน้ำหนัก/เรพจริงจากคอลัมน์สัปดาห์แรกที่มีข้อมูลกรอกไว้ (คอลัมน์ถัดไปคือเรพ)
    let weightRaw: unknown = null
    let repsAchievedRaw: unknown = null
    for (const kgColIdx of weekKgCols) {
      const val = row[kgColIdx]
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        weightRaw = val
        repsAchievedRaw = row[kgColIdx + 1]
        break
      }
    }

    const { value: weightKg, convertedFromLb } = parseWeightToKg(weightRaw)
    if (convertedFromLb) convertedLbCount++

    const reps = parseRangeToNumber(repsAchievedRaw) ?? targetReps
    const rpe = rirToRpe(targetRir)

    const noteParts: string[] = []
    if (rationale) noteParts.push(String(rationale))
    if (rest) noteParts.push(`พัก ${rest}`)
    if (extraNotes) noteParts.push(String(extraNotes))

    // จับคู่ชื่อท่ากับ Exercise Library ก่อน (exact → loose → fuzzy) — ได้กลุ่มกล้ามเนื้อที่แม่นยำกว่า
    // การเดาจากชื่อวัน/ชื่อชีต ถ้าไม่เจอเลยค่อย fallback ไปใช้ dayMuscleGuess เหมือนเดิม
    const exerciseName = String(nameRaw).trim()
    const libMatch = matchExercise(exercises, exerciseName)
    if (libMatch?.matchType === 'fuzzy') fuzzyMatchCount++
    if (!libMatch) noMatchCount++

    exercises.push({
      id: `${sheetName}-${r}`,
      name: exerciseName,
      sets: setsVal !== null ? Math.round(setsVal) : null,
      reps: reps !== null ? Math.round(reps) : null,
      rir: targetRir,
      rpe,
      weight_kg: weightKg,
      notes: noteParts.length > 0 ? noteParts.join(' · ') : null,
      muscleGroup: libMatch?.exercise.muscleGroup ?? dayMuscleGuess,
      include: true,
      targetRepsRaw: targetReps !== null && col.reps !== undefined && row[col.reps] != null ? String(row[col.reps]).trim() : null,
      targetRirRaw: col.rir !== undefined && row[col.rir] != null ? String(row[col.rir]).trim() : null,
      restRaw: rest ? String(rest).trim() : null,
      rationale: rationale ? String(rationale).trim() : null,
      matchedExerciseId: libMatch?.exercise.id ?? null,
      matchConfidence: libMatch?.matchType ?? null,
      secondaryMuscles: libMatch?.exercise.secondaryMuscles ?? [],
    })
  }

  if (convertedLbCount > 0) {
    warnings.push(`"${title}": แปลงน้ำหนัก ${convertedLbCount} รายการจากปอนด์เป็นกิโลกรัมอัตโนมัติ กรุณาตรวจสอบความถูกต้อง`)
  }

  if (fuzzyMatchCount > 0) {
    warnings.push(`"${title}": ${fuzzyMatchCount} ท่าจับคู่กับ Exercise Library แบบไม่ตรงเป๊ะ (fuzzy) กรุณาตรวจสอบชื่อและกลุ่มกล้ามเนื้ออีกครั้ง`)
  }

  if (noMatchCount > 0) {
    warnings.push(`"${title}": ${noMatchCount} ท่าไม่พบใน Exercise Library — เดากลุ่มกล้ามเนื้อจากชื่อวันแทน กรุณาตรวจสอบ`)
  }

  if (exercises.length === 0) return null

  return { sheetName, title, exercises }
}

function parseBodyLogSheet(rows: unknown[][]): ParsedBodyLogRow[] {
  const headerRowIdx = findBodyLogHeaderRow(rows)
  if (headerRowIdx === -1) return []

  const headerRow = rows[headerRowIdx] ?? []
  const col: Record<string, number> = {}
  headerRow.forEach((cell, i) => {
    const h = norm(cell)
    if (!h) return
    if (h === 'date' || h.includes('วันที่')) col.date = i
    else if (h.includes('weight') || h.includes('น้ำหนัก')) col.weight = i
    else if (h.includes('waist') || h.includes('เอว')) col.waist = i
    else if (h.includes('chest') || h.includes('อก')) col.chest = i
    else if (h.includes('arm') || h.includes('แขน')) col.arm = i
    else if (h.includes('thigh') || h.includes('ต้นขา')) col.thigh = i
    else if (h.includes('note')) col.notes = i
  })

  const results: ParsedBodyLogRow[] = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (isRowEmpty(row)) continue
    const dateRaw = col.date !== undefined ? row[col.date] : null
    const iso = excelDateToIso(dateRaw)
    if (!iso) continue // ข้ามแถวที่ยังไม่ได้กรอกวันที่

    const extra: string[] = []
    if (col.arm !== undefined && row[col.arm]) extra.push(`แขน ${row[col.arm]} ซม.`)
    if (col.thigh !== undefined && row[col.thigh]) extra.push(`ต้นขา ${row[col.thigh]} ซม.`)
    if (col.notes !== undefined && row[col.notes]) extra.push(String(row[col.notes]))

    results.push({
      id: `bodylog-${r}`,
      date: iso,
      weight_kg: col.weight !== undefined ? parseRangeToNumber(row[col.weight]) : null,
      waist_cm: col.waist !== undefined ? parseRangeToNumber(row[col.waist]) : null,
      chest_cm: col.chest !== undefined ? parseRangeToNumber(row[col.chest]) : null,
      notes: extra.length > 0 ? extra.join(' · ') : null,
      include: true,
    })
  }
  return results
}

export function parseWorkoutExcel(buffer: ArrayBuffer, exercises: ExerciseDef[] = []): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const days: ParsedDay[] = []
  const warnings: string[] = []
  let bodyLog: ParsedBodyLogRow[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
    if (rows.length === 0) continue

    if (findBodyLogHeaderRow(rows) !== -1 && findHeaderRow(rows) === -1) {
      bodyLog = parseBodyLogSheet(rows)
      continue
    }

    const day = parseDaySheet(sheetName, rows, warnings, exercises)
    if (day) days.push(day)
  }

  if (days.length === 0) {
    warnings.push('ไม่พบตารางท่าออกกำลังกายที่รูปแบบตรงกับที่รองรับในไฟล์นี้')
  }

  return { days, bodyLog, warnings }
}

export { MUSCLE_GROUPS, parseRangeToNumber, rirToRpe }
