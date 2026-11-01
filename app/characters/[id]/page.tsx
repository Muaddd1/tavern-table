"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SheetView, formula, type RollAsk } from "@/components/CharacterSheet";
import { useDice } from "@/components/dice/DiceProvider";
import { SKINS } from "@/components/dice/DiceLayer";
import { Button, Field, inputClass, Panel, titleCase } from "@/components/ui";
import { getCharacter, restoreVersion, saveCharacter, shareLink, type SavedCharacter } from "@/lib/characters/store";
import { sheetAsText } from "@/lib/rules/levelup";
import { companionFromMonster, companionInitiative, deriveSheet, type Character, type Companion, type MonsterDef, type SpellDef } from "@/lib/rules";

const TABS = ["Sheet", "Spells", "Details", "Companions", "Custom", "History"] as const;

async function serverRoll(notation: string) {
  const r = await fetch("/api/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notation }) });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? "Couldn't roll.");
  return body.result;
}

export default function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const [saved, setSaved] = useState<SavedCharacter | null | undefined>(undefined);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Sheet");
  const [note, setNote] = useState("");
  const { show } = useDice();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(getCharacter(id)); }, [id]);
  const character = saved?.character;
  const sheet = useMemo(() => { try { return character ? deriveSheet(character) : null; } catch { return null; } }, [character]);
  if (saved === undefined) return null;
  if (!saved || !character) return <main className="p-8">That character isn&apos;t saved in this browser. <Link className="underline" href="/characters">Back to your characters</Link></main>;
  if (!sheet) return <main className="p-8">This character has data this version can&apos;t read.</main>;

  const update = (patch: Partial<Character>) => {
    const next = { ...character, ...patch };
    const r = saveCharacter(next, id);
    if (!r.saved) setNote("Your browser wouldn't save that. Its storage may be full.");
    setSaved(getCharacter(id));
  };
  const onRoll = async (ask: RollAsk) => {
    const notation = formula(ask.modifier);
    try {
      const skin = character.details?.diceSkin;
      const result = await serverRoll(notation);
      show({ id: crypto.randomUUID(), label: ask.label, result, skin });
      if (ask.kind === "attack" && ask.damage.includes("d")) {
        const dmg = await serverRoll(ask.damage);
        setTimeout(() => show({ id: crypto.randomUUID(), label: `${ask.label} damage (${ask.damageType})`, result: dmg, skin }), 1200);
      }
    } catch (e) { setNote(e instanceof Error ? e.message : "Couldn't roll."); }
  };
  const copy = async (text: string, done: string) => { try { await navigator.clipboard.writeText(text); setNote(done); } catch { setNote("Your browser blocked copying."); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(character, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `${character.name || "character"}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {character.details?.portrait && <img src={character.details.portrait} alt="" className="h-16 w-16 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${character.details.themeColor ?? "#d9b36c"}` }} />}
        <div className="mr-auto">
          <h1 className="font-display text-2xl text-gold">{character.name}</h1>
          <p className="text-sm text-parch/70">Level {sheet.level} {titleCase(character.speciesId)} {character.classes.map((c) => `${titleCase(c.classId)} ${c.level}`).join(" / ")} · {titleCase(character.backgroundId)}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Link href={`/characters/${id}/level-up`}><Button variant="primary">Level up</Button></Link>
          <Button onClick={() => copy(shareLink(character, location.origin), "Share link copied. Anyone with it can read this sheet or copy it.")}>Copy share link</Button>
          <Button onClick={() => copy(sheetAsText(character, sheet), "Copied as text.")}>Copy as text</Button>
          <Button onClick={download}>Export JSON</Button>
          <Button onClick={() => print()}>Print or save as PDF</Button>
        </div>
      </div>
      {note && <p role="status" className="no-print mt-2 text-sm text-gold">{note}</p>}
      {sheet.warnings.map((w) => <p key={w.code} className="mt-2 rounded border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">{w.message}</p>)}
      <div role="tablist" className="no-print mt-4 flex flex-wrap gap-1">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)} className={`min-h-10 rounded-md px-3 text-sm ${t === tab ? "bg-ember text-ink" : "border border-line"}`}>{t}</button>)}
      </div>
      <div className="mt-4">
        {tab === "Sheet" && <SheetView sheet={sheet} onRoll={onRoll} />}
        {tab === "Spells" && <SpellsTab character={character} update={update} />}
        {tab === "Details" && <DetailsTab character={character} update={update} />}
        {tab === "Companions" && <CompanionsTab character={character} update={update} />}
        {tab === "Custom" && <CustomTab character={character} update={update} />}
        {tab === "History" && (
          <Panel title="Earlier versions">
            {!saved.versions.length && <p className="text-sm text-parch/60">No earlier versions yet. One is kept each time you change the character.</p>}
            <ul className="space-y-1">{saved.versions.map((v) => <li key={v.at} className="flex items-center justify-between gap-2 text-sm"><span>{new Date(v.at).toLocaleString()} · {v.character.name} · level {v.character.classes.reduce((n, c) => n + c.level, 0)}</span><Button onClick={() => { restoreVersion(id, v.at); setSaved(getCharacter(id)); }}>Restore</Button></li>)}</ul>
          </Panel>
        )}
      </div>
    </main>
  );
}

function SpellsTab({ character, update }: { character: Character; update: (p: Partial<Character>) => void }) {
  const [spells, setSpells] = useState<SpellDef[]>([]);
  const [q, setQ] = useState("");
  const sheet = deriveSheet(character);
  const classes = sheet.spellcasting.classes;
  const [classId, setClassId] = useState(classes[0]?.classId ?? "");
  useEffect(() => { import("@/data/srd/spells.json").then((m) => setSpells(m.default as unknown as SpellDef[])); }, []);
  const caster = classes.find((c) => c.classId === classId);
  if (!caster) return <Panel>This character doesn&apos;t cast spells from a class. The Custom tab can add other magic.</Panel>;
  const mine = character.spells ?? [];
  const has = (id: string) => mine.some((s) => s.spellId === id && s.classId === classId);
  const list = spells.filter((s) => s.classes.includes(classId) && s.level <= caster.maxSpellLevel && s.name.toLowerCase().includes(q.toLowerCase()));
  const count = mine.filter((s) => s.classId === classId);
  const cantrips = count.filter((s) => spells.find((x) => x.id === s.spellId)?.level === 0).length;
  return (
    <Panel title={`${titleCase(classId)} spells: ${count.length - cantrips} of ${caster.prepared} prepared, ${cantrips} of ${caster.cantrips} cantrips`}>
      <div className="flex flex-wrap gap-2">
        {classes.length > 1 && <select className={`${inputClass} max-w-48`} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c.classId} value={c.classId}>{titleCase(c.classId)}</option>)}</select>}
        <input className={`${inputClass} max-w-xs`} placeholder="Search spells" aria-label="Search spells" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="mt-3 grid gap-1 sm:grid-cols-2">
        {list.map((s) => (
          <li key={s.id}>
            <label className="flex min-h-10 items-center gap-2 rounded px-2 text-sm hover:bg-white/5" title={s.description}>
              <input type="checkbox" checked={has(s.id)} onChange={() => update({ spells: has(s.id) ? mine.filter((x) => !(x.spellId === s.id && x.classId === classId)) : [...mine, { spellId: s.id, classId, prepared: true }] })} />
              <span>{s.name} <span className="text-parch/40">{s.level ? `L${s.level}` : "cantrip"}{s.concentration ? " · C" : ""}{s.ritual ? " · R" : ""}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PortraitPicker({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!img || !canvas.current) return;
    const ctx = canvas.current.getContext("2d")!;
    const side = Math.min(img.width, img.height) / zoom;
    ctx.drawImage(img, (img.width - side) * pos.x, (img.height - side) * pos.y, side, side, 0, 0, 256, 256);
  }, [img, zoom, pos]);
  const load = (f: File) => {
    if (!f.type.startsWith("image/") || f.type === "image/svg+xml") return;
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0.5, y: 0.5 }); };
    i.src = URL.createObjectURL(f);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value && !img && <img src={value} alt="Current portrait" className="h-24 w-24 rounded-full object-cover" />}
        <canvas ref={canvas} width={256} height={256} className={img ? "h-32 w-32 rounded-full" : "hidden"} aria-label="Portrait preview" />
        <label className="min-h-10 cursor-pointer rounded-md border border-line px-3 py-2 text-sm">Upload picture<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        {value && <Button onClick={() => { onChange(undefined); setImg(null); }}>Remove</Button>}
      </div>
      {img && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Field label="Zoom"><input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(+e.target.value)} className="w-full" /></Field>
          <Field label="Left and right"><input type="range" min={0} max={1} step={0.01} value={pos.x} onChange={(e) => setPos((p) => ({ ...p, x: +e.target.value }))} className="w-full" /></Field>
          <Field label="Up and down"><input type="range" min={0} max={1} step={0.01} value={pos.y} onChange={(e) => setPos((p) => ({ ...p, y: +e.target.value }))} className="w-full" /></Field>
          <Button variant="primary" onClick={() => { onChange(canvas.current!.toDataURL("image/jpeg", 0.8)); setImg(null); }}>Use this crop</Button>
        </div>
      )}
    </div>
  );
}

const DETAIL_FIELDS: [keyof NonNullable<Character["details"]>, string][] = [["pronouns", "Pronouns"], ["age", "Age"], ["height", "Height"], ["alignment", "Alignment"], ["languages", "Languages"], ["allies", "Allies and enemies"], ["intro", "Intro line, shown when joining a room"]];
const LONG_FIELDS: [keyof NonNullable<Character["details"]>, string][] = [["appearance", "Appearance"], ["traits", "Personality traits"], ["ideals", "Ideals"], ["bonds", "Bonds"], ["flaws", "Flaws"], ["backstory", "Backstory"], ["notes", "Notes"]];

function DetailsTab({ character, update }: { character: Character; update: (p: Partial<Character>) => void }) {
  const d = character.details ?? {};
  const set = (patch: Partial<NonNullable<Character["details"]>>) => update({ details: { ...d, ...patch } });
  return (
    <div className="space-y-4">
      <Panel title="Portrait and token"><PortraitPicker value={d.portrait} onChange={(portrait) => set({ portrait })} /></Panel>
      <Panel title="About">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={inputClass} value={character.name} onChange={(e) => update({ name: e.target.value })} /></Field>
          {DETAIL_FIELDS.map(([k, label]) => <Field key={k} label={label}><input className={inputClass} value={(d[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value })} /></Field>)}
          <Field label="Theme color"><input type="color" className="h-10 w-20 rounded border border-line bg-transparent" value={d.themeColor ?? "#d9b36c"} onChange={(e) => set({ themeColor: e.target.value })} /></Field>
          <Field label="Favorite dice"><select className={inputClass} value={d.diceSkin ?? "bone"} onChange={(e) => set({ diceSkin: e.target.value })}>{Object.keys(SKINS).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
          <Field label="Token size in squares"><input type="number" min={1} max={4} className={inputClass} value={d.tokenSize ?? 1} onChange={(e) => set({ tokenSize: +e.target.value })} /></Field>
        </div>
        <div className="mt-3 grid gap-3">
          {LONG_FIELDS.map(([k, label]) => <Field key={k} label={label}><textarea rows={k === "backstory" ? 6 : 2} className={inputClass} value={(d[k] as string) ?? ""} onChange={(e) => set({ [k]: e.target.value })} /></Field>)}
        </div>
      </Panel>
    </div>
  );
}

function CompanionsTab({ character, update }: { character: Character; update: (p: Partial<Character>) => void }) {
  const [monsters, setMonsters] = useState<MonsterDef[]>([]);
  const [pick, setPick] = useState("");
  const [kind, setKind] = useState<Companion["kind"]>("pet");
  const [error, setError] = useState("");
  useEffect(() => { import("@/data/srd/monsters.json").then((m) => setMonsters(m.default as unknown as MonsterDef[])); }, []);
  const list = character.companions ?? [];
  const add = () => {
    const m = monsters.find((x) => x.id === pick);
    if (!m) return;
    try { update({ companions: [...list, companionFromMonster(m, { id: crypto.randomUUID(), kind })] }); setError(""); } catch (e) { setError((e as Error).message); }
  };
  const change = (id: string, patch: Partial<Companion>) => update({ companions: list.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <Panel title="Companions">
      <div className="flex flex-wrap gap-2">
        <input list="monsters" className={`${inputClass} max-w-xs`} placeholder="Find in the bestiary" aria-label="Find in the bestiary" onChange={(e) => setPick(monsters.find((m) => m.name === e.target.value)?.id ?? "")} />
        <datalist id="monsters">{monsters.map((m) => <option key={m.id} value={m.name} />)}</datalist>
        <select className={`${inputClass} max-w-40`} value={kind} aria-label="Kind" onChange={(e) => setKind(e.target.value as Companion["kind"])}>{["pet", "mount", "familiar", "summon", "sidekick", "hireling"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select>
        <Button variant="primary" disabled={!pick} onClick={add}>Add</Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      <ul className="mt-3 space-y-2">
        {list.map((c) => (
          <li key={c.id} className="rounded border border-line p-3 text-sm">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Name"><input className={inputClass} value={c.name} onChange={(e) => change(c.id, { name: e.target.value })} /></Field>
              <Field label="AC"><input type="number" className={`${inputClass} w-20`} value={c.ac} onChange={(e) => change(c.id, { ac: +e.target.value })} /></Field>
              <Field label="HP"><input type="number" className={`${inputClass} w-20`} value={c.hpMax} onChange={(e) => change(c.id, { hpMax: +e.target.value })} /></Field>
              <span className="pb-2 text-parch/60">{titleCase(c.kind)} · Initiative {companionInitiative(c) >= 0 ? "+" : ""}{companionInitiative(c)} · {c.speed} ft.</span>
              <Button variant="danger" onClick={() => update({ companions: list.filter((x) => x.id !== c.id) })}>Remove</Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// Everything here is homebrew: private to this character unless its link is shared.
function CustomTab({ character, update }: { character: Character; update: (p: Partial<Character>) => void }) {
  const [feature, setFeature] = useState({ name: "", description: "", uses: 0, recharge: "long" });
  const [attack, setAttack] = useState({ name: "", toHit: 0, damage: "1d6", damageType: "slashing" });
  const [item, setItem] = useState({ name: "", weight: 0, description: "" });
  const features = character.customFeatures ?? [];
  const attacks = character.customAttacks ?? [];
  const items = character.homebrew?.items ?? [];
  const addFeature = () => {
    const id = `custom:${crypto.randomUUID()}`;
    const effects = feature.uses > 0 ? [{ type: "resource" as const, id, name: feature.name, max: feature.uses, short: feature.recharge === "short" ? ("all" as const) : ("none" as const) }] : [];
    update({ customFeatures: [...features, { id, name: feature.name, level: 1, description: feature.description, effects }] });
    setFeature({ name: "", description: "", uses: 0, recharge: "long" });
  };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title="Custom feature or resource">
        <div className="space-y-2">
          <Field label="Name"><input className={inputClass} value={feature.name} onChange={(e) => setFeature({ ...feature, name: e.target.value })} /></Field>
          <Field label="What it does"><textarea rows={3} className={inputClass} value={feature.description} onChange={(e) => setFeature({ ...feature, description: e.target.value })} /></Field>
          <Field label="Uses (0 if it has none)"><input type="number" min={0} className={inputClass} value={feature.uses} onChange={(e) => setFeature({ ...feature, uses: +e.target.value })} /></Field>
          <Field label="Comes back after"><select className={inputClass} value={feature.recharge} onChange={(e) => setFeature({ ...feature, recharge: e.target.value })}><option value="long">Long Rest</option><option value="short">Short Rest</option></select></Field>
          <Button variant="primary" disabled={!feature.name} onClick={addFeature}>Add</Button>
        </div>
        <ul className="mt-3 text-sm">{features.map((f) => <li key={f.id} className="flex justify-between gap-2 py-1">{f.name}<button className="text-red-300" onClick={() => update({ customFeatures: features.filter((x) => x.id !== f.id) })}>Remove</button></li>)}</ul>
      </Panel>
      <Panel title="Custom attack">
        <div className="space-y-2">
          <Field label="Name"><input className={inputClass} value={attack.name} onChange={(e) => setAttack({ ...attack, name: e.target.value })} /></Field>
          <Field label="To hit"><input type="number" className={inputClass} value={attack.toHit} onChange={(e) => setAttack({ ...attack, toHit: +e.target.value })} /></Field>
          <Field label="Damage"><input className={inputClass} value={attack.damage} onChange={(e) => setAttack({ ...attack, damage: e.target.value })} /></Field>
          <Field label="Damage type"><input className={inputClass} value={attack.damageType} onChange={(e) => setAttack({ ...attack, damageType: e.target.value })} /></Field>
          <Button variant="primary" disabled={!attack.name} onClick={() => { update({ customAttacks: [...attacks, { ...attack, id: `custom:${crypto.randomUUID()}` }] }); setAttack({ name: "", toHit: 0, damage: "1d6", damageType: "slashing" }); }}>Add</Button>
        </div>
        <ul className="mt-3 text-sm">{attacks.map((a) => <li key={a.id} className="flex justify-between gap-2 py-1">{a.name}<button className="text-red-300" onClick={() => update({ customAttacks: attacks.filter((x) => x.id !== a.id) })}>Remove</button></li>)}</ul>
      </Panel>
      <Panel title="Custom item">
        <div className="space-y-2">
          <Field label="Name"><input className={inputClass} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></Field>
          <Field label="Weight (lb.)"><input type="number" min={0} className={inputClass} value={item.weight} onChange={(e) => setItem({ ...item, weight: +e.target.value })} /></Field>
          <Field label="Description"><textarea rows={3} className={inputClass} value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></Field>
          <Button variant="primary" disabled={!item.name} onClick={() => {
            const id = `custom-${crypto.randomUUID()}`;
            update({ homebrew: { ...character.homebrew, items: [...items, { id, ...item }] }, equipment: [...character.equipment, { itemId: id, equipped: false }] });
            setItem({ name: "", weight: 0, description: "" });
          }}>Add</Button>
        </div>
        <ul className="mt-3 text-sm">{items.map((i) => <li key={i.id} className="flex justify-between gap-2 py-1">{i.name}<button className="text-red-300" onClick={() => update({ homebrew: { ...character.homebrew, items: items.filter((x) => x.id !== i.id) }, equipment: character.equipment.filter((e) => e.itemId !== i.id) })}>Remove</button></li>)}</ul>
      </Panel>
    </div>
  );
}
