-- Weekly Cardio Volume: เพิ่มคอลัมน์เก็บชีพจรเฉลี่ย + แคลอรี่จริงต่อเซสชัน คาร์ดิโอ
-- และชีพจรสูงสุดของผู้ใช้ (ใช้คำนวณ Heart Rate Zone) — ดู lib/heartRate.ts, lib/weeklyCardioVolume.ts

alter table public.workouts
  add column if not exists avg_heart_rate integer,
  add column if not exists calories_kcal numeric;

alter table public.profiles
  add column if not exists max_heart_rate integer;

comment on column public.workouts.avg_heart_rate is 'ชีพจรเฉลี่ยระหว่างเซสชัน คาร์ดิโอ (bpm) — กรอกเองหรือได้จากการนำเข้ารูป';
comment on column public.workouts.calories_kcal is 'แคลอรี่จริงจากอุปกรณ์ ถ้ามี — ใช้แทนค่าประมาณจากสูตร MET';
comment on column public.profiles.max_heart_rate is 'ชีพจรสูงสุดโดยประมาณ (bpm) ใช้คำนวณ HR zone ใน Weekly Cardio Volume';
