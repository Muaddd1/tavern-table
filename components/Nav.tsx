"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Hit = { name: string; type: string; href: string };
let index: Promise<Hit[]> | null = null;
// Spells and monsters are large, so they load on the first search.
const loadIndex = () => (index ??= Promise.all([import("@/data/srd/spells.json"), import("@/data/srd/monsters.json"), import("@/data/srd/feats.json"), import("@/data/srd/conditions.json"), import("@/data/srd/items.json"), import("@/data/srd/classes.json"), import("@/data/srd/species.json")]).then(([sp, mo, fe, co, it, cl, ss]) => {
  const list = (tab: string, type: string, rows: unknown) => (rows as { id: string; name: string }[]).map((r) => ({ name: r.name, type, href: `/rules?tab=${tab}&q=${encodeURIComponent(r.name)}` }));
  return [...list("classes", "Class", cl.default), ...list("species", "Species", ss.default), ...list("conditions", "Condition", co.default), ...list("feats", "Feat", fe.default), ...list("spells", "Spell", sp.default), ...list("monsters", "Monster", mo.default), ...list("items", "Item", it.default)];
}));

export function Nav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <nav aria-label="Main" className="border-b border-line bg-black/30">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <Link href="/" className="font-display text-base font-bold tracking-wide text-gold">Tavern Table</Link>
        <Link href="/characters" className="py-2 hover:text-ember">Characters</Link>
        <Link href="/play" className="py-2 hover:text-ember">Play</Link>
        <Link href="/dice" className="py-2 hover:text-ember">Dice</Link>
        <Link href="/rules" className="py-2 hover:text-ember">Rules</Link>
        <Link href="/tutorial" className="py-2 hover:text-ember">Tutorial</Link>
        <Link href="/settings" className="py-2 hover:text-ember">Settings</Link>
        <Link href="/account" className="py-2 hover:text-ember">Account</Link>
        <button onClick={() => setOpen(true)} className="ml-auto min-h-10 rounded-md border border-line px-3 text-parch/70 hover:bg-white/5">Search <kbd className="ml-1 hidden text-xs text-parch/40 sm:inline">Ctrl K</kbd></button>
      </div>
      {open && <Search close={() => setOpen(false)} />}
    </nav>
  );
}

function Search({ close }: { close: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); loadIndex().then(setAll); }, []);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return all.filter((h) => h.name.toLowerCase().includes(t)).sort((a, b) => a.name.toLowerCase().indexOf(t) - b.name.toLowerCase().indexOf(t)).slice(0, 12);
  }, [q, all]);
  const go = (h?: Hit) => { if (h) { router.push(h.href); close(); } };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4 pt-20" onClick={close} role="dialog" aria-label="Search the rules">
      <div className="mx-auto max-w-xl rounded-lg border border-line bg-panel p-3" onClick={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search spells, monsters, conditions, feats, items..." aria-label="Search"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); } if (e.key === "Enter") go(hits[active]); }}
          className="w-full rounded-md border border-line bg-black/30 px-3 py-2 text-parch" />
        <ul className="mt-2 max-h-80 overflow-auto">
          {hits.map((h, i) => (
            <li key={`${h.type}${h.name}`}><button onClick={() => go(h)} className={`flex w-full justify-between rounded px-3 py-2 text-left text-sm ${i === active ? "bg-white/10" : ""}`}><span>{h.name}</span><span className="text-parch/40">{h.type}</span></button></li>
          ))}
          {q && !hits.length && <li className="px-3 py-2 text-sm text-parch/50">Nothing found.</li>}
        </ul>
      </div>
    </div>
  );
}
