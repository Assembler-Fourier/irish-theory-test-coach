create table if not exists operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  source text not null default 'app',
  environment text not null default 'local',
  correlation_id text,
  safe_actor text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  environment text not null default 'local',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  findings_count integer not null default 0,
  high_severity_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references reconciliation_runs(id) on delete cascade,
  check_key text not null,
  severity text not null default 'warning',
  subject_type text not null,
  subject_id text,
  message text not null,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists restore_drills (
  id uuid primary key default gen_random_uuid(),
  restoration_date date not null,
  source_backup text not null,
  target_environment text not null,
  row_counts jsonb not null default '{}'::jsonb,
  integrity_checks jsonb not null default '{}'::jsonb,
  elapsed_seconds integer,
  problems text,
  recorded_by text,
  created_at timestamptz not null default now()
);

create index if not exists operational_events_created_idx on operational_events (created_at desc);
create index if not exists operational_events_type_created_idx on operational_events (event_type, created_at desc);
create index if not exists reconciliation_runs_started_idx on reconciliation_runs (started_at desc);
create index if not exists reconciliation_findings_run_idx on reconciliation_findings (run_id);
create index if not exists reconciliation_findings_status_idx on reconciliation_findings (status, created_at desc);
