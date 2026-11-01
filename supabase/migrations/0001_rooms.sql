-- Room state and the anti-cheat logs. Browsers never touch these tables: the server reads and
-- writes with the service role, and RLS with no policies denies anon and authenticated users.
create table rooms (
  id uuid primary key,
  invite_code text not null unique,
  version integer not null default 0,
  state jsonb not null,
  created_at timestamptz not null default now()
);
create table room_members (
  room_id uuid not null references rooms on delete restrict,
  member_id uuid not null,
  token_hash text not null unique,
  primary key (room_id, member_id)
);
create table room_events (
  room_id uuid not null references rooms on delete restrict,
  seq bigint not null,
  data jsonb not null,
  primary key (room_id, seq)
);
create table chat_messages (
  id uuid primary key,
  room_id uuid not null references rooms on delete restrict,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Insert-only tables.
create table rolls (
  id uuid primary key,
  room_id uuid not null references rooms on delete restrict,
  request_id text not null,
  member_id uuid not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, member_id, request_id)
);
create table sheet_audit (
  id uuid primary key,
  room_id uuid not null references rooms on delete restrict,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table security_flags (
  id uuid primary key,
  room_id uuid not null references rooms on delete restrict,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create function reject_change() returns trigger language plpgsql as $$
begin
  raise exception '% is insert-only', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rolls', 'sheet_audit', 'security_flags'] loop
    execute format('create trigger %I_no_update before update or delete on %I for each row execute function reject_change()', t, t);
    execute format('create trigger %I_no_truncate before truncate on %I for each statement execute function reject_change()', t, t);
    -- Supabase grants every role full access to new tables by default, so take it back by name.
    execute format('revoke update, delete, truncate on %I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

alter table rooms enable row level security;
alter table room_members enable row level security;
alter table room_events enable row level security;
alter table chat_messages enable row level security;
alter table rolls enable row level security;
alter table sheet_audit enable row level security;
alter table security_flags enable row level security;

-- One transaction: check the version, then write state, events, rolls, audits and flags together.
-- Returns false on a version conflict, so a roll never exists without its state and vice versa.
create function commit_intent(p_room uuid, p_expected integer, p_state jsonb, p_events jsonb, p_rolls jsonb, p_audits jsonb, p_flags jsonb, p_chat jsonb)
returns boolean language plpgsql as $$
begin
  update rooms set state = p_state, version = p_expected + 1 where id = p_room and version = p_expected;
  if not found then return false; end if;
  insert into room_events (room_id, seq, data) select p_room, (e->>'seq')::bigint, e from jsonb_array_elements(p_events) e;
  insert into rolls (id, room_id, request_id, member_id, data) select (r->>'id')::uuid, p_room, r->>'requestId', (r->>'memberId')::uuid, r from jsonb_array_elements(p_rolls) r;
  insert into sheet_audit (id, room_id, data) select (a->>'id')::uuid, p_room, a from jsonb_array_elements(p_audits) a;
  insert into security_flags (id, room_id, data) select (f->>'id')::uuid, p_room, f from jsonb_array_elements(p_flags) f;
  insert into chat_messages (id, room_id, data) select (c->>'id')::uuid, p_room, c from jsonb_array_elements(p_chat) c;
  return true;
end $$;
revoke execute on function commit_intent from public, anon, authenticated;
grant execute on function commit_intent to service_role;
revoke execute on function reject_change from anon, authenticated;
