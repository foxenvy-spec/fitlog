-- เพิ่มข้อมูลเชิงลึกจากเครื่องชั่ง bioimpedance (เช่น Fitdays, InBody ฯลฯ) ให้ body_metrics
-- นอกเหนือจาก น้ำหนัก/body fat/muscle ที่มีอยู่แล้ว: สัดส่วนน้ำในร่างกาย, ระดับไขมันช่องท้อง, BMR
-- Idempotent รันซ้ำได้ปลอดภัย

alter table public.body_metrics add column if not exists body_water_pct numeric;
alter table public.body_metrics add column if not exists visceral_fat_grade numeric;
alter table public.body_metrics add column if not exists bmr_kcal numeric;

comment on column public.body_metrics.body_water_pct is 'สัดส่วนน้ำในร่างกาย (%) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.visceral_fat_grade is 'ระดับไขมันช่องท้อง (visceral fat grade) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.bmr_kcal is 'อัตราการเผาผลาญพื้นฐาน (BMR, kcal/วัน) — จากเครื่องชั่ง bioimpedance';
