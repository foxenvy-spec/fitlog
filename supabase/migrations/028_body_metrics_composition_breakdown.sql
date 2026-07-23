-- เพิ่มรายละเอียดองค์ประกอบร่างกายให้ครบตามรายงาน "Body composition analysis" ของเครื่องชั่ง
-- bioimpedance (เช่น Fitdays): มวลไขมัน (กก.), เกลือแร่, โปรตีน, น้ำในร่างกาย, กล้ามเนื้อโครงร่าง
-- Idempotent รันซ้ำได้ปลอดภัย — รันไฟล์นี้ "หลัง" 027_body_metrics_bioimpedance.sql

-- เดิม 027 สร้างคอลัมน์ body_water_pct (สัดส่วน %) ไว้ — แต่รายงานจริงวัดน้ำในร่างกายเป็น "กก." ไม่ใช่ %
-- เปลี่ยนชื่อคอลัมน์ให้ตรงความหมาย ถ้ายังไม่เคยเปลี่ยน (ข้อมูลเดิมที่เคยกรอกเป็น % จะยังอยู่ในคอลัมน์เดิม
-- แค่ชื่อคอลัมน์เปลี่ยน ควรตรวจสอบ/แก้ค่าที่เคยกรอกเป็น % เองอีกครั้งถ้ามี เพราะหน่วยเปลี่ยนความหมาย)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'body_metrics' and column_name = 'body_water_pct'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'body_metrics' and column_name = 'body_water_kg'
  ) then
    alter table public.body_metrics rename column body_water_pct to body_water_kg;
  end if;
end $$;

alter table public.body_metrics add column if not exists body_water_kg numeric;
alter table public.body_metrics add column if not exists body_fat_kg numeric;
alter table public.body_metrics add column if not exists inorganic_salt_kg numeric;
alter table public.body_metrics add column if not exists protein_kg numeric;
alter table public.body_metrics add column if not exists skeletal_muscle_kg numeric;

comment on column public.body_metrics.body_water_kg is 'น้ำในร่างกาย (กก.) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.body_fat_kg is 'มวลไขมัน (กก.) — จากเครื่องชั่ง bioimpedance (ต่างจาก body_fat_pct ซึ่งเป็น %)';
comment on column public.body_metrics.inorganic_salt_kg is 'เกลือแร่/มวลกระดูก (กก.) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.protein_kg is 'โปรตีนในร่างกาย (กก.) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.skeletal_muscle_kg is 'กล้ามเนื้อโครงร่าง (กก.) — จากเครื่องชั่ง bioimpedance (ต่างจาก muscle_kg ซึ่งเป็นกล้ามเนื้อรวม)';
