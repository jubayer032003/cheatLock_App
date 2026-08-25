create extension if not exists pgcrypto;

create table if not exists public.question_bank_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.question_bank_classes(id) on delete restrict,
  name text not null,
  slug text not null,
  code text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, slug)
);

create table if not exists public.question_bank_chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.question_bank_subjects(id) on delete restrict,
  name text not null,
  slug text not null,
  chapter_number integer,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create table if not exists public.question_bank_questions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.question_bank_classes(id) on delete restrict,
  subject_id uuid not null references public.question_bank_subjects(id) on delete restrict,
  chapter_id uuid references public.question_bank_chapters(id) on delete set null,
  question_type text not null check (question_type in ('mcq', 'true_false', 'short_answer')),
  question_text text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  marks numeric(8,2) not null default 1 check (marks > 0),
  explanation text,
  source text,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.question_bank_question_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table if not exists public.question_bank_question_tag_map (
  question_id uuid not null references public.question_bank_questions(id) on delete cascade,
  tag_id uuid not null references public.question_bank_question_tags(id) on delete cascade,
  primary key (question_id, tag_id)
);

create table if not exists public.question_bank_self_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  class_id uuid not null references public.question_bank_classes(id) on delete restrict,
  subject_id uuid not null references public.question_bank_subjects(id) on delete restrict,
  chapter_id uuid references public.question_bank_chapters(id) on delete set null,
  duration_minutes integer not null check (duration_minutes between 1 and 360),
  question_count integer not null check (question_count between 1 and 200),
  difficulty_mode text check (difficulty_mode in ('easy', 'medium', 'hard', 'mixed')),
  status text not null default 'created' check (status in ('created', 'in_progress', 'submitted', 'expired', 'cancelled')),
  started_at timestamptz,
  expires_at timestamptz,
  submitted_at timestamptz,
  score numeric(8,2),
  total_marks numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_self_exam_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.question_bank_self_exam_sessions(id) on delete cascade,
  question_id uuid not null references public.question_bank_questions(id) on delete restrict,
  display_order integer not null,
  marks numeric(8,2) not null,
  created_at timestamptz not null default now(),
  unique (session_id, question_id),
  unique (session_id, display_order)
);

create table if not exists public.question_bank_self_exam_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.question_bank_self_exam_sessions(id) on delete cascade,
  question_id uuid not null references public.question_bank_questions(id) on delete restrict,
  selected_option_id uuid references public.question_bank_question_options(id) on delete set null,
  answer_text text,
  is_correct boolean,
  marks_awarded numeric(8,2),
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create table if not exists public.question_bank_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_qb_subjects_class_id on public.question_bank_subjects(class_id);
create index if not exists idx_qb_chapters_subject_id on public.question_bank_chapters(subject_id);
create index if not exists idx_qb_questions_lookup on public.question_bank_questions(class_id, subject_id, chapter_id, status);
create index if not exists idx_qb_questions_type_difficulty on public.question_bank_questions(question_type, difficulty);
create index if not exists idx_qb_question_options_question_id on public.question_bank_question_options(question_id);
create index if not exists idx_qb_self_exam_sessions_student_status on public.question_bank_self_exam_sessions(student_id, status);
create index if not exists idx_qb_self_exam_questions_session on public.question_bank_self_exam_session_questions(session_id);
create index if not exists idx_qb_self_exam_answers_session on public.question_bank_self_exam_answers(session_id);

alter table public.question_bank_classes enable row level security;
alter table public.question_bank_subjects enable row level security;
alter table public.question_bank_chapters enable row level security;
alter table public.question_bank_questions enable row level security;
alter table public.question_bank_question_options enable row level security;
alter table public.question_bank_question_tags enable row level security;
alter table public.question_bank_question_tag_map enable row level security;
alter table public.question_bank_self_exam_sessions enable row level security;
alter table public.question_bank_self_exam_session_questions enable row level security;
alter table public.question_bank_self_exam_answers enable row level security;
alter table public.question_bank_admin_audit_logs enable row level security;

drop policy if exists "service role manages classes" on public.question_bank_classes;
create policy "service role manages classes" on public.question_bank_classes for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages subjects" on public.question_bank_subjects;
create policy "service role manages subjects" on public.question_bank_subjects for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages chapters" on public.question_bank_chapters;
create policy "service role manages chapters" on public.question_bank_chapters for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages questions" on public.question_bank_questions;
create policy "service role manages questions" on public.question_bank_questions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages question options" on public.question_bank_question_options;
create policy "service role manages question options" on public.question_bank_question_options for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages question tags" on public.question_bank_question_tags;
create policy "service role manages question tags" on public.question_bank_question_tags for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages question tag map" on public.question_bank_question_tag_map;
create policy "service role manages question tag map" on public.question_bank_question_tag_map for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages self exam sessions" on public.question_bank_self_exam_sessions;
create policy "service role manages self exam sessions" on public.question_bank_self_exam_sessions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages self exam questions" on public.question_bank_self_exam_session_questions;
create policy "service role manages self exam questions" on public.question_bank_self_exam_session_questions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages self exam answers" on public.question_bank_self_exam_answers;
create policy "service role manages self exam answers" on public.question_bank_self_exam_answers for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "service role manages audit logs" on public.question_bank_admin_audit_logs;
create policy "service role manages audit logs" on public.question_bank_admin_audit_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
