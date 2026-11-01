-- Account data: each user's characters and homebrew, protected by row-level security.
create table characters (
  id uuid primary key,
  owner_id uuid not null references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table characters enable row level security;
create policy "own characters" on characters for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on characters to authenticated;

-- Reports of shared content or uploads. Anyone signed in can file one; only the operator reads them.
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users on delete set null,
  target text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table reports enable row level security;
create policy "file a report" on reports for insert to authenticated with check (reporter_id = auth.uid());
grant insert on reports to authenticated;
