// Tries to tamper with the real database, as a browser and as the server would.
// Run: node --env-file=.env.local scripts/check-live-db.mjs   Exits non-zero if anything gets through.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let bad = 0;
const check = (label, ok) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) bad++; };

const { data: sample } = await service.from("rolls").select("id, data").limit(1).single();
check("there is a logged roll to test against", !!sample);

for (const t of ["rooms", "room_members", "room_events", "chat_messages", "rolls", "sheet_audit", "security_flags", "characters", "reports", "app_migrations"]) {
  const { data } = await anon.from(t).select("*").limit(1);
  check(`browser key reads nothing from ${t}`, !data?.length);
}
const a = await anon.from("rolls").update({ data: { total: 20 } }).eq("id", sample.id).select();
check("browser key can't edit a roll", !!a.error || !a.data?.length);
const b = await anon.from("rolls").delete().eq("id", sample.id).select();
check("browser key can't delete a roll", !!b.error || !b.data?.length);
const c = await anon.rpc("commit_intent", { p_room: sample.id, p_expected: 0, p_state: {}, p_events: [], p_rolls: [], p_audits: [], p_flags: [], p_chat: [] });
check("browser key can't call commit_intent", !!c.error);
const d = await service.from("rolls").update({ data: { total: 20 } }).eq("id", sample.id).select();
check("server key can't edit a roll", !!d.error);
const e = await service.from("rolls").delete().eq("id", sample.id).select();
check("server key can't delete a roll", !!e.error);
const { data: after } = await service.from("rolls").select("data").eq("id", sample.id).single();
check("the roll is unchanged", JSON.stringify(after.data) === JSON.stringify(sample.data));
process.exit(bad ? 1 : 0);
