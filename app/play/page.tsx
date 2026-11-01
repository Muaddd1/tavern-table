"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { saveRoomToken } from "@/lib/room/useRoom";

function Lobby() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [role, setRole] = useState("player");
  const [dmMode, setDmMode] = useState("human");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(true);
  useEffect(() => { fetch("/api/rooms").then((r) => r.json()).then((b) => setAvailable(b.available)).catch(() => undefined); }, []);
  const go = async (url: string, body: object) => {
    setBusy(true); setError("");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok || !data) { setError(data?.error ?? "Couldn't reach the server."); return; }
    saveRoomToken(data.roomId, data.token);
    router.push(`/play/${data.roomId}`);
  };
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Play together</h1>
      {!available && <p role="status" className="mt-3 rounded border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-gold">Multiplayer tables aren&apos;t switched on for this site yet, because they need a database. Characters, dice, rules and the tutorial all work now.</p>}
      <div className="mt-4 max-w-sm"><Field label="Your name at the table"><input data-testid="your-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
      {error && <p role="alert" className="mt-3 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel title="Join a table">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go("/api/rooms/join", { code, name, role }); }}>
            <Field label="6-letter invite code"><input data-testid="join-code" className={`${inputClass} uppercase tracking-widest`} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
            <Field label="Join as"><select data-testid="join-role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}><option value="player">Player</option><option value="spectator">Spectator</option></select></Field>
            <Button variant="primary" type="submit" disabled={busy || !name.trim() || code.length !== 6} data-testid="join">Join</Button>
          </form>
        </Panel>
        <Panel title="Start a table">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go("/api/rooms", { roomName, yourName: name, dmMode }); }}>
            <Field label="Campaign name"><input data-testid="room-name" className={inputClass} value={roomName} onChange={(e) => setRoomName(e.target.value)} /></Field>
            <Field label="Who runs the game?"><select className={inputClass} value={dmMode} onChange={(e) => setDmMode(e.target.value)}><option value="human">I&apos;m the Dungeon Master</option><option value="assist">I&apos;m the DM, with AI suggestions</option><option value="ai">The AI Dungeon Master</option></select></Field>
            <Button variant="primary" type="submit" disabled={busy || !name.trim() || !roomName.trim()} data-testid="create">Create</Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}

export default function PlayPage() {
  return <Suspense><Lobby /></Suspense>;
}
