"use client";
// The read-side of a sheet, shared by the character page, share links and the table.
import { SKILLS } from "@/data/srd/mechanics";
import { ABILITIES, ABILITY_NAMES, formatDamage, type Ability, type Check, type Sheet } from "@/lib/rules";
import { Num, Panel, titleCase } from "./ui";

export type RollAsk = { kind: "skill" | "save" | "ability" | "initiative"; key?: string; label: string; modifier: number } | { kind: "attack"; attackId: string; label: string; modifier: number; damage: string; damageType: string };

const tag = (c: Check) => (c.advantageFrom.length ? ` (Advantage: ${c.advantageFrom.join(", ")})` : "");
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function RollButton({ ask, children, label, onRoll }: { ask: RollAsk; children: React.ReactNode; label: string; onRoll?: (r: RollAsk) => void }) {
  return onRoll ? <button onClick={() => onRoll(ask)} aria-label={`Roll ${label}`} className="flex min-h-9 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-white/10">{children}</button> : <div className="flex min-h-9 items-center justify-between gap-2 px-2 text-sm">{children}</div>;
}

export function SheetView({ sheet, onRoll, compact }: { sheet: Sheet; onRoll?: (r: RollAsk) => void; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-3" : "grid gap-4 md:grid-cols-3"}>
      <div className="space-y-3">
        <Panel title="Combat">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-parch/50">AC</dt><dd className="text-xl"><Num value={sheet.ac} /></dd></div>
            <div><dt className="text-xs text-parch/50">HP max</dt><dd className="text-xl"><Num value={sheet.hpMax} /></dd></div>
            <div><dt className="text-xs text-parch/50">Speed</dt><dd className="text-xl"><Num value={sheet.speed} suffix=" ft" /></dd></div>
            <div><dt className="text-xs text-parch/50">Proficiency</dt><dd><Num value={sheet.proficiency} signed /></dd></div>
            <div><dt className="text-xs text-parch/50">Passive Perc.</dt><dd><Num value={sheet.passivePerception} /></dd></div>
            <div><dt className="text-xs text-parch/50">Attacks</dt><dd>{sheet.attacksPerAction}</dd></div>
          </dl>
          <div className="mt-2">
            <RollButton onRoll={onRoll} label="Initiative" ask={{ kind: "initiative", label: "Initiative", modifier: sheet.initiative.value.value }}><span>Initiative{tag(sheet.initiative)}</span><Num value={sheet.initiative.value} signed /></RollButton>
          </div>
        </Panel>
        <Panel title="Attacks">
          {sheet.attacks.map((a) => (
            <RollButton onRoll={onRoll} key={a.id} label={`${a.name} attack`} ask={{ kind: "attack", attackId: a.id, label: a.name, modifier: a.toHit.value, damage: a.damage, damageType: a.damageType }}>
              <span>{a.name}{!a.proficient && <span className="text-red-300"> (no training)</span>}{a.mastery && <span className="text-parch/50"> · {titleCase(a.mastery.id)}</span>}</span>
              <span className="whitespace-nowrap"><Num value={a.toHit} signed /> · {a.damage} {a.damageType}</span>
            </RollButton>
          ))}
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel title="Abilities and saves">
          {ABILITIES.map((a: Ability) => (
            <div key={a} className="grid grid-cols-[1fr_auto] items-center">
              <RollButton onRoll={onRoll} label={`${ABILITY_NAMES[a]} check`} ask={{ kind: "ability", key: a, label: `${ABILITY_NAMES[a]} check`, modifier: sheet.mods[a].value }}><span>{ABILITY_NAMES[a]} <span className="text-parch/50">{sheet.scores[a].value}</span></span><Num value={sheet.mods[a]} signed /></RollButton>
              <div className="w-24">
                <RollButton onRoll={onRoll} label={`${ABILITY_NAMES[a]} save`} ask={{ kind: "save", key: a, label: `${ABILITY_NAMES[a]} save`, modifier: sheet.saves[a].value.value }}><span className={sheet.saves[a].proficient ? "text-gold" : "text-parch/50"}>Save</span><Num value={sheet.saves[a].value} signed /></RollButton>
              </div>
            </div>
          ))}
        </Panel>
        {sheet.spellcasting.classes.map((s) => (
          <Panel key={s.classId} title={`${titleCase(s.classId)} spellcasting`}>
            <p className="text-sm">Save DC <Num value={s.saveDc} /> · Attack <Num value={s.attack} signed /></p>
            <p className="text-sm text-parch/60">{s.cantrips} cantrips · {s.prepared} prepared</p>
          </Panel>
        ))}
        {sheet.spellcasting.slots.some((n) => n > 0) && <Panel title="Spell slots"><p className="text-sm">{sheet.spellcasting.slots.map((n, i) => (n ? `Level ${i + 1}: ${n}` : "")).filter(Boolean).join(" · ")}</p></Panel>}
        {sheet.spellcasting.pact && <Panel title="Pact Magic"><p className="text-sm">{sheet.spellcasting.pact.count} level {sheet.spellcasting.pact.level} slots, back after a Short Rest</p></Panel>}
      </div>

      <div className="space-y-3">
        <Panel title="Skills">
          {Object.entries(SKILLS).map(([s, ability]) => {
            const c = sheet.skills[s];
            return <RollButton onRoll={onRoll} key={s} label={`${titleCase(s)} check`} ask={{ kind: "skill", key: s, label: `${titleCase(s)} check`, modifier: c.value.value }}><span className={c.proficient ? "text-gold" : ""}>{titleCase(s)} <span className="text-xs text-parch/40">{ability.toUpperCase()}</span>{c.expertise && <span className="text-xs text-gold"> expertise</span>}{tag(c)}</span><Num value={c.value} signed /></RollButton>;
          })}
        </Panel>
      </div>

      {!compact && (
        <div className="space-y-3 md:col-span-3">
          <Panel title="More numbers">
            <p className="text-sm text-parch/80">Shove and grapple DC {sheet.shoveDc.value} · Long jump {sheet.longJump.running} ft. ({sheet.longJump.standing} standing) · High jump {sheet.highJump.running} ft. · Carry {sheet.carry.carry} lb. (drag {sheet.carry.dragLiftPush}){sheet.darkvision ? ` · Darkvision ${sheet.darkvision} ft.` : ""}{sheet.resistances.length ? ` · Resists ${sheet.resistances.join(", ")}` : ""}</p>
            {sheet.saveDcs.map((d) => <p key={d.id} className="text-sm">{d.name} DC <Num value={d.dc} /></p>)}
          </Panel>
          {sheet.resources.length > 0 && <Panel title="Resources"><ul className="grid gap-1 text-sm sm:grid-cols-2">{sheet.resources.map((r) => <li key={r.id}>{r.name}: {r.max}{r.unit ? ` ${r.unit}` : ""}{r.die ? ` (d${r.die})` : ""} · {r.short === "all" ? "Back on a Short Rest" : typeof r.short === "number" ? `${r.short} back on a Short Rest, all on a Long Rest` : "Back on a Long Rest"}</li>)}</ul></Panel>}
          <Panel title="Features">
            {sheet.features.map((f) => <details key={f.id} className="border-t border-line py-1 text-sm first:border-0"><summary className="min-h-8 cursor-pointer py-1">{f.name}</summary><p className="whitespace-pre-line pb-2 text-parch/70">{f.description ?? "No description."}</p></details>)}
          </Panel>
        </div>
      )}
    </div>
  );
}

export const formula = (modifier: number) => `1d20${modifier ? sign(modifier) : ""}`;
export { formatDamage };
