-- เพิ่ม "มวลกระดูก" (Bone Mass) พร้อมช่วงมาตรฐาน (Low/High)
-- ให้ครบชุดเดียวกับ Weight/Skeletal Muscle/Fat Mass/Muscle/Body Age/Body Water/Salt/Protein ที่มีอยู่แล้ว
-- ใช้แสดงในหน้า สุขภาพร่างกาย > ภาพรวม และ แนวโน้ม
-- กรอกได้เฉพาะตอนมีรายงานที่ระบุค่านี้มาให้ (ไม่บังคับกรอกทุกครั้ง)
-- Idempotent รันซ้ำได้ปลอดภัย — รันไฟล์นี้ "หลัง" 032_body_metrics_water_salt_protein_range.sql

alter table public.body_metrics add column if not exists bone_mass_kg numeric;
alter table public.body_metrics add column if not exists bone_mass_range_low numeric;
alter table public.body_metrics add column if not exists bone_mass_range_high numeric;

comment on column public.body_metrics.bone_mass_kg is 'มวลกระดูก (Bone Mass) จากรายงานเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.bone_mass_range_low is 'ขอบล่างช่วงมวลกระดูกมาตรฐานเฉพาะบุคคล (กก.)';
comment on column public.body_metrics.bone_mass_range_high is 'ขอบบนช่วงมวลกระดูกมาตรฐานเฉพาะบุคคล (กก.)';
