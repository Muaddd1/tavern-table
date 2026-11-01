"use client";
import { useRef, useState } from "react";
import { useDice } from "@/components/dice/DiceProvider";
import { SKINS } from "@/components/dice/DiceLayer";
import { Button, inputClass, Panel, titleCase } from "@/components/ui";
import type { RollResult } from "@/lib/dice/notation";
import { updateSettings, useSettings } from "@/lib/settings";

const QUICK = ["1d4", "1d6", "1d8", "1d10", "d%", "1d12", "1d20", "1d20 adv", "1d20 dis", "4d6kh3"];

export default function DicePage() {
  const { show } = useDice();
  const settings = useSettings();
  const [notation, setNotation] = useState("2d6+4");
  const [error, setError] = useState("");
  const [log, setLog] = useState<{ id: string; text: string; result: RollResult }[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null);

  const roll = async (text: string, throwVector?: [number, number]) => {
    const r = await fetch("/api/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notation: text }) });
    const body = await r.json();
    if (!r.ok) { setError(body.error); return; }
    setError("");
    const id = crypto.randomUUID();
    show({ id, label: text, result: body.result, skin: settings.diceSkin, throwVector });
    setLog((l) => [{ id, text, result: body.result }, ...l].slice(0, 50));
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Dice</h1>
      <Panel title="Roll">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); roll(notation); }}>
          <input aria-label="Roll to make" className={inputClass} value={notation} onChange={(e) => setNotation(e.target.value)} placeholder="2d6+4, 4d6kh3, 1d20+6 adv" />
          <Button variant="primary" type="submit">Roll</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-1">{QUICK.map((q) => <Button key={q} onClick={() => roll(q)}>{q}</Button>)}</div>
        <div
          role="button" tabIndex={0} aria-label="Swipe here to throw the dice in that direction, or press Enter" onKeyDown={(e) => e.key === "Enter" && roll(notation)}
          onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => { if (start.current) { roll(notation, [e.clientX - start.current.x, e.clientY - start.current.y]); start.current = null; } }}
          className="mt-3 flex h-28 touch-none select-none items-center justify-center rounded-md border border-dashed border-line text-parch/60">Swipe here to throw</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>Dice:</span>
          {Object.keys(SKINS).map((s) => <Button key={s} aria-pressed={settings.diceSkin === s} className={settings.diceSkin === s ? "border-ember bg-ember/10" : ""} onClick={() => updateSettings({ diceSkin: s })}>{titleCase(s)}</Button>)}
        </div>
      </Panel>
      <Panel title="Roll log">
        {!log.length && <p className="text-sm text-parch/60">Your rolls this visit appear here.</p>}
        <ul className="space-y-1 text-sm">
          {log.map((l) => <li key={l.id}>{l.text}: <span className="text-parch/60">[{l.result.dice.map((d) => (d.kept ? d.value : `~${d.value}~`)).join(", ")}]</span> <strong>{l.result.total}</strong>{l.result.natural === 20 && <span className="text-gold"> Natural 20!</span>}{l.result.natural === 1 && <span className="text-red-300"> Natural 1</span>}</li>)}
        </ul>
      </Panel>
    </main>
  );
}
