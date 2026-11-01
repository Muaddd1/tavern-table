"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SheetView, type RollAsk } from "@/components/CharacterSheet";
import { useDice } from "@/components/dice/DiceProvider";
import { CONDITION_IDS, DmTools, RollFeed } from "@/components/room/DmTools";
import { AiPanel } from "@/components/room/AiPanel";
import { Button, Field, inputClass, Panel, titleCase } from "@/components/ui";
import { listCharacters } from "@/lib/characters/store";
import { deriveSheet, turnGuide, type Character, type SpellDef } from "@/lib/rules";
import { applyVolumes, playScene, stopScene } from "@/lib/room/audio";
import type { Roll, Visibility } from "@/lib/room/types";
import { roomToken, useRoom, type RoomSnapshot } from "@/lib/room/useRoom";
import { useSettings } from "@/lib/settings";

const BattleMap = dynamic(() => import("@/components/room/BattleMap").then((m) => m.BattleMap), { ssr: false, loading: () => <p className="p-4 text-parch/60">Loading map...</p> });
const TableScene = dynamic(() => import("@/components/room/TableScene"), { ssr: false, loading: () => <p className="p-4 text-parch/60">Loading the table...</p> });

const TABS = ["Scene", "Party", "Sheet", "Chat", "DM"] as const;
type Tab = (typeof TABS)[number];
type Send = (i: Record<string, unknown>) => Promise<boolean>;

/* eslint-disable @next/next/no-img-element -- portraits and handouts are user data URLs */
export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { show } = useDice();
  const showRoll = useCallback((r: Roll) => {
    show({ id: r.id, who: r.characterLabel, label: r.label, result: r.result, color: r.color, skin: r.skin, throwVector: r.throwVector });
  }, [show]);
  const { snap, error, toasts, send, toast } = useRoom(id, showRoll);
  const [tab, setTab] = useState<Tab>("Scene");
  const [sound, setSound] = useState(false);
  const settings = useSettings();

  const env = snap?.view.scene;
  useEffect(() => { if (sound && env) playScene(env.environment, env.music, env.startAt, env.musicAudio); }, [sound, env]);
  useEffect(() => { applyVolumes(); }, [settings.volume]);
  useEffect(() => () => stopScene(), []);

  if (error) return <main className="mx-auto max-w-xl p-8"><p role="alert">{error}</p><Link className="mt-3 inline-block underline" href="/play">Back to the lobby</Link></main>;
  if (!snap) return <main className="p-8 text-parch/60">Joining the table...</main>;
  const { view } = snap;
  const isDm = view.me.role === "dm";
  const tabs = TABS.filter((t) => t !== "DM" || isDm);

  return (
    <main className="mx-auto max-w-[1500px] px-2 py-2 sm:px-4">
      <header className="flex flex-wrap items-center gap-2 px-1 py-1">
        <h1 className="mr-auto font-display text-lg text-gold">{view.name}</h1>
        {view.paused && <span className="rounded bg-red-500/20 px-2 py-1 text-sm text-red-200">Paused</span>}
        {view.combat && <span className="text-sm text-parch/70">Round {view.combat.round}</span>}
        <Button onClick={() => { setSound((s) => { if (s) stopScene(); return !s; }); }}>{sound ? "Sound off" : "Sound on"}</Button>
        {!isDm && <Button onClick={() => { send({ type: "safety_signal", kind: "pause" }); toast("The DM was told, without your name."); }}>Pause / skip this</Button>}
      </header>

      <div role="tablist" className="flex gap-1 px-1 pb-2 lg:hidden">
        {tabs.map((t) => <button key={t} role="tab" aria-selected={t === tab} onClick={() => setTab(t)} className={`min-h-10 flex-1 rounded-md text-sm ${t === tab ? "bg-ember text-ink" : "border border-line"}`}>{t}</button>)}
      </div>

      <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)_340px]">
        <div className={tab === "Party" ? "" : "hidden lg:block"}><PartyPanel snap={snap} send={send} /></div>
        <div className={`min-w-0 space-y-3 ${tab === "Scene" ? "" : "hidden lg:block"}`}>
          <RollRequests snap={snap} send={send} />
          <Reactions snap={snap} send={send} />
          <SceneView snap={snap} send={send} />
          <Handouts snap={snap} />
        </div>
        <div className={`min-w-0 space-y-3 ${tab === "Sheet" || tab === "DM" ? "" : "hidden lg:block"} lg:max-h-[86vh] lg:overflow-auto`}>
          <div className={tab === "DM" ? "hidden lg:block" : ""}><TableSheet snap={snap} send={send} /></div>
          {isDm && <div className={tab === "DM" ? "" : "hidden lg:block"}><RollFeed rolls={snap.rolls} members={view.members} /><div className="mt-3"><DmTools snap={snap} send={send} roomId={id} token={roomToken(id) ?? ""} /></div></div>}
        </div>
        <div className={`lg:col-span-3 ${tab === "Chat" ? "" : "hidden lg:block"}`}>
          {view.dmMode !== "human" && <AiPanel roomId={id} mode={view.dmMode} isDm={isDm} send={send} />}
          <ChatPanel snap={snap} send={send} />
        </div>
      </div>

      <div aria-live="polite" className="pointer-events-none fixed right-3 top-16 z-50 flex w-72 flex-col gap-2">
        {toasts.map((t) => <div key={t.id} data-testid="toast" className={`rounded-md border bg-black/90 px-3 py-2 text-sm ${t.tone === "alert" ? "border-red-500 text-red-200" : "border-line"}`}>{t.text}</div>)}
      </div>
    </main>
  );
}

function PartyPanel({ snap, send }: { snap: RoomSnapshot; send: Send }) {
  const { view, presence } = snap;
  const [now, setNow] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNow(Date.now()); }, [presence]);
  const status = (id: string) => {
    const p = presence[id];
    if (!p || now - p.at > 40000) return { text: "disconnected", color: "#6b6258" };
    return p.idle ? { text: "idle", color: "#e5c07b" } : { text: "online", color: "#7bc47f" };
  };
  const currentId = view.combat?.order[view.combat.turn]?.memberId;
  const isMyTurn = currentId === view.me.id;
  return (
    <div className="space-y-3">
      <Panel title="Party">
        <ul className="space-y-2" data-testid="party">
          {view.members.filter((m) => !m.kicked).map((m) => {
            const seat = view.seats.find((s) => s.memberId === m.id);
            const st = status(m.id);
            return (
              <li key={m.id} className={`rounded-md p-1.5 ${currentId === m.id ? "bg-ember/15 ring-1 ring-ember" : ""}`}>
                <div className="flex items-center gap-2">
                  {seat?.portrait ? <img src={seat.portrait} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-ink" style={{ background: m.color }}>{m.name.slice(0, 2)}</span>}
                  <div className="min-w-0 text-sm">
                    <p className="truncate">{seat?.name ?? m.name}</p>
                    <p className="flex items-center gap-1 text-xs text-parch/50"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: st.color }} />{m.name} · {m.role === "dm" ? "DM" : m.role} · <span data-testid={`status-${m.name}`}>{st.text}</span></p>
                  </div>
                </div>
                {seat && (
                  <>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-black/50" role="img" aria-label={`${seat.hp} of ${seat.hpMax} hit points`}><div className="h-full" style={{ width: `${Math.min(100, (seat.hp / seat.hpMax) * 100)}%`, background: seat.hp / seat.hpMax > 0.5 ? "#7bc47f" : seat.hp / seat.hpMax > 0.25 ? "#e5c07b" : "#e06c75" }} /></div>
                    <p className="text-xs text-parch/60">{seat.hp}/{seat.hpMax} HP{seat.tempHp ? ` +${seat.tempHp}` : ""}{seat.conditions.length ? ` · ${seat.conditions.join(", ")}` : ""}{!seat.approved ? " · awaiting the DM" : ""}{seat.hp === 0 ? ` · death saves ${seat.deathSaves.successes}/${seat.deathSaves.failures}` : ""}{seat.dead ? " · dead" : ""}</p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      {view.combat && (
        <Panel title={`Initiative · round ${view.combat.round}`}>
          <ol className="space-y-1 text-sm" data-testid="initiative">
            {view.combat.order.map((o, i) => <li key={o.id} className={`flex justify-between rounded px-2 py-1 ${i === view.combat!.turn ? "bg-ember/20" : ""}`}><span>{o.name}</span><span>{o.initiative}</span></li>)}
          </ol>
          {(isMyTurn || view.me.role === "dm") && <Button variant="primary" className="mt-2 w-full" data-testid="end-turn" onClick={() => send({ type: "end_turn" })}>End turn</Button>}
        </Panel>
      )}
    </div>
  );
}

function RollRequests({ snap, send }: { snap: RoomSnapshot; send: Send }) {
  const mine = snap.view.rollRequests.filter((r) => r.targets.includes(snap.view.me.id) && !r.answered.includes(snap.view.me.id));
  if (!mine.length) return null;
  return (
    <Panel title="The DM asks for a roll">
      <div className="flex flex-wrap gap-2">{mine.map((r) => <Button key={r.id} variant="primary" data-testid="answer-request" onClick={() => send({ type: "roll", requestId: crypto.randomUUID(), kind: r.kind, key: r.key, rollRequestId: r.id })}>Roll {r.label}</Button>)}</div>
    </Panel>
  );
}

function Reactions({ snap, send }: { snap: RoomSnapshot; send: Send }) {
  const list = snap.view.reactions;
  if (!list.length) return null;
  return (
    <Panel title="Use your Reaction?">
      {list.map((r) => <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="reaction"><span className="mr-auto">{r.text}</span><Button variant="primary" onClick={() => send({ type: "reaction_answer", id: r.id, use: true })}>Yes</Button><Button onClick={() => send({ type: "reaction_answer", id: r.id, use: false })}>No</Button></div>)}
    </Panel>
  );
}

function SceneView({ snap, send }: { snap: RoomSnapshot; send: Send }) {
  const [mode, setMode] = useState<"map" | "table">("map");
  const [target, setTarget] = useState<string>();
  const set = useCallback((t: string) => { setTarget(t); window.dispatchEvent(new CustomEvent("tavern-target", { detail: t })); }, []);
  return (
    <Panel>
      <div className="mb-2 flex gap-1">
        <Button aria-pressed={mode === "map"} data-testid="view-map" className={mode === "map" ? "border-ember bg-ember/10" : ""} onClick={() => setMode("map")}>Battle map</Button>
        <Button aria-pressed={mode === "table"} data-testid="view-table" className={mode === "table" ? "border-ember bg-ember/10" : ""} onClick={() => setMode("table")}>3D table</Button>
      </div>
      {mode === "map" ? <BattleMap view={snap.view} send={send} onSelect={set} selectedTarget={target} /> : <TableScene view={snap.view} />}
    </Panel>
  );
}

function Handouts({ snap }: { snap: RoomSnapshot }) {
  const list = snap.view.handouts;
  if (!list.length) return null;
  return (
    <Panel title="Handouts">
      <ul className="space-y-2 text-sm">{[...list].reverse().map((h) => <li key={h.id}><strong>{h.title}</strong>{h.body && <p className="whitespace-pre-line text-parch/80">{h.body}</p>}{h.image && <img src={h.image} alt={h.title} className="mt-1 max-h-64 rounded" />}</li>)}</ul>
    </Panel>
  );
}

function TableSheet({ snap, send }: { snap: RoomSnapshot; send: Send }) {
  const { view } = snap;
  const seat = view.mine;
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [attack, setAttack] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [guide, setGuide] = useState(false);
  const [manual, setManual] = useState({ label: "", value: 10 });
  const [saved, setSaved] = useState<{ id: string; character: Character }[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSaved(listCharacters()); }, []);
  useEffect(() => {
    const onTarget = (e: Event) => setTarget((e as CustomEvent<string>).detail);
    window.addEventListener("tavern-target", onTarget);
    return () => window.removeEventListener("tavern-target", onTarget);
  }, []);
  const guideData = useMemo(() => (seat ? turnGuide(seat.sheet, seat.session) : null), [seat]);

  if (view.me.role === "spectator") return <Panel title="Spectating"><p className="text-sm text-parch/70">You can watch, and chat out of character.</p></Panel>;
  if (!seat) {
    return (
      <Panel title="Bring a character">
        {!saved.length && <p className="text-sm text-parch/70">You have no saved characters in this browser. <Link className="underline" href="/characters/new">Build one</Link>, then come back: your seat here is kept.</p>}
        <ul className="space-y-1">{saved.map((c) => <li key={c.id}><Button className="w-full text-left" data-testid={`bring-${c.character.name}`} onClick={() => send({ type: "set_character", character: c.character })}>Bring {c.character.name}</Button></li>)}</ul>
      </Panel>
    );
  }
  const { sheet, session } = seat;
  const onRoll = (ask: RollAsk) => {
    if (ask.kind === "attack") { setAttack(ask.attackId); return; }
    send({ type: "roll", requestId: crypto.randomUUID(), kind: ask.kind, key: ask.key, visibility });
  };
  const tokens = view.tokens.filter((t) => t.memberId !== view.me.id);
  return (
    <div className="space-y-3">
      {!seat.approved && <p className="rounded border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">Waiting for the DM to approve {seat.character.name}.</p>}
      <Panel title={seat.character.name}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span data-testid="my-hp">HP {session.hp}/{sheet.hpMax.value}{session.tempHp ? ` +${session.tempHp} temp` : ""}</span>
          <Button onClick={() => { const n = prompt("Damage taken?"); if (n && +n > 0) send({ type: "session_change", change: { kind: "damage", amount: +n } }); }}>Damage</Button>
          <Button onClick={() => { const n = prompt("Hit points healed?"); if (n && +n > 0) send({ type: "session_change", change: { kind: "heal", amount: +n } }); }}>Heal</Button>
          <Button onClick={() => send({ type: "session_change", change: { kind: "rest", rest: "short" } })}>Short rest</Button>
          <Button onClick={() => send({ type: "session_change", change: { kind: "rest", rest: "long" } })}>Long rest</Button>
          {session.hp === 0 && !session.dead && !session.stable && <Button variant="primary" onClick={() => send({ type: "roll", requestId: crypto.randomUUID(), kind: "death-save" })}>Death save</Button>}
        </div>
        <Button className="mt-2 w-full" data-testid="what-can-i-do" onClick={() => setGuide((g) => !g)}>What can I do this turn?</Button>
        {guide && guideData && (
          <div className="mt-2 space-y-2 text-sm" data-testid="turn-guide">
            {guideData.warnings.map((w) => <p key={w} className="text-gold">{w}</p>)}
            {([["Movement", guideData.movement], ["Actions", guideData.actions], ["Bonus Actions", guideData.bonusActions], ["Reactions", guideData.reactions]] as const).map(([title, list]) => list.length > 0 && <div key={title}><h3 className="text-gold">{title}</h3><ul className="list-inside list-disc text-parch/80">{list.map((x) => <li key={x}>{x}</li>)}</ul></div>)}
          </div>
        )}
        <Field label="Who sees your rolls"><select data-testid="visibility" className={`${inputClass} mt-1`} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}><option value="public">Everyone</option><option value="dm-only">Only the DM</option>{view.me.role === "dm" && <option value="dm-secret">Secret: only me</option>}</select></Field>
      </Panel>
      {attack && (
        <Panel title={`Attack: ${sheet.attacks.find((a) => a.id === attack)?.name}`}>
          <Field label="Target (or tap a token on the map)"><select data-testid="attack-target" className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose a target</option>{tokens.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" data-testid="attack-confirm" disabled={!target} onClick={() => { send({ type: "attack", requestId: crypto.randomUUID(), attackId: attack, targetTokenId: target, visibility }); setAttack(null); }}>Roll to hit</Button>
            <Button onClick={() => { send({ type: "attack_cancelled" }); setAttack(null); }}>Cancel</Button>
          </div>
        </Panel>
      )}
      <SpellPanel character={seat.character} target={target} visibility={visibility} send={send} />
      <SheetView sheet={sheet} onRoll={onRoll} compact />
      {sheet.resources.length > 0 && (
        <Panel title="Resources">
          <ul className="space-y-1 text-sm">{sheet.resources.map((r) => { const left = r.max - (session.resourcesUsed[r.id] ?? 0); return <li key={r.id} className="flex items-center justify-between gap-2"><span>{r.name}: {left}/{r.max}{r.die ? ` (d${r.die})` : ""}</span><Button disabled={left <= 0} onClick={() => send({ type: "session_change", change: { kind: "resource", id: r.id } })}>Use</Button></li>; })}</ul>
        </Panel>
      )}
      {(sheet.spellcasting.slots.some((n) => n > 0) || sheet.spellcasting.pact) && (
        <Panel title="Spell slots">
          <div className="flex flex-wrap gap-1">
            {sheet.spellcasting.slots.map((n, i) => n > 0 && <Button key={i} disabled={session.slotsUsed[i] >= n} onClick={() => send({ type: "session_change", change: { kind: "slot", level: i + 1 } })}>Level {i + 1}: {n - session.slotsUsed[i]}/{n}</Button>)}
            {sheet.spellcasting.pact && <Button disabled={session.pactUsed >= sheet.spellcasting.pact.count} onClick={() => send({ type: "session_change", change: { kind: "slot", level: sheet.spellcasting.pact!.level } })}>Pact level {sheet.spellcasting.pact.level}: {sheet.spellcasting.pact.count - session.pactUsed}/{sheet.spellcasting.pact.count}</Button>}
          </div>
          {session.concentration && <p className="mt-2 text-sm">Concentrating on {session.concentration}. <button className="underline" onClick={() => send({ type: "session_change", change: { kind: "concentrate", spellId: null } })}>End it</button></p>}
        </Panel>
      )}
      <Panel title="Conditions">
        <div className="flex flex-wrap gap-1">{CONDITION_IDS.filter((c) => c !== "exhaustion").map((c) => { const on = session.conditions.includes(c); return <button key={c} aria-pressed={on} onClick={() => send({ type: "session_change", change: { kind: "condition", id: c, on: !on } })} className={`min-h-9 rounded-full border px-3 text-xs ${on ? "border-ember bg-ember/20" : "border-line"}`}>{titleCase(c)}</button>; })}</div>
      </Panel>
      <Panel title="Equipment">
        <ul className="text-sm">{seat.character.equipment.map((e) => <li key={e.itemId}><label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={!!e.equipped} onChange={(x) => send({ type: "session_change", change: { kind: "equip", itemId: e.itemId, equipped: x.target.checked } })} /> {titleCase(e.itemId)}</label></li>)}</ul>
      </Panel>
      {view.allowManualDice && (
        <Panel title="Physical dice">
          <p className="text-xs text-parch/60">The DM allows this. Entries are marked MANUAL.</p>
          <div className="mt-1 flex gap-2"><input aria-label="What you rolled for" className={inputClass} placeholder="What for" value={manual.label} onChange={(e) => setManual({ ...manual, label: e.target.value })} /><input aria-label="Result" type="number" className={`${inputClass} w-20`} value={manual.value} onChange={(e) => setManual({ ...manual, value: +e.target.value })} /><Button disabled={!manual.label} onClick={() => send({ type: "manual_roll", requestId: crypto.randomUUID(), ...manual })}>Enter</Button></div>
        </Panel>
      )}
      <SheetChangeButton seat={seat.character} saved={saved} send={send} />
    </div>
  );
}

function SpellPanel({ character, target, visibility, send }: { character: Character; target: string; visibility: Visibility; send: Send }) {
  const [spells, setSpells] = useState<SpellDef[]>([]);
  const mine = character.spells;
  useEffect(() => { if (mine?.length) import("@/data/srd/spells.json").then((m) => setSpells(m.default as unknown as SpellDef[])); }, [mine?.length]);
  if (!mine?.length) return null;
  return (
    <Panel title="Spells">
      <p className="mb-1 text-xs text-parch/50">Choose a target first if the spell needs one, on the map or from an attack.</p>
      <ul className="space-y-1 text-sm">
        {mine.map((m) => {
          const s = spells.find((x) => x.id === m.spellId);
          if (!s) return null;
          return (
            <li key={`${m.classId}:${m.spellId}`} className="flex flex-wrap items-center justify-between gap-1">
              <span title={s.description}>{s.name} <span className="text-parch/40">{s.level ? `L${s.level}` : "cantrip"}{s.concentration ? " · C" : ""}</span></span>
              <span className="flex gap-1">
                {s.ritual && <Button onClick={() => send({ type: "cast_spell", requestId: crypto.randomUUID(), spellId: s.id, classId: m.classId, ritual: true, visibility })}>Ritual</Button>}
                <Button data-testid={`cast-${s.id}`} onClick={() => send({ type: "cast_spell", requestId: crypto.randomUUID(), spellId: s.id, classId: m.classId, targetTokenId: target || undefined, visibility })}>Cast</Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SheetChangeButton({ seat, saved, send }: { seat: Character; saved: { id: string; character: Character }[]; send: Send }) {
  const same = saved.find((c) => c.character.name === seat.name);
  if (!same || JSON.stringify(same.character) === JSON.stringify(seat)) return null;
  let readable = true;
  try { deriveSheet(same.character); } catch { readable = false; }
  if (!readable) return null;
  return <Panel title="Your saved copy differs"><p className="text-sm text-parch/70">You&apos;ve changed {seat.name} outside this session. Changes to base stats need the DM&apos;s approval.</p><Button className="mt-2" onClick={() => send({ type: "request_sheet_change", after: same.character })}>Send changes to the DM</Button></Panel>;
}

function ChatPanel({ snap, send }: { snap: RoomSnapshot; send: Send }) {
  const { view, rolls, chat } = snap;
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"ic" | "ooc" | "whisper">("ooc");
  const end = useRef<HTMLDivElement>(null);
  const log = useMemo(() => [...chat.map((c) => ({ at: c.at, key: c.id, chat: c })), ...rolls.map((r) => ({ at: r.at, key: r.id, roll: r }))].sort((a, b) => a.at - b.at).slice(-150), [chat, rolls]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [log.length]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const m = t.match(/^\/r(?:oll)?\s+(.+)$/i);
    if (m) send({ type: "roll", requestId: crypto.randomUUID(), kind: "typed", notation: m[1] });
    else send({ type: "chat", mode, body: t });
    setText("");
  };
  return (
    <Panel title="Chat and roll log">
      <div className="h-48 overflow-auto rounded bg-black/20 p-2 text-sm" data-testid="roll-log" role="log">
        {log.map((x) => "roll" in x && x.roll ? (
          <p key={x.key} data-testid="log-roll" data-roll-id={x.roll.id} className="text-parch/80"><span style={{ color: x.roll.color }}>{x.roll.characterLabel}</span> {x.roll.label}: [{x.roll.result.dice.map((d) => (d.kept ? d.value : `~${d.value}~`)).join(", ")}] <strong data-testid="log-total">{x.roll.result.total}</strong></p>
        ) : "chat" in x && x.chat ? (
          <p key={x.key} className={x.chat.mode === "whisper" ? "text-gold" : x.chat.mode === "ic" ? "italic" : ""}><strong>{x.chat.name}</strong>{x.chat.mode === "whisper" ? " (whisper)" : ""}: {x.chat.body}</p>
        ) : null)}
        <div ref={end} />
      </div>
      <form className="mt-2 flex flex-wrap gap-2" onSubmit={submit}>
        <select aria-label="Chat mode" className={`${inputClass} w-44`} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="ooc">Out of character</option><option value="ic">In character</option><option value="whisper">Whisper to the DM</option></select>
        <input data-testid="chat-input" aria-label="Message, or /roll 2d6" className={`${inputClass} min-w-40 flex-1`} placeholder="Say something, or /roll 2d6+4" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" data-testid="chat-send">Send</Button>
      </form>
      {view.me.muted && <p className="mt-1 text-xs text-red-300">The DM has muted you.</p>}
    </Panel>
  );
}
