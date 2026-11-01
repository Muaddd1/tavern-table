"use client";
import { useMemo, useState } from "react";
import { BUILT_IN_MAPS } from "@/data/maps";
import { CONDITIONS } from "@/data/srd/mechanics";
import { budget, difficulty, xpMultiplierNote } from "@/lib/rules/encounter";
import { totalLevel, type Character, type MonsterDef } from "@/lib/rules";
import { ENVIRONMENTS, type Roll, type Visibility } from "@/lib/room/types";
import type { RoomSnapshot } from "@/lib/room/useRoom";
import { Button, Field, inputClass, Panel, titleCase } from "../ui";

type Send = (i: Record<string, unknown>) => Promise<boolean>;
const SKILLS_AND_SAVES = ["save:str", "save:dex", "save:con", "save:int", "save:wis", "save:cha", "skill:perception", "skill:stealth", "skill:insight", "skill:athletics", "skill:acrobatics", "skill:investigation", "skill:survival", "skill:persuasion"];

// Original lists for the quick NPC generator.
const NPC = {
  names: ["Bram Oakhollow", "Sella Vane", "Tobin Marsh", "Iri Coldwater", "Hesk the Lame", "Maren Quill", "Dovik Ash", "Yara Thistle", "Corm Redhand", "Nessa Wren"],
  jobs: ["ferryman", "grave-digger", "herbalist", "tax collector", "retired soldier", "innkeeper", "smuggler", "candle maker", "wandering priest", "rat catcher"],
  traits: ["never looks you in the eye", "laughs at the wrong moments", "keeps a small lizard in a pocket", "speaks only in a whisper", "counts everything twice", "is missing two fingers and tells a new story about it each time"],
  wants: ["wants a debt forgiven", "is hiding a relative from the law", "needs someone to deliver a sealed letter", "is afraid of what's under the well", "wants revenge on a local noble", "will pay well for quiet news"],
};
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function RollFeed({ rolls, members }: { rolls: Roll[]; members: { id: string; name: string }[] }) {
  const [who, setWho] = useState("");
  const [kind, setKind] = useState("");
  const [nat, setNat] = useState(false);
  const shown = rolls.filter((r) => (!who || r.memberId === who) && (!kind || r.kind === kind) && (!nat || r.result.natural)).slice(-100).reverse();
  return (
    <Panel title="Live roll feed">
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by player" className={`${inputClass} max-w-40`} value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select aria-label="Filter by type" className={`${inputClass} max-w-36`} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{["attack", "damage", "save", "skill", "ability", "initiative", "death-save", "typed", "manual"].map((k) => <option key={k}>{k}</option>)}</select>
        <label className="flex min-h-10 items-center gap-1 text-sm"><input type="checkbox" checked={nat} onChange={(e) => setNat(e.target.checked)} /> Natural 20s and 1s</label>
      </div>
      <ol data-testid="dm-feed" className="mt-2 max-h-96 space-y-1 overflow-auto text-sm">
        {shown.map((r) => (
          <li key={r.id} data-testid="dm-feed-row" data-roll-id={r.id} className="rounded border-l-4 bg-black/20 px-2 py-1" style={{ borderLeftColor: r.color }}>
            <div className="flex flex-wrap justify-between gap-x-2">
              <span><strong>{members.find((m) => m.id === r.memberId)?.name ?? "Unknown"}</strong> ({r.characterLabel}): {r.label}</span>
              <strong data-testid="feed-total">{r.result.total}</strong>
            </div>
            <div className="text-xs text-parch/60">
              {r.formula} · dice [{r.result.dice.map((d) => (d.kept ? d.value : `~${d.value}~`)).join(", ")}]{r.parts.length ? ` · ${r.parts.map((p) => `${p.value >= 0 ? "+" : ""}${p.value} ${p.label}`).join(", ")}` : ""}
              {r.result.advantage !== "normal" ? ` · ${r.result.advantage}: ${[...r.advantageFrom, ...r.disadvantageFrom].join(", ")}` : ""} · {new Date(r.at).toLocaleTimeString()}
              {r.visibility !== "public" && <span className="text-gold"> · {r.visibility === "dm-only" ? "to DM only" : "DM secret"}</span>}
              {r.source === "manual" && <span className="font-bold text-red-300"> · MANUAL</span>}
              {r.source === "typed" && <span className="text-gold"> · TYPED</span>}
              {r.rerollOf && <span className="text-gold"> · RE-ROLL</span>}
              {r.result.natural === 20 && <span className="text-gold"> · natural 20</span>}{r.result.natural === 1 && <span className="text-red-300"> · natural 1</span>}
            </div>
          </li>
        ))}
        {!shown.length && <li className="text-parch/50">No rolls yet.</li>}
      </ol>
    </Panel>
  );
}

export function DmTools({ snap, send, roomId, token }: { snap: RoomSnapshot; send: Send; roomId: string; token: string }) {
  const { view } = snap;
  const members = view.members.filter((m) => !m.kicked);
  const players = members.filter((m) => m.role === "player");
  const [ask, setAsk] = useState("save:dex");
  const [targets, setTargets] = useState<string[]>([]);
  const [monsters, setMonsters] = useState<MonsterDef[]>([]);
  const [search, setSearch] = useState("");
  const [encounter, setEncounter] = useState<MonsterDef[]>([]);
  const [hiddenSpawn, setHiddenSpawn] = useState(false);
  const [npc, setNpc] = useState("");
  const [handout, setHandout] = useState({ title: "", body: "" });
  const [monsterAttack, setMonsterAttack] = useState({ tokenId: "", targetTokenId: "", name: "Attack", toHit: 4, damage: "1d6+2", damageType: "slashing" });
  const [secret, setSecret] = useState("1d20");
  const loadMonsters = () => { if (!monsters.length) import("@/data/srd/monsters.json").then((m) => setMonsters(m.default as unknown as MonsterDef[])); };
  const found = useMemo(() => (search ? monsters.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8) : []), [search, monsters]);
  const levels = view.full ? Object.values(view.full).filter((s) => s.approved && players.some((p) => p.id === s.memberId)).map((s) => totalLevel(s.character)) : [];
  const xp = encounter.reduce((n, m) => n + (m.xp ?? 0), 0);
  const spawn = async (m: MonsterDef, i: number) => send({ type: "token_add", name: m.name, x: Math.min(view.map.width - 1, 12 + (i % 6)), y: 4 + Math.floor(i / 6), hp: m.hp ?? undefined, ac: m.ac ?? undefined, hidden: hiddenSpawn, monsterId: m.id });
  const flags = snap.flags ?? [];
  const monstersOnMap = view.tokens.filter((t) => !t.memberId);

  return (
    <div className="space-y-3">
      <Panel title="Invite and table rules">
        <p className="text-sm">Code: <strong data-testid="invite-code" className="tracking-widest text-gold">{view.inviteCode}</strong> · <button className="underline" onClick={() => navigator.clipboard?.writeText(`${location.origin}/play?code=${view.inviteCode}`)}>Copy invite link</button></p>
        <div className="mt-2 grid gap-1 text-sm">
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={view.sheetsLocked} onChange={(e) => send({ type: "settings", sheetsLocked: e.target.checked })} /> Lock all sheets</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={view.allowManualDice} onChange={(e) => send({ type: "settings", allowManualDice: e.target.checked })} /> Allow physical dice (marked MANUAL)</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={view.autoApplyDamage} onChange={(e) => send({ type: "settings", autoApplyDamage: e.target.checked })} /> Apply damage automatically</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={view.paused} onChange={(e) => send({ type: "settings", paused: e.target.checked })} /> Pause the game</label>
        </div>
      </Panel>

      <Panel title="Players">
        <ul className="space-y-2 text-sm">
          {members.filter((m) => m.id !== view.me.id).map((m) => {
            const seat = view.full?.[m.id];
            return (
              <li key={m.id} className="rounded border border-line p-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{m.name}</strong> <span className="text-parch/50">{m.role}{seat ? ` · ${seat.character.name}, AC ${seat.sheet.ac.value}, HP ${seat.session.hp}/${seat.sheet.hpMax.value}` : ""}</span></span></div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {seat && !seat.approved && <Button variant="primary" data-testid={`approve-${m.name}`} onClick={() => send({ type: "approve_character", memberId: m.id, approved: true })}>Approve {seat.character.name}</Button>}
                  <Button onClick={() => send({ type: "member", action: m.muted ? "unmute" : "mute", memberId: m.id })}>{m.muted ? "Unmute" : "Mute"}</Button>
                  <Button variant="danger" onClick={() => { if (confirm(`Remove ${m.name} from the room?`)) send({ type: "member", action: "kick", memberId: m.id }); }}>Kick</Button>
                  {m.role === "player" && <Button onClick={() => { if (confirm(`Make ${m.name} the DM? You'll become a player.`)) send({ type: "member", action: "transfer_dm", memberId: m.id }); }}>Make DM</Button>}
                </div>
                {seat && <details className="mt-1"><summary className="min-h-8 cursor-pointer text-parch/60">Full sheet</summary><p className="text-xs text-parch/70">{Object.entries(seat.sheet.scores).map(([a, s]) => `${a.toUpperCase()} ${s.value}`).join(" · ")}<br />{seat.sheet.attacks.map((x) => `${x.name} ${x.toHit.value >= 0 ? "+" : ""}${x.toHit.value}, ${x.damage}`).join(" · ")}<br />{seat.sheet.features.map((f) => f.name).join(", ")}</p></details>}
              </li>
            );
          })}
          {members.length < 2 && <li className="text-parch/50">No one else yet. Share the code.</li>}
        </ul>
      </Panel>

      {(view.pendingDamage?.length ?? 0) > 0 && (
        <Panel title="Damage to approve">
          {view.pendingDamage!.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-auto">{p.label}: {p.amount} {p.type} to {view.tokens.find((t) => t.id === p.targetTokenId)?.name}{p.critical ? " (critical)" : ""}</span>
              <Button variant="primary" data-testid="apply-damage" onClick={() => send({ type: "decide_damage", id: p.id, apply: true })}>Apply</Button>
              <Button onClick={() => send({ type: "decide_damage", id: p.id, apply: false })}>Reject</Button>
            </div>
          ))}
        </Panel>
      )}

      {view.sheetChanges?.some((c) => c.status === "pending") && (
        <Panel title="Sheet changes to approve">
          {view.sheetChanges.filter((c) => c.status === "pending").map((c) => <SheetDiff key={c.id} id={c.id} before={c.before} after={c.after} who={members.find((m) => m.id === c.memberId)?.name ?? ""} send={send} />)}
        </Panel>
      )}

      <Panel title="Ask for a roll">
        <div className="flex flex-wrap gap-2">
          <select aria-label="Roll to ask for" data-testid="ask-roll" className={`${inputClass} max-w-48`} value={ask} onChange={(e) => setAsk(e.target.value)}>{SKILLS_AND_SAVES.map((k) => { const [t, v] = k.split(":"); return <option key={k} value={k}>{titleCase(v)} {t === "save" ? "save" : "check"}</option>; })}</select>
          <Button onClick={() => setTargets(players.map((p) => p.id))}>Everyone</Button>
          {players.map((p) => <Button key={p.id} aria-pressed={targets.includes(p.id)} className={targets.includes(p.id) ? "border-ember bg-ember/10" : ""} onClick={() => setTargets((t) => (t.includes(p.id) ? t.filter((x) => x !== p.id) : [...t, p.id]))}>{p.name}</Button>)}
          <Button variant="primary" data-testid="send-request" disabled={!targets.length} onClick={() => { const [t, v] = ask.split(":"); send({ type: "request_roll", label: `${titleCase(v)} ${t === "save" ? "save" : "check"}`, kind: t, key: v, targets }); setTargets([]); }}>Ask</Button>
        </div>
        {view.rollRequests.map((r) => <p key={r.id} className="mt-1 text-sm text-parch/70">{r.label}: {r.answered.length} of {r.targets.length} answered</p>)}
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send({ type: "roll", requestId: crypto.randomUUID(), kind: "typed", notation: secret, visibility: "dm-secret" }); }}>
          <input aria-label="Secret roll" className={`${inputClass} max-w-32`} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <Button type="submit" data-testid="secret-roll">Hidden roll</Button>
        </form>
      </Panel>

      <Panel title="Scene">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Environment"><select data-testid="environment" className={inputClass} value={view.scene.environment} onChange={(e) => send({ type: "scene", environment: e.target.value })}>{ENVIRONMENTS.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</select></Field>
          <Field label="Music"><select className={inputClass} value={view.scene.music ?? "none"} onChange={(e) => send({ type: "scene", music: e.target.value })}>{["none", "calm", "tense", "battle"].map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</select></Field>
          <Field label="Map"><select data-testid="map-select" className={inputClass} defaultValue="" onChange={(e) => { const m = BUILT_IN_MAPS.find((x) => x.id === e.target.value); if (m) send({ type: "map_set", name: m.name, width: m.width, height: m.height, walls: m.walls, dark: m.dark, fog: m.fog }); }}><option value="">Choose a built-in map</option>{BUILT_IN_MAPS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Weather"><select className={inputClass} value={view.map.weather} onChange={(e) => send({ type: "map_set", weather: e.target.value })}>{["none", "rain", "fog", "snow"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <ImagePicker label="Upload a map image" onPick={(image) => send({ type: "map_set", image })} />
          <ImagePicker label="Upload a background" onPick={(backgroundImage) => send({ type: "scene", backgroundImage })} />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={view.map.fog} onChange={(e) => send({ type: "map_set", fog: e.target.checked })} /> Fog of war</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={view.map.dark} onChange={(e) => send({ type: "map_set", dark: e.target.checked })} /> Darkness</label>
        </div>
      </Panel>

      <Panel title="Combat">
        <div className="flex flex-wrap gap-2">
          {!view.combat ? <Button variant="primary" data-testid="start-combat" onClick={() => send({ type: "start_combat" })}>Roll initiative for everyone</Button> : <Button onClick={() => send({ type: "end_combat" })}>End combat</Button>}
        </div>
        <h3 className="mt-3 text-sm text-gold">Monster attack</h3>
        <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
          <select aria-label="Attacker" data-testid="monster-attacker" className={inputClass} value={monsterAttack.tokenId} onChange={(e) => setMonsterAttack({ ...monsterAttack, tokenId: e.target.value })}><option value="">Attacker</option>{monstersOnMap.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select aria-label="Target" data-testid="monster-target" className={inputClass} value={monsterAttack.targetTokenId} onChange={(e) => setMonsterAttack({ ...monsterAttack, targetTokenId: e.target.value })}><option value="">Target</option>{view.tokens.filter((t) => t.memberId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input aria-label="Attack name" className={inputClass} value={monsterAttack.name} onChange={(e) => setMonsterAttack({ ...monsterAttack, name: e.target.value })} />
          <input aria-label="To hit" type="number" className={inputClass} value={monsterAttack.toHit} onChange={(e) => setMonsterAttack({ ...monsterAttack, toHit: +e.target.value })} />
          <input aria-label="Damage" className={inputClass} value={monsterAttack.damage} onChange={(e) => setMonsterAttack({ ...monsterAttack, damage: e.target.value })} />
          <input aria-label="Damage type" className={inputClass} value={monsterAttack.damageType} onChange={(e) => setMonsterAttack({ ...monsterAttack, damageType: e.target.value })} />
        </div>
        <Button className="mt-2" data-testid="monster-attack" disabled={!monsterAttack.tokenId || !monsterAttack.targetTokenId} onClick={() => send({ type: "monster_attack", requestId: crypto.randomUUID(), ...monsterAttack })}>Attack</Button>
      </Panel>

      <Panel title="Monsters and encounter builder">
        <input aria-label="Search the bestiary" data-testid="monster-search" className={inputClass} placeholder="Search the bestiary" value={search} onFocus={loadMonsters} onChange={(e) => setSearch(e.target.value)} />
        <label className="mt-1 flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={hiddenSpawn} onChange={(e) => setHiddenSpawn(e.target.checked)} /> Add tokens hidden</label>
        <ul className="mt-1 text-sm">{found.map((m) => <li key={m.id}><button data-testid={`add-${m.id}`} className="min-h-9 w-full rounded px-2 text-left hover:bg-white/10" onClick={() => setEncounter((x) => [...x, m])}>{m.name} <span className="text-parch/50">CR {m.cr} · {m.xp} XP · AC {m.ac} · HP {m.hp}</span></button></li>)}</ul>
        {encounter.length > 0 && (
          <div className="mt-2 text-sm">
            <p>{encounter.map((m) => m.name).join(", ")}</p>
            <p className="text-parch/70">{xp} XP total. For this party: <strong className="text-gold">{levels.length ? difficulty(levels, xp) : "no approved characters yet"}</strong>{levels.length ? ` (low ${budget(levels, "low")}, moderate ${budget(levels, "moderate")}, high ${budget(levels, "high")})` : ""}</p>
            {levels.length > 0 && <p className="text-parch/60">{xpMultiplierNote(levels.length, encounter.length)}</p>}
            <div className="mt-1 flex gap-2">
              <Button variant="primary" data-testid="place-encounter" onClick={async () => { for (const [i, m] of encounter.entries()) await spawn(m, i); setEncounter([]); setSearch(""); }}>Place on the map</Button>
              <Button onClick={() => setEncounter([])}>Clear</Button>
            </div>
          </div>
        )}
        {monstersOnMap.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {monstersOnMap.map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2"><span>{t.name} · HP {t.hp}/{t.hpMax}{t.hidden ? " · hidden" : ""}</span><span className="flex gap-1"><Button onClick={() => send({ type: "token_update", id: t.id, hidden: !t.hidden })}>{t.hidden ? "Reveal" : "Hide"}</Button><Button variant="danger" onClick={() => send({ type: "token_remove", id: t.id })}>Remove</Button></span></li>)}
          </ul>
        )}
      </Panel>

      <Panel title="NPCs and handouts">
        <Button onClick={() => { const text = `${pick(NPC.names)}, a ${pick(NPC.jobs)} who ${pick(NPC.traits)} and ${pick(NPC.wants)}.`; setNpc(text); }}>Quick NPC</Button>
        {npc && <p className="mt-2 text-sm">{npc} <button className="underline" onClick={() => send({ type: "settings", npcs: `${view.npcs ?? ""}\n${npc}`.trim() })}>Save to notes</button></p>}
        <div className="mt-3 space-y-2">
          <input aria-label="Handout title" className={inputClass} placeholder="Handout title" value={handout.title} onChange={(e) => setHandout({ ...handout, title: e.target.value })} />
          <textarea aria-label="Handout text" rows={2} className={inputClass} placeholder="Text players will see" value={handout.body} onChange={(e) => setHandout({ ...handout, body: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!handout.title} onClick={() => { send({ type: "handout", ...handout }); setHandout({ title: "", body: "" }); }}>Show to players</Button>
            <ImagePicker label="Show an image" onPick={(image) => send({ type: "handout", title: handout.title || "Image", image })} />
          </div>
        </div>
      </Panel>

      <Panel title="Notes, loot and XP">
        <Field label="Session notes (only you see these)"><textarea rows={3} className={inputClass} defaultValue={view.notes} onBlur={(e) => send({ type: "settings", notes: e.target.value })} /></Field>
        <Field label="Saved NPCs"><textarea rows={2} className={inputClass} defaultValue={view.npcs} key={view.npcs} onBlur={(e) => send({ type: "settings", npcs: e.target.value })} /></Field>
        <Field label="Loot"><textarea rows={2} className={inputClass} defaultValue={view.loot} onBlur={(e) => send({ type: "settings", loot: e.target.value })} /></Field>
        <Field label="XP or milestones awarded"><input type="number" min={0} className={inputClass} defaultValue={view.xp} onBlur={(e) => send({ type: "settings", xp: +e.target.value })} /></Field>
      </Panel>

      <Panel title={`Flags and audit (${flags.length} flags)`}>
        <ul className="max-h-48 space-y-1 overflow-auto text-xs" data-testid="flags">{[...flags].reverse().slice(0, 50).map((f) => <li key={f.id}><span className="text-gold">{f.kind}</span> · {members.find((m) => m.id === f.memberId)?.name ?? "someone"} · {f.detail} · {new Date(f.at).toLocaleTimeString()}</li>)}</ul>
        <details className="mt-2 text-sm"><summary className="min-h-8 cursor-pointer">Sheet audit history ({snap.audits?.length ?? 0})</summary>
          <ul className="max-h-48 space-y-1 overflow-auto text-xs">{[...(snap.audits ?? [])].reverse().slice(0, 100).map((a) => <li key={a.id}>{new Date(a.at).toLocaleTimeString()} · {view.members.find((m) => m.id === a.actorId)?.name} changed {view.members.find((m) => m.id === a.memberId)?.name}: {a.field}{typeof a.before === "object" && a.before && "hp" in a.before ? ` (HP ${(a.before as { hp: number }).hp} to ${(a.after as { hp: number }).hp})` : ""}</li>)}</ul>
        </details>
        <Button className="mt-2" onClick={async () => {
          const r = await fetch(`/api/rooms/${roomId}/export`, { headers: { Authorization: `Bearer ${token}` } });
          const url = URL.createObjectURL(await r.blob());
          const a = document.createElement("a"); a.href = url; a.download = `${view.name}-roll-log.json`; a.click(); URL.revokeObjectURL(url);
        }}>Export the full log</Button>
      </Panel>
    </div>
  );
}

function SheetDiff({ id, before, after, who, send }: { id: string; before: Character; after: Character; who: string; send: Send }) {
  const diffs = useMemo(() => {
    const out: string[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof Character>;
    for (const k of keys) if (JSON.stringify(before[k]) !== JSON.stringify(after[k]) && k !== "details") out.push(`${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
    return out;
  }, [before, after]);
  return (
    <div className="rounded border border-line p-2 text-sm">
      <p>{who} wants to change:</p>
      <ul className="my-1 break-words text-xs text-parch/70">{diffs.map((d) => <li key={d}>{d}</li>)}</ul>
      <div className="flex gap-2"><Button variant="primary" onClick={() => send({ type: "decide_sheet_change", id, approve: true })}>Approve</Button><Button onClick={() => send({ type: "decide_sheet_change", id, approve: false })}>Reject</Button></div>
    </div>
  );
}

// Images travel inside room state for now, so they're shrunk first.
// ponytail: images live in the room's JSON, move them to Supabase Storage for bigger maps.
function ImagePicker({ label, onPick }: { label: string; onPick: (dataUrl: string) => void }) {
  const [error, setError] = useState("");
  const load = (f: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setError("Use a PNG, JPEG or WebP image."); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.75);
      if (url.length > 2_900_000) { setError("That image is too large."); return; }
      setError(""); onPick(url); URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  return (
    <div>
      <label className="flex min-h-10 cursor-pointer items-center rounded-md border border-line px-3 text-sm hover:bg-white/5">{label}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

export type { Visibility };
export const CONDITION_IDS = Object.keys(CONDITIONS);
