"use client";
// Plays server rolls: 3D on the overlay (or table), or a quick 2D card with fast rolls on.
// Either way the numbers come from the server's result and never from the physics.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RollResult } from "@/lib/dice/notation";
import { simulateThrow } from "@/lib/dice/physics";
import { percentileParts } from "@/lib/dice/shapes";
import { useSettings, wantsFastRolls } from "@/lib/settings";
import { faceLabels, type ThrownDie } from "./DiceLayer";
import { playDiceClicks } from "./sound";

const DiceOverlay = dynamic(() => import("./DiceOverlay"), { ssr: false });

export type ShownRoll = { id: string; who?: string; label: string; result: RollResult; color?: string; skin?: string; throwVector?: [number, number] };
type Thrown = { id: string; dice: ThrownDie[]; startedAt: number; endsAt: number };
type Card = ShownRoll & { until: number };

const Ctx = createContext<{ show: (r: ShownRoll) => void; thrown: Thrown[]; externalScene: boolean; setExternalScene: (v: boolean) => void }>({ show: () => {}, thrown: [], externalScene: false, setExternalScene: () => {} });
export const useDice = () => useContext(Ctx);

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h >>> 0; };

export async function buildThrow(r: ShownRoll): Promise<ThrownDie[]> {
  // d% rolls as two d10s; everything else is one die per value.
  const physical = r.result.dice.flatMap((d): { sides: number; value: number; kept: boolean; kind?: "tens" | "ones" }[] => {
    if (d.sides !== 100) return [{ sides: d.sides, value: d.value, kept: d.kept }];
    const { tens, ones } = percentileParts(d.value);
    return [{ sides: 10, value: tens, kept: d.kept, kind: "tens" }, { sides: 10, value: ones, kept: d.kept, kind: "ones" }];
  }).slice(0, 16);
  const sim = await simulateThrow(physical.map((d) => d.sides), r.throwVector ?? [120 + (hash(r.id) % 80), (hash(r.id) % 120) - 60], hash(r.id));
  return physical.map((d, i) => {
    const frames = sim.dice[i];
    const natural = d.sides === 20 && d.kept ? (d.value === 20 ? "gold" : d.value === 1 ? "red" : undefined) : undefined;
    return { frames, label: faceLabels(frames, { value: d.value, kind: d.kind }), skin: r.skin ?? "bone", dimmed: !d.kept, highlight: natural };
  });
}

export function DiceProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [thrown, setThrown] = useState<Thrown[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [externalScene, setExternalScene] = useState(false);
  const volume = useRef(settings.volume.dice);
  useEffect(() => { volume.current = settings.volume.dice; }, [settings.volume.dice]);

  const show = useCallback((r: ShownRoll) => {
    const hold = wantsFastRolls() ? 3500 : 5500;
    setCards((c) => [...c.slice(-3), { ...r, until: Date.now() + hold }]);
    setTimeout(() => setCards((c) => c.filter((x) => x.id !== r.id)), hold);
    if (wantsFastRolls() || !r.result.dice.length) return;
    buildThrow(r).then((dice) => {
      const startedAt = performance.now();
      const longest = Math.max(...dice.map((d) => d.frames.frames.length / 7));
      const entry = { id: r.id, dice, startedAt, endsAt: startedAt + (longest / 60) * 1000 + 3000 };
      setThrown((t) => [...t.slice(-4), entry]);
      playDiceClicks(longest, volume.current);
      setTimeout(() => setThrown((t) => t.filter((x) => x.id !== r.id)), entry.endsAt - startedAt);
    }).catch(() => undefined); // The 2D card has already shown the result.
  }, []);

  const value = useMemo(() => ({ show, thrown, externalScene, setExternalScene }), [show, thrown, externalScene]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {thrown.length > 0 && !externalScene && <DiceOverlay thrown={thrown} />}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {cards.map((c) => <RollCard key={c.id} roll={c} />)}
      </div>
    </Ctx.Provider>
  );
}

export function RollCard({ roll }: { roll: ShownRoll }) {
  const n = roll.result.natural;
  return (
    <div data-testid="roll-card" className={`max-w-md rounded-lg border bg-black/85 px-4 py-2 text-sm shadow-lg backdrop-blur ${n === 20 ? "border-gold" : n === 1 ? "border-red-500" : "border-line"}`} style={roll.color ? { borderLeftColor: roll.color, borderLeftWidth: 4 } : undefined}>
      <span className="text-parch/70">{roll.who ? `${roll.who}: ` : ""}{roll.label} </span>
      <span className="text-parch/50">[{roll.result.dice.map((d) => (d.kept ? d.value : `~${d.value}~`)).join(", ")}{roll.result.modifier ? ` ${roll.result.modifier > 0 ? "+" : ""}${roll.result.modifier}` : ""}] </span>
      <strong className="text-lg text-parch" data-testid="roll-total">{roll.result.total}</strong>
      {n === 20 && <span className="ml-2 text-gold">Natural 20!</span>}
      {n === 1 && <span className="ml-2 text-red-400">Natural 1</span>}
    </div>
  );
}
