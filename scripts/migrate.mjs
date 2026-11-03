// Applies supabase/migrations in order, once each. Run: node --env-file=.env.local scripts/migrate.mjs
import fs from "node:fs";
import pg from "pg";

const url = new URL(process.env.POSTGRES_URL_NON_POOLING);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");
const db = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("create table if not exists app_migrations (name text primary key, applied_at timestamptz not null default now())");
await db.query("alter table app_migrations enable row level security");
const done = new Set((await db.query("select name from app_migrations")).rows.map((r) => r.name));
for (const name of fs.readdirSync("supabase/migrations").sort()) {
  if (done.has(name)) { console.log(`skip ${name}`); continue; }
  await db.query("begin");
  try {
    await db.query(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    await db.query("insert into app_migrations (name) values ($1)", [name]);
    await db.query("commit");
    console.log(`applied ${name}`);
  } catch (e) {
    await db.query("rollback");
    console.error(`failed ${name}: ${e.message}`);
    process.exit(1);
  }
}
const tables = await db.query("select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1");
console.log(tables.rows.map((t) => `${t.tablename}:${t.rowsecurity ? "rls" : "NO-RLS"}`).join(" "));
const grants = await db.query("select grantee, table_name, privilege_type from information_schema.role_table_grants where table_name in ('rolls','sheet_audit','security_flags') and privilege_type in ('UPDATE','DELETE','TRUNCATE') and grantee in ('anon','authenticated','service_role','PUBLIC')");
console.log(`write grants left on the insert-only logs: ${grants.rows.length}`);
await db.end();
