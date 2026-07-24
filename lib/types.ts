export type WorkoutType = 'strength' | 'cardio'

export interface Workout {
  id: string
  user_id: string
  type: WorkoutType
  performed_at: string
  exercise_name: string | null
  muscle_group: string | null
  secondary_muscles: string[]
  exercise_library_id: string | null
  sets: number | null
  reps: number | null
  weight_kg: number | null
  rpe: number | null
  cardio_type: string | null
  distance_km: number | null
  duration_min: number | null
  // ชีพจรเฉลี่ยระหว่างเซสชัน (bpm) — กรอกเองหรือได้จากการนำเข้ารูปหน้าจอ ใช้ประมาณ HR zone รายสัปดาห์
  avg_heart_rate: number | null
  // อัตราก้าว/รอบขาเฉลี่ยระหว่างเซสชัน — หน่วยขึ้นกับ cardio_type (spm วิ่ง/เดิน, rpm ปั่นจักรยาน) ดู lib/cadence.ts
  cadence: number | null
  // แคลอรี่จริงจากอุปกรณ์ (กรอกเองหรือนำเข้าจากรูป) ถ้ามีจะใช้แทนค่าประมาณจากสูตร MET
  calories_kcal: number | null
  notes: string | null
  created_at: string
  // ผลรวม volume ที่แม่นยำจากการรวมทีละเซ็ตจริง (reps x weight_kg ต่อเซ็ตที่ติ๊กเสร็จ)
  // null สำหรับแถวเก่าที่ยังไม่มี workout_sets แนบอยู่ — ให้ fallback ไปใช้ sets*reps*weight_kg แทน
  total_volume_kg: number | null
}

// เซ็ตแต่ละเซ็ตของ workouts หนึ่งแถว — ทำให้ reps/น้ำหนักต่างกันได้ในแต่ละเซ็ต (เช่น drop set)
export interface WorkoutSet {
  id: string
  workout_id: string
  user_id: string
  set_number: number
  reps: number | null
  weight_kg: number | null
  completed: boolean
  created_at: string
}

export interface Profile {
  user_id: string
  height_cm: number | null
  // ชีพจรสูงสุดโดยประมาณ (bpm) — ผู้ใช้กรอกเอง ใช้คำนวณ Heart Rate Zone ใน Weekly Cardio Volume
  // ถ้ายังไม่ตั้ง ระบบ fallback ไปใช้ค่าประมาณมาตรฐาน (ดู lib/heartRate.ts)
  max_heart_rate: number | null
  // ชีพจรขณะพัก (bpm) — ผู้ใช้กรอกเอง ใช้คู่กับ max_heart_rate ประมาณ VO2Max (สูตร Uth) ดู lib/vo2max.ts
  resting_heart_rate: number | null
  updated_at: string
}

export interface BodyMetric {
  id: string
  user_id: string
  measured_at: string
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  hip_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  body_fat_kg: number | null
  body_water_kg: number | null
  inorganic_salt_kg: number | null
  protein_kg: number | null
  skeletal_muscle_kg: number | null
  visceral_fat_grade: number | null
  bmr_kcal: number | null
  weight_range_low: number | null
  weight_range_high: number | null
  skeletal_muscle_range_low: number | null
  skeletal_muscle_range_high: number | null
  fat_mass_range_low: number | null
  fat_mass_range_high: number | null
  body_age_years: number | null
  body_age_range_low: number | null
  body_age_range_high: number | null
  muscle_range_low: number | null
  muscle_range_high: number | null
  body_water_range_low: number | null
  body_water_range_high: number | null
  inorganic_salt_range_low: number | null
  inorganic_salt_range_high: number | null
  protein_range_low: number | null
  protein_range_high: number | null
  notes: string | null
  created_at: string
}

export interface ProgressPhoto {
  id: string
  user_id: string
  taken_at: string
  storage_path: string
  label: string | null
  created_at: string
}

export type GoalType = 'weight' | 'body_fat' | 'strength_volume' | 'cardio_distance' | 'custom'
export type GoalStatus = 'active' | 'done' | 'archived'

export interface Goal {
  id: string
  user_id: string
  title: string
  goal_type: GoalType
  target_value: number | null
  starting_value: number | null
  target_date: string | null
  status: GoalStatus
  created_at: string
}

export interface ProgramDay {
  id: string
  user_id: string
  day_of_week: number // 0 = อาทิตย์ ... 6 = เสาร์
  title: string
  created_at: string
}

export interface ProgramExercise {
  id: string
  program_day_id: string
  user_id: string
  position: number
  exercise_name: string
  muscle_group: string | null
  secondary_muscles: string[]
  exercise_library_id: string | null
  sets: number | null
  target_reps: string | null
  target_rir: string | null
  rest: string | null
  rationale: string | null
  default_weight_kg: number | null
  notes: string | null
  created_at: string
}

export interface ProgramCompletion {
  id: string
  user_id: string
  program_exercise_id: string
  completed_at: string
  created_at: string
}

export interface WorkoutTemplate {
  id: string
  user_id: string
  title: string
  created_at: string
}

export interface WorkoutTemplateExercise {
  id: string
  template_id: string
  user_id: string
  position: number
  exercise_name: string
  muscle_group: string | null
  secondary_muscles: string[]
  exercise_library_id: string | null
  sets: number | null
  target_reps: string | null
  target_rir: string | null
  rest: string | null
  default_weight_kg: number | null
  notes: string | null
  created_at: string
}
