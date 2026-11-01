"use client";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { listCharacters, saveCharacter } from "@/lib/characters/store";
import type { Character } from "@/lib/rules";

export default function Account() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client: SupabaseClient | null = useMemo(() => (url && key ? createClient(url, key) : null), [url, key]);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [client]);

  if (!client) return <main className="mx-auto max-w-xl p-8"><h1 className="font-display text-2xl text-gold">Account</h1><p className="mt-3 text-parch/70">Accounts aren&apos;t turned on for this site yet. Your characters are saved in this browser, and you can export them as JSON from each character&apos;s page.</p></main>;

  const sync = async () => {
    const owner = session!.user.id;
    const local = listCharacters();
    const rows = local.map((c) => ({ id: c.id, owner_id: owner, data: c.character, updated_at: new Date(c.updatedAt).toISOString() }));
    const { error } = rows.length ? await client.from("characters").upsert(rows) : { error: null };
    if (error) { setNote(`Couldn't sync: ${error.message}`); return; }
    const { data, error: readError } = await client.from("characters").select("id, data");
    if (readError) { setNote(`Couldn't sync: ${readError.message}`); return; }
    const known = new Set(local.map((c) => c.id));
    const pulled = (data as { id: string; data: Character }[]).filter((r) => !known.has(r.id));
    for (const r of pulled) saveCharacter(r.data, r.id);
    setNote(`Synced: ${rows.length} sent, ${pulled.length} brought to this browser.`);
  };

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Account</h1>
      {!session ? (
        <Panel title="Sign in">
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } }); setNote(error ? error.message : "Check your email for a sign-in link."); }}>
            <Field label="Email"><input type="email" autoComplete="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button type="submit" variant="primary">Email me a link</Button>
          </form>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } })}>Google</Button>
            <Button onClick={() => client.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.href } })}>Discord</Button>
          </div>
        </Panel>
      ) : (
        <Panel title={session.user.email ?? "Signed in"}>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={sync}>Sync characters</Button>
            <Button onClick={() => client.auth.signOut()}>Sign out</Button>
          </div>
        </Panel>
      )}
      {note && <p role="status" className="text-sm text-gold">{note}</p>}
    </main>
  );
}
