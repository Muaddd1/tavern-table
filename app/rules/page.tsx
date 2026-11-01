"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { inputClass, titleCase } from "@/components/ui";
import { AskTheRules } from "@/components/AskTheRules";
import { PLAIN_CONDITIONS, PLAIN_MASTERY } from "@/data/srd/builder-text";

type Row = { id: string; name: string; meta?: string; official: string; plain?: string };
const TABS = ["spells", "monsters", "conditions", "classes", "species", "feats", "items", "mastery", "magic-items"] as const;
type Tab = (typeof TABS)[number];
type Raw = Record<string, unknown> & { id?: string; index?: string; name: string };

const text = (v: unknown) => (typeof v === "string" ? v : "");
const lines = (rows: unknown) => ((rows as { name: string; desc?: string }[] | undefined) ?? []).map((r) => `${r.name}. ${r.desc ?? ""}`).join("\n");

async function load(tab: Tab): Promise<Row[]> {
  const list = async <T,>(p: Promise<{ default: unknown }>) => (await p).default as T[];
  switch (tab) {
    case "spells": return (await list<Raw>(import("@/data/srd/spells.json"))).map((s) => ({ id: text(s.id), name: s.name, meta: `${s.level ? `Level ${s.level}` : "Cantrip"} ${titleCase(text(s.school))} · ${(s.classes as string[]).map(titleCase).join(", ")}`, official: `Casting Time: ${s.castingTime}. Range: ${s.range}. Duration: ${s.duration}.\n${s.description}${s.higherLevel ? `\n${s.higherLevel}` : ""}` }));
    case "monsters": return (await list<Raw>(import("@/data/srd/monsters.json"))).map((m) => {
      const sc = m.scores as Record<string, number>;
      return { id: text(m.id), name: m.name, meta: `${m.size} ${m.type}, ${m.alignment} · CR ${m.cr ?? "none"}`, official: `AC ${m.ac ?? "see below"}. HP ${m.hp ?? "see below"}${m.hitDice ? ` (${m.hitDice})` : ""}.\nSTR ${sc.str} DEX ${sc.dex} CON ${sc.con} INT ${sc.int} WIS ${sc.wis} CHA ${sc.cha}.\n${lines(m.traits)}\n${lines(m.actions)}\n${lines(m.bonusActions)}\n${lines(m.reactions)}\n${lines(m.legendaryActions)}` };
    });
    case "conditions": return (await list<Raw>(import("@/data/srd/conditions.json"))).map((c) => ({ id: text(c.id), name: c.name, official: text(c.description), plain: PLAIN_CONDITIONS[text(c.id)] }));
    case "mastery": return (await list<Raw>(import("@/data/srd/mastery.json"))).map((c) => ({ id: text(c.id), name: c.name, official: text(c.description), plain: PLAIN_MASTERY[text(c.id)] }));
    case "feats": return (await list<Raw>(import("@/data/srd/feats.json"))).map((f) => ({ id: text(f.id), name: f.name, meta: titleCase(text(f.type)), official: text(f.description) }));
    case "items": return (await list<Raw>(import("@/data/srd/items.json"))).map((i) => {
      const w = i.weapon as { dice: string; damageType: string; properties: string[]; mastery?: string } | undefined;
      const a = i.armor as { base: number; type: string } | undefined;
      return { id: text(i.id), name: i.name, meta: w ? `${w.dice} ${w.damageType} · ${w.properties.map(titleCase).join(", ")}${w.mastery ? ` · Mastery: ${titleCase(w.mastery)}` : ""}` : a ? `${titleCase(a.type)} · AC ${a.base}` : undefined, official: text(i.description) };
    });
    case "classes": return (await list<Raw & { levels: { level: number; features: { name: string; description?: string }[] }[]; hitDie: number }>(import("@/data/srd/classes.json"))).map((c) => ({ id: text(c.id), name: c.name, meta: `d${c.hitDie} Hit Die`, official: c.levels.flatMap((l) => l.features.map((f) => `Level ${l.level}: ${f.name}. ${f.description ?? ""}`)).join("\n\n") }));
    case "species": return (await list<Raw & { traits: { name: string; description?: string }[] }>(import("@/data/srd/species.json"))).map((s) => ({ id: text(s.id), name: s.name, meta: `Speed ${s.speed} ft.`, official: s.traits.map((t) => `${t.name}. ${t.description ?? ""}`).join("\n\n") }));
    case "magic-items": return (await list<Raw>(import("@/data/srd/magic-items.json"))).map((m) => ({ id: text(m.index), name: m.name, meta: (m.rarity as { name?: string } | undefined)?.name, official: Array.isArray(m.desc) ? (m.desc as string[]).join("\n") : text(m.description) || text(m.desc) }));
  }
}

function Rules() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "spells") as Tab;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const fromLink = params.get("q");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (fromLink) setQ(fromLink); }, [fromLink]);
  useEffect(() => { let live = true; load(tab).then((r) => { if (live) setRows(r); }); return () => { live = false; }; }, [tab]);
  const shown = useMemo(() => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80), [rows, q]);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Rules reference</h1>
      <AskTheRules />
      <div className="mt-3 flex flex-wrap gap-1">
        {TABS.map((t) => <button key={t} onClick={() => { setQ(""); router.replace(`/rules?tab=${t}`); }} aria-pressed={t === tab} className={`min-h-10 rounded-md px-3 text-sm ${t === tab ? "bg-ember text-ink" : "border border-line"}`}>{titleCase(t)}</button>)}
      </div>
      <input aria-label="Filter by name" className={`${inputClass} mt-3 max-w-sm`} placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-4 space-y-2">
        {shown.map((r) => (
          <li key={r.id}>
            <details open={shown.length <= 2} className="rounded-lg border border-line bg-panel px-4 py-2">
              <summary className="min-h-8 cursor-pointer py-1"><strong>{r.name}</strong>{r.meta && <span className="ml-2 text-sm text-parch/50">{r.meta}</span>}</summary>
              <div className={`mt-2 grid gap-4 text-sm ${r.plain ? "sm:grid-cols-2" : ""}`}>
                {r.plain && <div><h3 className="text-gold">In plain words</h3><p className="mt-1">{r.plain}</p></div>}
                <div>{r.plain && <h3 className="text-gold">Official wording</h3>}<p className="mt-1 whitespace-pre-line text-parch/75">{r.official || "See the SRD for the full wording."}</p></div>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && !q && <p className="mt-3 text-sm text-parch/50">Showing the first 80. Filter by name to find the rest.</p>}
    </main>
  );
}

export default function RulesPage() {
  return <Suspense><Rules /></Suspense>;
}
