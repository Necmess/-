create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  session_id text not null,
  event_name text not null,
  props jsonb not null default '{}'::jsonb
);

alter table public.events enable row level security;

grant insert on table public.events to anon, authenticated;

create policy "allow_event_insert"
on public.events
for insert
to anon, authenticated
with check (true);

create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_event_name_idx on public.events (event_name);
create index if not exists events_user_id_idx on public.events (user_id);
create index if not exists events_session_id_idx on public.events (session_id);
