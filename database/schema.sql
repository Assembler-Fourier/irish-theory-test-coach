create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'user',
  display_name text,
  last_login_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table users
  add column if not exists role text not null default 'user',
  add column if not exists display_name text,
  add column if not exists last_login_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
  ) then
    alter table users
      add constraint users_role_check check (role in ('user', 'admin'));
  end if;
end $$;

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  amount integer not null,
  currency text not null default 'eur',
  status text not null,
  created_at timestamptz not null default now()
);

alter table purchases
  add column if not exists stripe_payment_intent_id text;

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  product text not null default 'irish-theory-test-coach',
  active boolean not null default false,
  source text not null default 'stripe',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, product)
);

alter table entitlements
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz;

create table if not exists login_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  purpose text not null default 'login',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  question_id integer not null,
  selected_index integer,
  correct boolean not null,
  mode text not null,
  category text,
  client_event_id text,
  created_at timestamptz not null default now()
);

alter table attempts
  add column if not exists user_id uuid,
  add column if not exists category text,
  add column if not exists client_event_id text;

create table if not exists flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  question_id integer not null,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, question_id)
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  admin_email text not null,
  action text not null,
  target_type text not null,
  target_email text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id integer not null,
  source_type text not null,
  source_reference text,
  archive_url text,
  archive_timestamp text,
  notes text,
  created_at timestamptz not null default now(),
  unique (question_id, source_type, source_reference)
);

create table if not exists question_reviews (
  id uuid primary key default gen_random_uuid(),
  question_id integer not null unique,
  reviewed_status text not null default 'needs_official_cross_check',
  safe_to_show boolean not null default false,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'question_reviews_status_check'
  ) then
    alter table question_reviews
      add constraint question_reviews_status_check
      check (reviewed_status in ('unreviewed', 'needs_official_cross_check', 'approved', 'rejected'));
  end if;
end $$;

create table if not exists question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id integer not null,
  version_number integer not null,
  question_text text,
  explanation text,
  options_json jsonb,
  correct_index integer,
  source_type text,
  source_reference text,
  reviewed_status text,
  safe_to_show boolean not null default false,
  changed_by uuid,
  changed_by_email text,
  change_note text,
  created_at timestamptz not null default now(),
  unique (question_id, version_number)
);

create table if not exists ai_explanations (
  id uuid primary key default gen_random_uuid(),
  question_id integer not null,
  selected_answer_hash text not null,
  selected_answer text not null,
  correct_answer text,
  category text,
  question_text_hash text,
  payload jsonb not null,
  provider text not null default 'fallback',
  model text,
  fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (question_id, selected_answer_hash)
);

alter table ai_explanations
  add column if not exists selected_answer_hash text,
  add column if not exists selected_answer text,
  add column if not exists correct_answer text,
  add column if not exists category text,
  add column if not exists question_text_hash text,
  add column if not exists payload jsonb,
  add column if not exists provider text not null default 'fallback',
  add column if not exists model text,
  add column if not exists fallback boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_used_at timestamptz not null default now();

create table if not exists ai_explanation_rate_limits (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_key, window_start)
);

create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null default 'manual_note',
  topic text,
  category text,
  body text not null,
  status text not null default 'approved',
  created_by uuid,
  created_by_email text,
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table source_documents
  add column if not exists source_type text not null default 'manual_note',
  add column if not exists topic text,
  add column if not exists category text,
  add column if not exists status text not null default 'approved',
  add column if not exists created_by uuid,
  add column if not exists created_by_email text,
  add column if not exists approved_by uuid,
  add column if not exists approved_by_email text,
  add column if not exists approved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_documents_status_check'
  ) then
    alter table source_documents
      add constraint source_documents_status_check
      check (status in ('draft', 'approved', 'archived'));
  end if;
end $$;

create table if not exists source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_estimate integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_document_id, chunk_index)
);

create table if not exists generated_questions (
  id uuid primary key default gen_random_uuid(),
  source_ids uuid[] not null default '{}'::uuid[],
  source_chunk_ids uuid[] not null default '{}'::uuid[],
  category text not null,
  difficulty text not null default 'medium',
  high_yield_tags jsonb not null default '[]'::jsonb,
  question_text text not null,
  question_hash text not null,
  options_json jsonb not null,
  correct_index integer not null,
  explanation text not null,
  status text not null default 'draft',
  duplicate_score numeric(5, 4) not null default 0,
  duplicate_question_id integer,
  duplicate_question_text text,
  provider text not null default 'local-fallback',
  model text,
  generation_prompt_hash text,
  rejection_reason text,
  review_notes text,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  anonymous_id text not null,
  user_id uuid,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table generated_questions
  add column if not exists source_ids uuid[] not null default '{}'::uuid[],
  add column if not exists source_chunk_ids uuid[] not null default '{}'::uuid[],
  add column if not exists difficulty text not null default 'medium',
  add column if not exists high_yield_tags jsonb not null default '[]'::jsonb,
  add column if not exists question_hash text,
  add column if not exists duplicate_score numeric(5, 4) not null default 0,
  add column if not exists duplicate_question_id integer,
  add column if not exists duplicate_question_text text,
  add column if not exists provider text not null default 'local-fallback',
  add column if not exists model text,
  add column if not exists generation_prompt_hash text,
  add column if not exists rejection_reason text,
  add column if not exists review_notes text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_email text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_by_email text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'generated_questions_status_check'
  ) then
    alter table generated_questions
      add constraint generated_questions_status_check
      check (status in ('draft', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'generated_questions_difficulty_check'
  ) then
    alter table generated_questions
      add constraint generated_questions_difficulty_check
      check (difficulty in ('easy', 'medium', 'hard', 'mixed'));
  end if;
end $$;

alter table flags
  add column if not exists user_id uuid,
  add column if not exists category text,
  add column if not exists updated_at timestamptz not null default now();

update attempts
set user_id = users.id
from users
where attempts.user_id is null
  and lower(attempts.email) = lower(users.email);

update flags
set user_id = users.id
from users
where flags.user_id is null
  and lower(flags.email) = lower(users.email);

create index if not exists attempts_email_created_idx on attempts (email, created_at desc);
create index if not exists attempts_question_idx on attempts (question_id);
create index if not exists attempts_user_created_idx on attempts (user_id, created_at desc);
create index if not exists attempts_user_question_created_idx on attempts (user_id, question_id, created_at desc);
create index if not exists entitlements_email_idx on entitlements (email);
create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
create index if not exists question_sources_question_idx on question_sources (question_id);
create index if not exists question_reviews_status_idx on question_reviews (reviewed_status);
create index if not exists question_versions_question_created_idx on question_versions (question_id, created_at desc);
create unique index if not exists ai_explanations_question_selected_idx
  on ai_explanations (question_id, selected_answer_hash);
create unique index if not exists ai_explanation_rate_limits_key_window_idx
  on ai_explanation_rate_limits (rate_key, window_start);
create index if not exists ai_explanations_question_idx on ai_explanations (question_id, last_used_at desc);
create index if not exists ai_explanation_rate_limits_window_idx on ai_explanation_rate_limits (window_start desc);
create index if not exists source_documents_status_created_idx on source_documents (status, created_at desc);
create index if not exists source_documents_category_idx on source_documents (category);
create index if not exists source_chunks_document_idx on source_chunks (source_document_id, chunk_index);
create index if not exists generated_questions_status_created_idx on generated_questions (status, created_at desc);
create index if not exists generated_questions_category_idx on generated_questions (category);
create index if not exists generated_questions_question_hash_idx on generated_questions (question_hash);
create index if not exists events_created_idx on events (created_at desc);
create index if not exists events_name_created_idx on events (event_name, created_at desc);
create index if not exists events_anonymous_created_idx on events (anonymous_id, created_at desc);
create index if not exists events_user_created_idx on events (user_id, created_at desc) where user_id is not null;
create index if not exists users_role_idx on users (role);
create index if not exists flags_user_idx on flags (user_id);
create index if not exists login_tokens_email_expires_idx on login_tokens (email, expires_at desc);
create index if not exists sessions_email_expires_idx on sessions (email, expires_at desc);
create unique index if not exists attempts_user_client_event_id_idx
  on attempts (user_id, client_event_id)
  where user_id is not null and client_event_id is not null;
create unique index if not exists flags_user_question_idx
  on flags (user_id, question_id)
  where user_id is not null;
create unique index if not exists purchases_stripe_payment_intent_id_idx
  on purchases (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
