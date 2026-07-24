import { describe, it, expect } from 'vitest'
import { findExerciseByName, searchExercises, matchExercise } from './exercises'
import type { ExerciseDef } from './exerciseLibrary'

// ข้อมูลตัวอย่างสำหรับเทส — ไม่ได้ดึงจาก Supabase จริง (matchExercise/findExerciseByName/searchExercises
// เป็นฟังก์ชัน pure ที่รับรายการท่ามาเป็น argument จึงเทสแยกจากฐานข้อมูลได้)
const FIXTURE: ExerciseDef[] = [
  {
    id: 'bench-press',
    name: 'Bench Press',
    nameTh: 'เบนช์เพรส',
    muscleGroup: 'อก',
    secondaryMuscles: ['ไหล่', 'แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['เบนช์เพรส', 'บาร์เบลเบนช์เพรส', 'Flat Bench Press', 'Barbell Bench Press', 'Flat BB Bench', 'BB Bench Press', 'BB Bench'],
    instructions: [],
  },
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    nameTh: 'บาร์เบลเคิร์ล',
    muscleGroup: 'แขน',
    secondaryMuscles: [],
    equipment: 'บาร์เบล',
    icon: '💪',
    aliases: ['ไบเซ็ปเคิร์ล', 'Biceps Curl', 'BB Curl', 'Standing Barbell Curl', 'EZ Bar Curl'],
    instructions: [],
  },
  {
    id: 'shoulder-press',
    name: 'Shoulder Press',
    nameTh: 'โอเวอร์เฮดเพรส',
    muscleGroup: 'ไหล่',
    secondaryMuscles: ['แขน'],
    equipment: 'บาร์เบล',
    icon: '🏋️',
    aliases: ['overhead press', 'มิลิทารีเพรส', 'Overhead Press', 'OHP', 'Military Press', 'Barbell Shoulder Press'],
    instructions: [],
  },
  {
    id: 'plate-loaded-row-machine',
    name: 'Seated Row Machine',
    nameTh: 'แมชชีนโรว์ (นั่งดึง)',
    muscleGroup: 'หลัง',
    secondaryMuscles: ['แขน'],
    equipment: 'เครื่อง',
    icon: '⚙️',
    aliases: ['machine row', 'row machine', 'selectorized row', 'pin loaded row', 'hammer strength row'],
    instructions: [],
  },
]

describe('findExerciseByName', () => {
  it('matches the canonical English name, Thai name, or any alias for the same exercise', () => {
    const names = ['Bench Press', 'เบนช์เพรส', 'Flat Bench Press', 'Barbell Bench Press', 'Flat BB Bench']
    names.forEach((name) => {
      const match = findExerciseByName(FIXTURE, name)
      expect(match?.id).toBe('bench-press')
    })
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(findExerciseByName(FIXTURE, '  flat bb bench  ')?.id).toBe('bench-press')
    expect(findExerciseByName(FIXTURE, 'BARBELL BENCH PRESS')?.id).toBe('bench-press')
  })

  it('returns the matched exercise primary + secondary muscles', () => {
    const match = findExerciseByName(FIXTURE, 'Barbell Bench Press')
    expect(match?.muscleGroup).toBe('อก')
    expect(match?.secondaryMuscles).toEqual(['ไหล่', 'แขน'])
  })

  it('returns undefined for unknown or empty names', () => {
    expect(findExerciseByName(FIXTURE, 'some made up exercise name')).toBeUndefined()
    expect(findExerciseByName(FIXTURE, '')).toBeUndefined()
    expect(findExerciseByName(FIXTURE, '   ')).toBeUndefined()
  })
})

describe('searchExercises still supports partial matches for the picker dropdown', () => {
  it('finds bench press variants by partial text', () => {
    const results = searchExercises(FIXTURE, 'bb bench')
    expect(results.some((ex) => ex.id === 'bench-press')).toBe(true)
  })

  it('finds a selectorized machine when searched by common gym-floor phrasing', () => {
    // ผู้ใช้พิมพ์ตามที่เห็นเขียนบนเครื่องจริง/เรียกกันปากต่อปาก ไม่ใช่ชื่อทางการในคลัง
    // ต้องหาเจอผ่าน alias แม้คำเรียงคนละแบบกับชื่อจริง ("machine row" vs "Seated Row Machine")
    expect(searchExercises(FIXTURE, 'Machine Row').some((ex) => ex.id === 'plate-loaded-row-machine')).toBe(true)
    expect(searchExercises(FIXTURE, 'row machine').some((ex) => ex.id === 'plate-loaded-row-machine')).toBe(true)
  })
})

describe('matchExercise (smart import matching)', () => {
  it('matches exact names/aliases with matchType "exact"', () => {
    const match = matchExercise(FIXTURE, 'Barbell Bench Press')
    expect(match?.exercise.id).toBe('bench-press')
    expect(match?.matchType).toBe('exact')
  })

  it('matches names that only differ by hyphens/dots/spacing with matchType "loose"', () => {
    const match = matchExercise(FIXTURE, 'EZ-Bar Curl')
    expect(match?.exercise.id).toBe('barbell-curl')
    expect(match?.matchType).toBe('loose')
  })

  it('fuzzy-matches a name missing a qualifying word, e.g. "EZ Curl" -> "EZ Bar Curl"', () => {
    const match = matchExercise(FIXTURE, 'EZ Curl')
    expect(match?.exercise.id).toBe('barbell-curl')
    expect(match?.matchType).toBe('fuzzy')
  })

  it('fuzzy-matches equipment-qualified variants to the closest library entry', () => {
    const machineShoulderPress = matchExercise(FIXTURE, 'Machine Shoulder Press')
    expect(machineShoulderPress?.exercise.id).toBe('shoulder-press')
    expect(machineShoulderPress?.matchType).toBe('fuzzy')

    const reordered = matchExercise(FIXTURE, 'Shoulder Press Machine')
    expect(reordered?.exercise.id).toBe('shoulder-press')
  })

  it('fuzzy-matches short acronym aliases combined with an extra word', () => {
    const match = matchExercise(FIXTURE, 'Machine OHP')
    expect(match?.exercise.id).toBe('shoulder-press')
    expect(match?.matchType).toBe('fuzzy')
  })

  it('returns undefined for names with no reasonable match', () => {
    expect(matchExercise(FIXTURE, 'some totally made up exercise xyz')).toBeUndefined()
    expect(matchExercise(FIXTURE, '')).toBeUndefined()
    expect(matchExercise(FIXTURE, '   ')).toBeUndefined()
  })
})
