-- 009_exercise_library_link.sql
-- รวม 2 แนวทางที่เคยเสนอแยกกันไว้เข้าเป็นไฟล์เดียว:
--   1) exercise_library_id — FK เชื่อมกลับไปท่าต้นทางใน exercise_library จริง (ไม่ใช่แค่เทียบชื่อ text)
--   2) secondary_muscles — บังคับ not null default '{}' ให้ครบ (กัน NULL หลุดมาแม้อีกไฟล์เคยรันไปแล้วแบบ nullable)
-- เขียนให้รันซ้ำได้ปลอดภัย ไม่ว่าก่อนหน้านี้จะเคยรัน 008_secondary_muscles.sql,
-- 007_exercise_library_link.sql (แบบ nullable), ทั้งคู่, หรือยังไม่เคยรันอะไรเลยก็ตาม

do $$
declare
  tbl text;
begin
  foreach tbl in array array['workouts', 'program_exercises', 'workout_template_exercises']
  loop
    -- exercise_library_id: เพิ่มคอลัมน์ถ้ายังไม่มี
    -- หมายเหตุ: exercise_library.id เป็น text (slug เช่น 'bench-press') ไม่ใช่ uuid
    -- ดู 007_exercise_library.sql — ต้องเป็น type เดียวกันถึงจะสร้าง FK ได้
    execute format(
      'alter table public.%I add column if not exists exercise_library_id text references public.exercise_library (id) on delete set null',
      tbl
    );

    -- secondary_muscles: เพิ่มคอลัมน์ถ้ายังไม่มี (เผื่อไม่เคยรัน migration ไหนมาก่อนเลย)
    execute format('alter table public.%I add column if not exists secondary_muscles text[]', tbl);

    -- เติม '{}' ให้แถวเก่าที่อาจเป็น NULL อยู่ (ไม่ว่าจะมาจากการรัน migration แบบ nullable ก่อนหน้า)
    execute format('update public.%I set secondary_muscles = %L where secondary_muscles is null', tbl, '{}');

    -- บังคับ default + not null ให้ตรงกันทุกที่ ไม่ว่าจุดเริ่มต้นจะเป็นแบบไหน
    execute format('alter table public.%I alter column secondary_muscles set default %L', tbl, '{}');
    execute format('alter table public.%I alter column secondary_muscles set not null', tbl);
  end loop;
end $$;

create index if not exists workouts_exercise_library_id_idx on public.workouts (exercise_library_id);
create index if not exists program_exercises_exercise_library_id_idx on public.program_exercises (exercise_library_id);
create index if not exists workout_template_exercises_exercise_library_id_idx on public.workout_template_exercises (exercise_library_id);
