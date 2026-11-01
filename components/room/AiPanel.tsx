"use client";
import { useState } from "react";
import { ADVENTURES } from "@/data/adventures";
import { roomToken } from "@/lib/room/useRoom";
import { getSettings } from "@/lib/settings";
import { Button, inputClass, Panel } from "../ui";

type Proposed = { label: string; intent: Record<string, unknown> };

export function AiPanel({ roomId, mode, isDm, send }: { roomId: string; mode: "ai" | "assist"; isDm: boolean; send: (i: Record<string, unknown>) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [adventure, setAdventure] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [usage, setUsage] = useState("");
  const [proposed, setProposed] = useState<Proposed[]>([]);
  const [suggestion, setSuggestion] = useState("");
  if (mode === "assist" && !isDm) return null;

  const turn = async (message?: string) => {
    setBusy(true); setNote("");
    const r = await fetch(`/api/ai/dm?room=${roomId}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${roomToken(roomId)}` }, body: JSON.stringify({ message: message || undefined, adventure: adventure || undefined }) }).catch(() => null);
    const body = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok || !body) { setNote(body?.error ?? "Couldn't reach the AI."); return; }
    if (body.limit) setUsage(`${body.used} of ${body.limit} AI messages used today`);
    if (mode === "assist") { setSuggestion(body.narration); setProposed(body.proposed ?? []); return; }
    setText("");
    // The device's own voice, so narration costs nothing extra.
    if (getSettings().narration && body.narration && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(body.narration);
      u.volume = getSettings().volume.voice;
      speechSynthesis.speak(u);
    }
  };

  return (
    <Panel title={mode === "ai" ? "AI Dungeon Master" : "AI suggestions"} className="mb-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Starter adventure" className={`${inputClass} max-w-64`} value={adventure} onChange={(e) => setAdventure(e.target.value)}>
          <option value="">Keep the current story</option>
          {ADVENTURES.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <input aria-label={mode === "ai" ? "What do you do?" : "Ask for a suggestion"} className={`${inputClass} min-w-40 flex-1`} placeholder={mode === "ai" ? "What do you do?" : "What should happen next?"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") turn(text); }} />
        <Button variant="primary" disabled={busy} onClick={() => turn(text)}>{busy ? "Thinking..." : mode === "ai" ? "Send" : "Suggest"}</Button>
      </div>
      {adventure && <p className="mt-1 text-sm text-parch/60">{ADVENTURES.find((a) => a.id === adventure)?.hook}</p>}
      {note && <p role="alert" className="mt-2 text-sm text-gold">{note}</p>}
      {usage && <p className="mt-1 text-xs text-parch/50">{usage}</p>}
      {suggestion && <p className="mt-2 whitespace-pre-line text-sm text-parch/80">{suggestion}</p>}
      {proposed.map((p, i) => <div key={i} className="mt-1 flex items-center justify-between gap-2 text-xs"><span className="break-all text-parch/70">{p.label}</span><span className="flex shrink-0 gap-1"><Button onClick={() => { send(p.intent); setProposed((x) => x.filter((_, n) => n !== i)); }}>Accept</Button><Button onClick={() => setProposed((x) => x.filter((_, n) => n !== i))}>Ignore</Button></span></div>)}
    </Panel>
  );
}
