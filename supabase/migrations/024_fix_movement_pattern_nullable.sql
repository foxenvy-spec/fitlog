-- 024_fix_movement_pattern_nullable.sql
-- ตาราง exercise_library จริงมีคอลัมน์ "movement_pattern" ที่เป็น NOT NULL อยู่ ซึ่งไม่มีอยู่ในโค้ด
-- ของแอปเลย (lib/exerciseLibrary.ts ไม่ได้อ่าน/เขียนคอลัมน์นี้) น่าจะเป็นคอลัมน์เก่าที่ตั้งใจทำ
-- ไว้ตอนออกแบบตารางครั้งแรกแต่ไม่ได้เอามาใช้จริง — ยกเลิกบังคับ NOT NULL เพื่อให้ insert ท่าใหม่
-- (012 เป็นต้นไป) ที่ไม่ได้ระบุค่าคอลัมน์นี้ผ่านได้ โดยไม่กระทบข้อมูลเดิมที่มีอยู่ในคอลัมน์นี้
-- รันไฟล์นี้ "ก่อน" รัน 012 ใหม่อีกครั้ง — idempotent รันซ้ำได้ปลอดภัย

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exercise_library'
      and column_name = 'movement_pattern'
  ) then
    alter table public.exercise_library alter column movement_pattern drop not null;
  end if;
end $$;
