-- เพิ่ม "อายุร่างกาย" (Body Age) และช่วงมาตรฐานของ "มวลกล้ามเนื้อ" (Muscle mass)
-- ให้ครบชุดเดียวกับ Weight/Skeletal Muscle/Fat Mass ที่มีอยู่แล้ว — ใช้แสดงในหน้า สุขภาพร่างกาย > แนวโน้ม
-- กรอกได้เฉพาะตอนมีรายงานที่ระบุค่านี้มาให้ (ไม่บังคับกรอกทุกครั้ง)
-- Idempotent รันซ้ำได้ปลอดภัย — รันไฟล์นี้ "หลัง" 029_body_metrics_muscle_fat_ranges.sql

alter table public.body_metrics add column if not exists body_age_years numeric;
alter table public.body_metrics add column if not exists body_age_range_low numeric;
alter table public.body_metrics add column if not exists body_age_range_high numeric;
alter table public.body_metrics add column if not exists muscle_range_low numeric;
alter table public.body_metrics add column if not exists muscle_range_high numeric;

comment on column public.body_metrics.body_age_years is 'อายุร่างกาย (Body Age) จากรายงานเครื่องชั่ง bioimpedance — ยิ่งต่ำกว่าช่วงมาตรฐานยิ่งดี';
comment on column public.body_metrics.body_age_range_low is 'ขอบล่างช่วงอายุร่างกายมาตรฐานเฉพาะบุคคล (ปี)';
comment on column public.body_metrics.body_age_range_high is 'ขอบบนช่วงอายุร่างกายมาตรฐานเฉพาะบุคคล (ปี)';
comment on column public.body_metrics.muscle_range_low is 'ขอบล่างช่วงมวลกล้ามเนื้อมาตรฐานเฉพาะบุคคล (กก.)';
comment on column public.body_metrics.muscle_range_high is 'ขอบบนช่วงมวลกล้ามเนื้อมาตรฐานเฉพาะบุคคล (กก.)';
