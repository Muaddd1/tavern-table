// Runs the real SQL migrations in PGlite (Postgres compiled to WASM) to prove the database
// itself refuses to change a logged roll, whoever asks.
import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const ROOM = "11111111-1111-1111-1111-111111111111";
const roll = (id: string, requestId: string) => ({ id, requestId, memberId: "22222222-2222-2222-2222-222222222222", total: 15 });
const commit = (version: number, rolls: unknown[], seq = version + 1) =>
  db.query<{ commit_intent: boolean }>("select commit_intent($1, $2, $3, $4, $5, '[]', '[]', '[]')", [ROOM, version, JSON.stringify({ version: version + 1 }), JSON.stringify([{ seq }]), JSON.stringify(rolls)]);

beforeAll(async () => {
  db = new PGlite();
  // Stand-ins for what Supabase provides, including its default grants to every role.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to public; grant usage on schema public to public; grant execute on function auth.uid() to public;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of fs.readdirSync("supabase/migrations").sort()) await db.exec(fs.readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.query("insert into rooms (id, invite_code, state) values ($1, 'ABCDEF', '{}')", [ROOM]);
});

const expectRefused = async (sql: string, params: unknown[] = []) => {
  await expect(db.query(sql, params)).rejects.toThrow();
};
const asRole = async <T>(role: string, fn: () => Promise<T>) => {
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;

describe("commit_intent", () => {
  it("writes state and rolls together, and bumps the version", async () => {
    const r = await commit(0, [roll("33333333-3333-3333-3333-333333333331", "a")]);
    expect(r.rows[0].commit_intent).toBe(true);
    expect((await db.query<{ version: number }>("select version from rooms where id = $1", [ROOM])).rows[0].version).toBe(1);
    expect(await count("rolls")).toBe(1);
  });
  it("refuses a stale version without writing anything", async () => {
    const before = await count("rolls");
    const r = await commit(0, [roll("33333333-3333-3333-3333-333333333332", "b")], 99);
    expect(r.rows[0].commit_intent).toBe(false);
    expect(await count("rolls")).toBe(before);
  });
  it("rolls back the state change when a roll repeats a request id", async () => {
    await expect(commit(1, [roll("33333333-3333-3333-3333-333333333333", "a")])).rejects.toThrow();
    expect((await db.query<{ version: number }>("select version from rooms where id = $1", [ROOM])).rows[0].version).toBe(1);
  });
});

describe("insert-only logs", () => {
  it.each(["rolls", "sheet_audit", "security_flags"])("%s refuses update and delete from the table owner, via its triggers", async (t) => {
    await db.query(`insert into ${t} (id, room_id${t === "rolls" ? ", request_id, member_id" : ""}, data) values (gen_random_uuid(), $1${t === "rolls" ? ", 'own-" + t + "', gen_random_uuid()" : ""}, '{}')`, [ROOM]);
    await expectRefused(`update ${t} set data = '{"total": 20}'`);
    await expectRefused(`delete from ${t}`);
    await expectRefused(`truncate ${t}`);
  });
  it.each(["anon", "authenticated", "service_role"])("%s can't update, delete or truncate a roll", async (role) => {
    const n = await count("rolls");
    await asRole(role, async () => {
      await expectRefused(`update rolls set data = '{"total": 20}'`);
      await expectRefused("delete from rolls");
      await expectRefused("truncate rolls");
    });
    expect(await count("rolls")).toBe(n);
  });
  it("won't delete a room that has rolls", async () => {
    await expectRefused("delete from rooms where id = $1", [ROOM]);
  });
});

describe("row-level security", () => {
  it.each(["rooms", "room_members", "room_events", "chat_messages", "rolls", "sheet_audit", "security_flags"])("browsers can't read %s", async (t) => {
    for (const role of ["anon", "authenticated"]) expect((await asRole(role, () => db.query(`select * from ${t}`))).rows).toEqual([]);
  });
  it("browsers can't call commit_intent or insert a roll", async () => {
    for (const role of ["anon", "authenticated"]) {
      await asRole(role, async () => {
        await expectRefused("select commit_intent($1, 1, '{}', '[]', '[]', '[]', '[]', '[]')", [ROOM]);
        await expectRefused("insert into rolls (id, room_id, request_id, member_id, data) values (gen_random_uuid(), $1, 'x', gen_random_uuid(), '{}')", [ROOM]);
      });
    }
  });
  it("keeps every user's characters private", async () => {
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    await db.query("insert into auth.users values ($1), ($2)", [a, b]);
    await db.exec(`set test.uid = '${a}'`);
    await asRole("authenticated", () => db.query("insert into characters (id, owner_id, data) values (gen_random_uuid(), $1, '{}')", [a]));
    await asRole("authenticated", () => expectRefused("insert into characters (id, owner_id, data) values (gen_random_uuid(), $1, '{}')", [b]));
    expect((await asRole("authenticated", () => db.query("select * from characters"))).rows).toHaveLength(1);
    await db.exec(`set test.uid = '${b}'`);
    expect((await asRole("authenticated", () => db.query("select * from characters"))).rows).toHaveLength(0);
    expect((await asRole("anon", () => db.query("select * from characters").catch(() => ({ rows: [] })))).rows).toHaveLength(0);
  });
});
