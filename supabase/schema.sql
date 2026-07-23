-- FitLog database schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query > Run)
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)

create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. workouts (เวท + คาร์ดิโอ)
-- ============================================================
create table if not exists public.workouts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('strength', 'cardio')),
  performed_at date not null default current_date,

  -- strength fields
  exercise_name text,
  muscle_group text,
  sets integer,
  reps integer,
  weight_kg numeric,
  rpe numeric,

  -- cardio fields
  cardio_type text,
  distance_km numeric,
  duration_min numeric,

  notes text,
  created_at timestamptz not null default now()
);

-- migrate existing installs that already have the table without these columns
alter table public.workouts add column if not exists muscle_group text;
alter table public.workouts add column if not exists rpe numeric;

create index if not exists workouts_user_id_idx on public.workouts (user_id);
create index if not exists workouts_performed_at_idx on public.workouts (performed_at desc);

alter table public.workouts enable row level security;

drop policy if exists "Users can view their own workouts" on public.workouts;
create policy "Users can view their own workouts"
  on public.workouts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workouts" on public.workouts;
create policy "Users can insert their own workouts"
  on public.workouts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workouts" on public.workouts;
create policy "Users can update their own workouts"
  on public.workouts for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own workouts" on public.workouts;
create policy "Users can delete their own workouts"
  on public.workouts for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. profiles (ข้อมูลส่วนตัวสำหรับคำนวณ BMI ฯลฯ)
-- ============================================================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  height_cm numeric,
  updated_at timestamptz not null default now()
);

-- ชื่อที่แสดงบน Dashboard — ถ้าเว้นว่าง (null) แอปจะ fallback ไปใช้ชื่อที่ตัดจาก email แทน
alter table public.profiles add column if not exists display_name text;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert their own profile" on public.profiles;
create policy "Users can upsert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ============================================================
-- 3. body_metrics (น้ำหนัก, body fat, muscle, waist, chest, hip)
-- ============================================================
create table if not exists public.body_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric,
  body_fat_pct numeric,
  muscle_kg numeric,
  waist_cm numeric,
  chest_cm numeric,
  hip_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  body_fat_kg numeric,
  body_water_kg numeric,
  inorganic_salt_kg numeric,
  protein_kg numeric,
  skeletal_muscle_kg numeric,
  visceral_fat_grade numeric,
  bmr_kcal numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- migrate existing installs that already have the table without these columns
alter table public.body_metrics add column if not exists arm_cm numeric;
alter table public.body_metrics add column if not exists thigh_cm numeric;
alter table public.body_metrics add column if not exists visceral_fat_grade numeric;
alter table public.body_metrics add column if not exists bmr_kcal numeric;
-- เดิมเป็น body_water_pct (สัดส่วน %) — เปลี่ยนเป็น body_water_kg (มวลจริง หน่วยกก.) ให้ตรงกับรายงานจากเครื่องชั่ง bioimpedance
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
comment on column public.body_metrics.arm_cm is 'รอบต้นแขน (ซม.)';
comment on column public.body_metrics.thigh_cm is 'รอบต้นขา (ซม.)';
comment on column public.body_metrics.body_water_kg is 'น้ำในร่างกาย (กก.) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.body_fat_kg is 'มวลไขมัน (กก.) — จากเครื่องชั่ง bioimpedance (ต่างจาก body_fat_pct ซึ่งเป็น %)';
comment on column public.body_metrics.inorganic_salt_kg is 'เกลือแร่/มวลกระดูก (กก.) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.protein_kg is 'โปรตีนในร่างกาย (กก.) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.skeletal_muscle_kg is 'กล้ามเนื้อโครงร่าง (กก.) — จากเครื่องชั่ง bioimpedance (ต่างจาก muscle_kg ซึ่งเป็นกล้ามเนื้อรวม)';
comment on column public.body_metrics.visceral_fat_grade is 'ระดับไขมันช่องท้อง (visceral fat grade) — จากเครื่องชั่ง bioimpedance';
comment on column public.body_metrics.bmr_kcal is 'อัตราการเผาผลาญพื้นฐาน (BMR, kcal/วัน) — จากเครื่องชั่ง bioimpedance';

create index if not exists body_metrics_user_id_idx on public.body_metrics (user_id);
create index if not exists body_metrics_measured_at_idx on public.body_metrics (measured_at desc);

alter table public.body_metrics enable row level security;

drop policy if exists "Users can view their own body metrics" on public.body_metrics;
create policy "Users can view their own body metrics"
  on public.body_metrics for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own body metrics" on public.body_metrics;
create policy "Users can insert their own body metrics"
  on public.body_metrics for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own body metrics" on public.body_metrics;
create policy "Users can update their own body metrics"
  on public.body_metrics for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own body metrics" on public.body_metrics;
create policy "Users can delete their own body metrics"
  on public.body_metrics for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4. progress_photos (รูปเปรียบเทียบ Before/After)
-- ============================================================
create table if not exists public.progress_photos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  taken_at date not null default current_date,
  storage_path text not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists progress_photos_user_id_idx on public.progress_photos (user_id);
create index if not exists progress_photos_taken_at_idx on public.progress_photos (taken_at desc);

alter table public.progress_photos enable row level security;

drop policy if exists "Users can view their own photos" on public.progress_photos;
create policy "Users can view their own photos"
  on public.progress_photos for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own photos" on public.progress_photos;
create policy "Users can insert their own photos"
  on public.progress_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own photos" on public.progress_photos;
create policy "Users can delete their own photos"
  on public.progress_photos for delete
  using (auth.uid() = user_id);

-- Storage bucket for progress photos (private — served via signed URLs)
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own progress photo files" on storage.objects;
create policy "Users can read own progress photo files"
  on storage.objects for select
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload own progress photo files" on storage.objects;
create policy "Users can upload own progress photo files"
  on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own progress photo files" on storage.objects;
create policy "Users can delete own progress photo files"
  on storage.objects for delete
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 5. goals (เป้าหมาย)
-- ============================================================
create table if not exists public.goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  goal_type text not null check (goal_type in ('weight', 'body_fat', 'strength_volume', 'cardio_distance', 'custom')),
  target_value numeric,
  starting_value numeric,
  target_date date,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals (user_id);

alter table public.goals enable row level security;

drop policy if exists "Users can view their own goals" on public.goals;
create policy "Users can view their own goals"
  on public.goals for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own goals" on public.goals;
create policy "Users can insert their own goals"
  on public.goals for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own goals" on public.goals;
create policy "Users can update their own goals"
  on public.goals for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own goals" on public.goals;
create policy "Users can delete their own goals"
  on public.goals for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 6. program_days (โปรแกรมประจำสัปดาห์ — 1 แถวต่อวันในสัปดาห์ต่อผู้ใช้)
-- ============================================================
create table if not exists public.program_days (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = อาทิตย์ ... 6 = เสาร์
  title text not null,
  created_at timestamptz not null default now(),
  unique (user_id, day_of_week)
);

create index if not exists program_days_user_id_idx on public.program_days (user_id);

alter table public.program_days enable row level security;

drop policy if exists "Users can view their own program days" on public.program_days;
create policy "Users can view their own program days"
  on public.program_days for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own program days" on public.program_days;
create policy "Users can insert their own program days"
  on public.program_days for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own program days" on public.program_days;
create policy "Users can update their own program days"
  on public.program_days for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own program days" on public.program_days;
create policy "Users can delete their own program days"
  on public.program_days for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 7. program_exercises (รายการท่าในแต่ละวันของโปรแกรม)
-- ============================================================
create table if not exists public.program_exercises (
  id uuid primary key default uuid_generate_v4(),
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null default 0,
  exercise_name text not null,
  muscle_group text,
  sets integer,
  target_reps text,        -- เช่น "6-8"
  target_rir text,         -- เช่น "1-2"
  rest text,                -- เช่น "2-3 min"
  rationale text,
  default_weight_kg numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists program_exercises_day_id_idx on public.program_exercises (program_day_id);
create index if not exists program_exercises_user_id_idx on public.program_exercises (user_id);

alter table public.program_exercises enable row level security;

drop policy if exists "Users can view their own program exercises" on public.program_exercises;
create policy "Users can view their own program exercises"
  on public.program_exercises for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own program exercises" on public.program_exercises;
create policy "Users can insert their own program exercises"
  on public.program_exercises for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own program exercises" on public.program_exercises;
create policy "Users can update their own program exercises"
  on public.program_exercises for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own program exercises" on public.program_exercises;
create policy "Users can delete their own program exercises"
  on public.program_exercises for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 8. program_completions (ติ๊กว่าทำท่านี้ของโปรแกรมแล้วในวันที่ระบุ)
-- ============================================================
create table if not exists public.program_completions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises (id) on delete cascade,
  completed_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, program_exercise_id, completed_at)
);

create index if not exists program_completions_user_id_idx on public.program_completions (user_id);
create index if not exists program_completions_date_idx on public.program_completions (completed_at desc);

alter table public.program_completions enable row level security;

drop policy if exists "Users can view their own program completions" on public.program_completions;
create policy "Users can view their own program completions"
  on public.program_completions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own program completions" on public.program_completions;
create policy "Users can insert their own program completions"
  on public.program_completions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own program completions" on public.program_completions;
create policy "Users can delete their own program completions"
  on public.program_completions for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 9. workout_templates (เทมเพลตพร้อมเริ่มได้ทุกเมื่อ ไม่ผูกกับวันในสัปดาห์)
-- ============================================================
create table if not exists public.workout_templates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists workout_templates_user_id_idx on public.workout_templates (user_id);

alter table public.workout_templates enable row level security;

drop policy if exists "Users can view their own workout templates" on public.workout_templates;
create policy "Users can view their own workout templates"
  on public.workout_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workout templates" on public.workout_templates;
create policy "Users can insert their own workout templates"
  on public.workout_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workout templates" on public.workout_templates;
create policy "Users can update their own workout templates"
  on public.workout_templates for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own workout templates" on public.workout_templates;
create policy "Users can delete their own workout templates"
  on public.workout_templates for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 10. workout_template_exercises
-- ============================================================
create table if not exists public.workout_template_exercises (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null default 0,
  exercise_name text not null,
  muscle_group text,
  sets integer,
  target_reps text,
  target_rir text,
  rest text,
  default_weight_kg numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists workout_template_exercises_template_id_idx on public.workout_template_exercises (template_id);
create index if not exists workout_template_exercises_user_id_idx on public.workout_template_exercises (user_id);

alter table public.workout_template_exercises enable row level security;

drop policy if exists "Users can view their own template exercises" on public.workout_template_exercises;
create policy "Users can view their own template exercises"
  on public.workout_template_exercises for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own template exercises" on public.workout_template_exercises;
create policy "Users can insert their own template exercises"
  on public.workout_template_exercises for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own template exercises" on public.workout_template_exercises;
create policy "Users can update their own template exercises"
  on public.workout_template_exercises for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own template exercises" on public.workout_template_exercises;
create policy "Users can delete their own template exercises"
  on public.workout_template_exercises for delete
  using (auth.uid() = user_id);
