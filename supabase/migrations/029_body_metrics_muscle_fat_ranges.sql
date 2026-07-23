-- เพิ่มช่วงมาตรฐานเฉพาะบุคคล (Low/Standard/High) สำหรับ น้ำหนัก, กล้ามเนื้อโครงร่าง, มวลไขมัน
-- ใช้วาดกราฟ "Muscle fat analysis" แบบเดียวกับรายงานเครื่องชั่ง bioimpedance
-- กรอกได้เฉพาะตอนมีรายงานที่ระบุช่วงมาตรฐานมาให้ (ไม่บังคับกรอกทุกครั้ง)
-- Idempotent รันซ้ำได้ปลอดภัย — รันไฟล์นี้ "หลัง" 028_body_metrics_composition_breakdown.sql

alter table public.body_metrics add column if not exists weight_range_low numeric;
alter table public.body_metrics add column if not exists weight_range_high numeric;
alter table public.body_metrics add column if not exists skeletal_muscle_range_low numeric;
alter table public.body_metrics add column if not exists skeletal_muscle_range_high numeric;
alter table public.body_metrics add column if not exists fat_mass_range_low numeric;
alter table public.body_metrics add column if not exists fat_mass_range_high numeric;

comment on column public.body_metrics.weight_range_low is 'ขอบล่างช่วงน้ำหนักมาตรฐานเฉพาะบุคคล (กก.) — จากรายงานเครื่องชั่ง ใช้วาดกราฟ Muscle fat analysis';
comment on column public.body_metrics.weight_range_high is 'ขอบบนช่วงน้ำหนักมาตรฐานเฉพาะบุคคล (กก.)';
comment on column public.body_metrics.skeletal_muscle_range_low is 'ขอบล่างช่วงกล้ามเนื้อโครงร่างมาตรฐานเฉพาะบุคคล (กก.)';
comment on column public.body_metrics.skeletal_muscle_range_high is 'ขอบบนช่วงกล้ามเนื้อโครงร่างมาตรฐานเฉพาะบุคคล (กก.)';
comment on column public.body_metrics.fat_mass_range_low is 'ขอบล่างช่วงมวลไขมันมาตรฐานเฉพาะบุคคล (กก.)';
comment on column public.body_metrics.fat_mass_range_high is 'ขอบบนช่วงมวลไขมันมาตรฐานเฉพาะบุคคล (กก.)';
