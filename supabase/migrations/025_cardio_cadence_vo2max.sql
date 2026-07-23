-- Cadence ต่อเซสชันคาร์ดิโอ (ก้าว/นาที หรือ รอบขา/นาทีถ้าเป็นปั่นจักรยาน — ดู lib/cadence.ts)
-- และชีพจรขณะพักของผู้ใช้ ใช้คู่กับ max_heart_rate (migration 010) ประมาณ VO2Max
-- ด้วยสูตร Uth–Sørensen–Overgaard–Pedersen — ดู lib/vo2max.ts

alter table public.workouts
  add column if not exists cadence numeric;

alter table public.profiles
  add column if not exists resting_heart_rate integer;

comment on column public.workouts.cadence is 'อัตราก้าว/รอบขาเฉลี่ยระหว่างเซสชันคาร์ดิโอ — กรอกเองหรือได้จากการนำเข้ารูป หน่วยขึ้นกับ cardio_type (spm วิ่ง/เดิน/ว่ายน้ำ, rpm ปั่นจักรยาน)';
comment on column public.profiles.resting_heart_rate is 'ชีพจรขณะพัก (bpm) — ใช้คู่กับ max_heart_rate ประมาณ VO2Max โดยประมาณ (สูตร Uth) ใน Weekly Cardio Volume';
