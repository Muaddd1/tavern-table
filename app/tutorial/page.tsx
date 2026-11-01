"use client";
// A guided first fight, using the real rules engine and server dice: move, attack, use a class
// feature, take a hit, and rest. Nothing is saved.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDice } from "@/components/dice/DiceProvider";
import { Button, Panel } from "@/components/ui";
import { applyDamage, deriveSheet, explain, heal, longRest, newState, shortRest, spendHitDie, spendResource, type Character } from "@/lib/rules";
import { distanceFeet } from "@/lib/map/geometry";
import type { RollResult } from "@/lib/dice/notation";

const HERO: Character = {
  name: "You", classes: [{ classId: "fighter", level: 1 }], speciesId: "human", backgroundId: "soldier",
  baseScores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 }, backgroundBonus: { str: 2, con: 1 },
  feats: [{ featId: "savage-attacker" }, { featId: "skilled" }, { featId: "defense" }], skillProficiencies: ["perception", "survival", "insight"],
  equipment: [{ itemId: "chain-mail", equipped: true }, { itemId: "greatsword", equipped: true }], weaponMasteries: ["greatsword"],
};
const GRID = 9;
const GOBLIN = { name: "Goblin Warrior", ac: 15, hp: 10, toHit: 4, damage: "1d6+2" };

async function roll(notation: string): Promise<RollResult> {
  const r = await fetch("/api/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notation }) });
  return (await r.json()).result;
}

type Step = "welcome" | "move" | "attack" | "damage" | "goblin" | "secondwind" | "finish" | "rest" | "done";
const STEP_TITLE: Record<Step, string> = { welcome: "Welcome", move: "1. Moving", attack: "2. Attacking", damage: "3. Damage", goblin: "4. The goblin's turn", secondwind: "5. Class features", finish: "6. Finish the fight", rest: "7. Resting", done: "That's the game" };

export default function Tutorial() {
  const { show } = useDice();
  const sheet = useMemo(() => deriveSheet(HERO), []);
  const [state, setState] = useState(() => newState(sheet));
  const [step, setStep] = useState<Step>("welcome");
  const [me, setMe] = useState({ x: 1, y: 4 });
  const [moved, setMoved] = useState(0);
  const goblin = { x: 6, y: 4 };
  const [goblinHp, setGoblinHp] = useState(GOBLIN.hp);
  const [message, setMessage] = useState("");
  const sword = sheet.attacks.find((a) => a.id === "greatsword")!;
  const say = (r: RollResult, label: string) => show({ id: crypto.randomUUID(), label, result: r });
  const distance = distanceFeet(me, goblin);

  const tryMove = (x: number, y: number) => {
    if (step !== "move") return;
    const cost = distanceFeet(me, { x, y });
    if (x === goblin.x && y === goblin.y) { setMessage("You can't end your move in the goblin's square."); return; }
    if (moved + cost > sheet.speed.value) { setMessage(`That's ${cost} feet, and you have ${sheet.speed.value - moved} left.`); return; }
    setMe({ x, y }); setMoved(moved + cost); setMessage("");
    if (distanceFeet({ x, y }, goblin) <= 5) setStep("attack");
  };
  const attack = async (next: Step) => {
    const r = await roll(`1d20+${sword.toHit.value}`);
    say(r, "Greatsword attack");
    const natural = r.dice[0].value;
    if (natural === 1 || (natural !== 20 && r.total < GOBLIN.ac)) {
      const graze = sword.mastery?.grazeDamage ?? 0;
      setMessage(`You rolled ${r.total}, under its AC of ${GOBLIN.ac}: a miss. But a greatsword has the Graze mastery, so you still deal your Strength modifier: ${graze} damage.`);
      setGoblinHp((h) => Math.max(0, h - graze));
      setStep(next === "damage" ? "goblin" : goblinHp - graze <= 0 ? "rest" : "finish");
      return;
    }
    setMessage(`You rolled ${r.total}, which meets its AC of ${GOBLIN.ac}: a hit${natural === 20 ? ", and a Critical Hit: damage dice double" : ""}! Now roll damage.`);
    setCrit(natural === 20);
    setStep(next === "damage" ? "damage" : "finish-damage" as Step);
  };
  const [crit, setCrit] = useState(false);
  const damage = async () => {
    const r = await roll(crit ? sword.critDamage : sword.damage);
    say(r, "Greatsword damage");
    const left = Math.max(0, goblinHp - r.total);
    setGoblinHp(left);
    setMessage(`${r.total} damage. The goblin has ${left} of ${GOBLIN.hp} HP left.`);
    setStep(left === 0 ? "rest" : step === ("finish-damage" as Step) ? "finish" : "goblin");
  };
  const goblinTurn = async () => {
    const r = await roll(`1d20+${GOBLIN.toHit}`);
    say(r, "Goblin's Scimitar");
    if (r.total < sheet.ac.value) {
      setState((s) => applyDamage(s, sheet, { amount: 4 }).state);
      setMessage(`The goblin rolled ${r.total}, under your AC of ${sheet.ac.value}: a miss! To keep this lesson going, it scratches you for 4 anyway on the way past.`);
    } else {
      const d = await roll(GOBLIN.damage);
      say(d, "Goblin's damage");
      setState((s) => applyDamage(s, sheet, { amount: d.total }).state);
      setMessage(`The goblin rolled ${r.total}, reaching your AC of ${sheet.ac.value}. You take ${d.total} damage.`);
    }
    setStep("secondwind");
  };
  const secondWind = async () => {
    const r = await roll("1d10+1");
    say(r, "Second Wind");
    setState((s) => heal(spendResource(s, sheet, "second-wind"), sheet, r.total));
    setMessage(`You healed ${r.total}. That was your Bonus Action, which is separate from your action, so you can do both in one turn.`);
    setStep("finish");
  };
  const res = sheet.resources.find((r) => r.id === "second-wind")!;
  const finishing = step === "finish" || step === ("finish-damage" as Step);

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Your first fight</h1>
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div role="grid" aria-label="Practice map" className="grid w-fit gap-px rounded border border-line bg-line" style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 2.25rem))` }}>
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const x = i % GRID, y = Math.floor(i / GRID);
            const isMe = me.x === x && me.y === y, isGob = goblin.x === x && goblin.y === y && goblinHp > 0;
            return <button key={i} aria-label={isMe ? "You" : isGob ? "Goblin" : `Move to square ${x}, ${y}, ${distanceFeet(me, { x, y })} feet away`} disabled={step !== "move"} onClick={() => tryMove(x, y)} className={`flex h-9 w-9 items-center justify-center text-xs ${isMe ? "bg-ember font-bold text-ink" : isGob ? "bg-red-900 font-bold" : "bg-panel enabled:hover:bg-white/10"}`}>{isMe ? "You" : isGob ? "Gob" : ""}</button>;
          })}
        </div>
        <div className="space-y-3">
          <Panel title="You, a level 1 Fighter">
            <p className="text-sm">HP {state.hp}/{sheet.hpMax.value} · AC {sheet.ac.value} · Speed {sheet.speed.value} ft. · Second Wind {res.max - (state.resourcesUsed["second-wind"] ?? 0)}/{res.max}</p>
            <p className="text-sm text-parch/60">Goblin: HP {goblinHp}/{GOBLIN.hp} · AC {GOBLIN.ac} · {distance} ft. away</p>
          </Panel>
          <Panel title={finishing ? STEP_TITLE.finish : STEP_TITLE[step]}>
            {message && <p role="status" className="mb-2 rounded bg-black/30 p-2 text-sm text-gold">{message}</p>}
            <div className="space-y-2 text-sm text-parch/85">
              {step === "welcome" && <><p>This game runs in turns. On yours, you can move and take one action. The dice decide what happens, and the numbers on your sheet help.</p><Button variant="primary" onClick={() => setStep("move")}>Start</Button></>}
              {step === "move" && <p>Each square is 5 feet, and you can move {sheet.speed.value} feet on your turn. A greatsword reaches 5 feet, so tap a square next to the goblin. You have {sheet.speed.value - moved} feet left.</p>}
              {step === "attack" && <><p>You&apos;re in reach. To attack, you roll a d20 and add your bonus. If you match or beat the target&apos;s Armor Class, you hit.</p><p className="text-parch/60">Your bonus: {explain(sword.toHit)}</p><Button variant="primary" onClick={() => attack("damage")}>Swing your greatsword</Button></>}
              {(step === "damage" || step === ("finish-damage" as Step)) && <><p>A hit! Damage is {sword.damage}: roll two six-sided dice, add your Strength.</p><Button variant="primary" onClick={damage}>Roll damage</Button></>}
              {step === "goblin" && <><p>That was your turn. Now the goblin acts, rolling against your AC.</p><Button variant="primary" onClick={goblinTurn}>Goblin&apos;s turn</Button></>}
              {step === "secondwind" && <><p>Classes have features. As a Fighter, Second Wind heals you for 1d10 + your level, as a Bonus Action. It has limited uses that come back when you rest.</p><Button variant="primary" onClick={secondWind}>Use Second Wind</Button></>}
              {step === "finish" && <><p>It&apos;s your turn again. Finish it off! You don&apos;t need to move, since you&apos;re still in reach.</p><Button variant="primary" onClick={() => attack("finish")}>Swing again</Button></>}
              {step === "rest" && <><p>The goblin falls. Now you rest. A Short Rest takes 1 hour: spend Hit Dice to heal, and some features come back. A Long Rest takes 8 hours and restores everything.</p><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={async () => { const r = await roll("1d10"); say(r, "Hit Die"); setState((s) => shortRest(spendHitDie(s, sheet, "d10", r.total), sheet)); setMessage(`Short Rest: you spent a Hit Die and healed ${Math.max(1, r.total + sheet.mods.con.value)}. One use of Second Wind came back.`); setStep("done"); }}>Take a Short Rest</Button><Button onClick={() => { setState((s) => longRest(s, sheet)); setMessage("Long Rest: full Hit Points and every use back."); setStep("done"); }}>Take a Long Rest</Button></div></>}
              {step === "done" && <><p>That&apos;s the core of the game: move, act, roll, rest. Next, make a character of your own, or join a table.</p><div className="flex flex-wrap gap-2"><Link href="/characters/new" className="rounded-md bg-ember px-3 py-2 font-semibold text-ink">Build a character</Link><Link href="/play" className="rounded-md border border-line px-3 py-2">Join a table</Link></div></>}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
