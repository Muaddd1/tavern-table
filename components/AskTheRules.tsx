"use client";
import { useEffect, useState } from "react";
import { listCharacters, type SavedCharacter } from "@/lib/characters/store";
import { Button, inputClass, Panel } from "./ui";

export function AskTheRules() {
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<SavedCharacter[]>([]);
  const [who, setWho] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(listCharacters()); }, []);
  const ask = async () => {
    setBusy(true);
    const character = saved.find((c) => c.id === who)?.character;
    const r = await fetch("/api/ai/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, character }) }).catch(() => null);
    const body = await r?.json().catch(() => null);
    setBusy(false);
    setAnswer(body?.answer ?? body?.error ?? "Couldn't reach the server.");
  };
  return (
    <Panel title="Ask the rules" className="mt-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input aria-label="Your question" className={`${inputClass} min-w-48 flex-1`} placeholder="Can I jump 30 ft?" value={q} onChange={(e) => setQ(e.target.value)} />
        {saved.length > 0 && <select aria-label="Use this character's numbers" className={`${inputClass} max-w-48`} value={who} onChange={(e) => setWho(e.target.value)}><option value="">No character</option>{saved.map((c) => <option key={c.id} value={c.id}>{c.character.name}</option>)}</select>}
        <Button type="submit" variant="primary" disabled={busy || q.trim().length < 3}>{busy ? "Thinking..." : "Ask"}</Button>
      </form>
      {answer && <p role="status" className="mt-2 whitespace-pre-line text-sm text-parch/85">{answer}</p>}
    </Panel>
  );
}
