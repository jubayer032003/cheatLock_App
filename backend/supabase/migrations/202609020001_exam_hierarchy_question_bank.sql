create extension if not exists pgcrypto;

drop table if exists public.question_bank_self_exam_answers cascade;
drop table if exists public.question_bank_self_exam_session_questions cascade;
drop table if exists public.question_bank_self_exam_sessions cascade;
drop table if exists public.question_bank_question_tag_map cascade;
drop table if exists public.question_bank_question_tags cascade;
drop table if exists public.question_bank_question_options cascade;
drop table if exists public.question_bank_questions cascade;
drop table if exists public.question_bank_chapters cascade;
drop table if exists public.question_bank_subjects cascade;
drop table if exists public.question_bank_classes cascade;

create table public.exam_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  color text,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_nodes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.exam_categories(id) on delete cascade,
  parent_id uuid references public.exam_nodes(id) on delete cascade,
  name text not null,
  slug text not null,
  type text not null check (type in ('level', 'class', 'group', 'admission_type', 'unit', 'subject', 'chapter', 'topic')),
  icon text,
  color text,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, parent_id, slug)
);

create table public.question_bank_questions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.exam_nodes(id) on delete restrict,
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

create table public.question_bank_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.question_bank_question_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table public.question_bank_question_tag_map (
  question_id uuid not null references public.question_bank_questions(id) on delete cascade,
  tag_id uuid not null references public.question_bank_question_tags(id) on delete cascade,
  primary key (question_id, tag_id)
);

create table public.question_bank_self_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  node_id uuid not null references public.exam_nodes(id) on delete restrict,
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

create table public.question_bank_self_exam_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.question_bank_self_exam_sessions(id) on delete cascade,
  question_id uuid not null references public.question_bank_questions(id) on delete restrict,
  display_order integer not null,
  marks numeric(8,2) not null,
  created_at timestamptz not null default now(),
  unique (session_id, question_id),
  unique (session_id, display_order)
);

create table public.question_bank_self_exam_answers (
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

create table public.question_bank_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_exam_nodes_category_parent on public.exam_nodes(category_id, parent_id, is_active);
create index idx_exam_nodes_parent_order on public.exam_nodes(parent_id, display_order, name);
create index idx_qb_questions_node_status on public.question_bank_questions(node_id, status);
create index idx_qb_questions_type_difficulty on public.question_bank_questions(question_type, difficulty);
create index idx_qb_question_options_question_id on public.question_bank_question_options(question_id);
create index idx_qb_self_exam_sessions_student_status on public.question_bank_self_exam_sessions(student_id, status);
create index idx_qb_self_exam_questions_session on public.question_bank_self_exam_session_questions(session_id);
create index idx_qb_self_exam_answers_session on public.question_bank_self_exam_answers(session_id);

alter table public.exam_categories enable row level security;
alter table public.exam_nodes enable row level security;
alter table public.question_bank_questions enable row level security;
alter table public.question_bank_question_options enable row level security;
alter table public.question_bank_question_tags enable row level security;
alter table public.question_bank_question_tag_map enable row level security;
alter table public.question_bank_self_exam_sessions enable row level security;
alter table public.question_bank_self_exam_session_questions enable row level security;
alter table public.question_bank_self_exam_answers enable row level security;
alter table public.question_bank_admin_audit_logs enable row level security;

create policy "service role manages exam categories" on public.exam_categories for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages exam nodes" on public.exam_nodes for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages questions" on public.question_bank_questions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages question options" on public.question_bank_question_options for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages question tags" on public.question_bank_question_tags for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages question tag map" on public.question_bank_question_tag_map for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages self exam sessions" on public.question_bank_self_exam_sessions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages self exam questions" on public.question_bank_self_exam_session_questions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages self exam answers" on public.question_bank_self_exam_answers for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role manages audit logs" on public.question_bank_admin_audit_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into public.exam_categories (name, slug, icon, color, description, display_order)
values
  ('Academic', 'academic', 'school', '#2563eb', 'Class 1-12, SSC and HSC question bank.', 1),
  ('Admission', 'admission', 'graduation-cap', '#8b5cf6', 'Varsity, Medical and Engineering admission practice.', 2);

with academic as (
  select id from public.exam_categories where slug = 'academic'
), admission as (
  select id from public.exam_categories where slug = 'admission'
)
insert into public.exam_nodes (category_id, name, slug, type, icon, color, display_order, metadata)
select id, name, slug, type, icon, color, display_order, metadata
from academic,
(values
  ('Class 1', 'class-1', 'class', 'book-open', '#06b6d4', 1, '{"grade":1}'::jsonb),
  ('Class 2', 'class-2', 'class', 'book-open', '#14b8a6', 2, '{"grade":2}'::jsonb),
  ('Class 3', 'class-3', 'class', 'book-open', '#22c55e', 3, '{"grade":3}'::jsonb),
  ('Class 4', 'class-4', 'class', 'book-open', '#84cc16', 4, '{"grade":4}'::jsonb),
  ('Class 5', 'class-5', 'class', 'book-open', '#f59e0b', 5, '{"grade":5}'::jsonb),
  ('Class 6', 'class-6', 'class', 'book-open', '#f97316', 6, '{"grade":6}'::jsonb),
  ('Class 7', 'class-7', 'class', 'book-open', '#ef4444', 7, '{"grade":7}'::jsonb),
  ('Class 8', 'class-8', 'class', 'book-open', '#ec4899', 8, '{"grade":8}'::jsonb),
  ('SSC', 'ssc', 'level', 'badge-check', '#6366f1', 9, '{"grades":[9,10]}'::jsonb),
  ('HSC', 'hsc', 'level', 'badge-check', '#8b5cf6', 10, '{"grades":[11,12]}'::jsonb)
) seed(name, slug, type, icon, color, display_order, metadata);

with admission as (
  select id from public.exam_categories where slug = 'admission'
)
insert into public.exam_nodes (category_id, name, slug, type, icon, color, display_order)
select id, name, slug, type, icon, color, display_order
from admission,
(values
  ('Versity', 'versity', 'admission_type', 'university', '#2563eb', 1),
  ('Medical', 'medical', 'admission_type', 'stethoscope', '#10b981', 2),
  ('Engineering', 'engineering', 'admission_type', 'calculator', '#f59e0b', 3)
) seed(name, slug, type, icon, color, display_order);

insert into public.exam_nodes (category_id, parent_id, name, slug, type, icon, color, display_order)
select parent.category_id, parent.id, seed.name, seed.slug, 'group', 'layers', seed.color, seed.display_order
from public.exam_nodes parent
join (values
  ('Science', 'science', '#06b6d4', 1),
  ('Arts', 'arts', '#ec4899', 2),
  ('Commerce', 'commerce', '#f59e0b', 3)
) seed(name, slug, color, display_order) on true
where parent.slug in ('ssc', 'hsc');

insert into public.exam_nodes (category_id, parent_id, name, slug, type, icon, color, display_order)
select parent.category_id, parent.id, seed.name, seed.slug, 'unit', 'target', seed.color, seed.display_order
from public.exam_nodes parent
join (values
  ('Unit A', 'unit-a', '#06b6d4', 1),
  ('Unit B', 'unit-b', '#8b5cf6', 2),
  ('Unit C', 'unit-c', '#f59e0b', 3),
  ('Unit D', 'unit-d', '#10b981', 4)
) seed(name, slug, color, display_order) on true
where parent.slug = 'versity';
