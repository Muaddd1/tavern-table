"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDice } from "@/components/dice/DiceProvider";
import { Button, Field, inputClass, Panel, titleCase } from "@/components/ui";
import { CLASS_GUIDE, ORDER_OPTIONS } from "@/data/srd/builder-text";
import { POINT_BUY_COST, SKILLS, STANDARD_ARRAY } from "@/data/srd/mechanics";
import { saveCharacter } from "@/lib/characters/store";
import { ABILITIES, ABILITY_NAMES, deriveSheet, isLegal, pointBuyTotal, srd, validate, type Ability, type AbilityScores, type Character, type ScoreMethod } from "@/lib/rules";

const STEPS = ["Class", "Background", "Species", "Scores", "Equipment", "Details", "Review"];
const blank: AbilityScores = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
const CLASSES = [...srd.classes.values()];
const FEATS = [...srd.feats.values()];
const ITEMS = [...srd.items.values()];

export default function Builder() {
  const router = useRouter();
  const { show } = useDice();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<ScoreMethod>("standard-array");
  const [rolled, setRolled] = useState<number[]>([]);
  const [override, setOverride] = useState(false);
  const [bonusStyle, setBonusStyle] = useState<"2-1" | "1-1-1">("2-1");
  const [c, setC] = useState<Character>({ name: "", classes: [{ classId: "fighter", level: 1 }], speciesId: "human", backgroundId: "soldier", baseScores: blank, backgroundBonus: { str: 2, con: 1 }, feats: [{ featId: "savage-attacker" }], skillProficiencies: [], equipment: [], weaponMasteries: [] });
  // Create with AI opens its suggestion here for editing.
  useEffect(() => {
    const draft = sessionStorage.getItem("tavern.draft");
    if (draft) {
      sessionStorage.removeItem("tavern.draft");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setC(JSON.parse(draft)); setMethod("manual");
    }
  }, []);

  const update = (patch: Partial<Character>) => setC((x) => ({ ...x, ...patch }));
  const classDef = srd.classes.get(c.classes[0].classId)!;
  const background = srd.backgrounds.get(c.backgroundId)!;
  const species = srd.species.get(c.speciesId)!;
  const lineages = [...srd.lineages.values()].filter((l) => l.speciesId === c.speciesId);
  const choosesOrder = ORDER_OPTIONS[classDef.id];
  const sheet = useMemo(() => { try { return deriveSheet(c); } catch { return null; } }, [c]);
  const issues = useMemo(() => validate({ ...c, name: c.name || "Unnamed" }, { method, override }), [c, method, override]);

  const pickClass = (classId: string) => update({ classes: [{ classId, level: 1 }], skillProficiencies: [], weaponMasteries: [], options: {}, feats: c.feats.filter((f) => srd.feats.get(f.featId)?.type !== "fighting-style") });
  const pickBackground = (id: string) => {
    const b = srd.backgrounds.get(id)!;
    const originIds = new Set(FEATS.filter((f) => f.type === "origin").map((f) => f.id));
    update({
      backgroundId: id, backgroundBonus: { [b.abilities[0]]: 2, [b.abilities[1]]: 1 },
      feats: [{ featId: b.featId }, ...c.feats.filter((f, i) => !(i === 0 && originIds.has(f.featId)))],
      skillProficiencies: c.skillProficiencies.filter((s) => !b.skills.includes(s)),
    });
    setBonusStyle("2-1");
  };
  const setBonus = (a: Ability, v: number) => update({ backgroundBonus: { ...c.backgroundBonus, [a]: v } });
  const setScore = (a: Ability, v: number) => update({ baseScores: { ...c.baseScores, [a]: v } });

  const roll4d6 = async () => {
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch("/api/roll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notation: "4d6kh3" }) }).then((x) => x.json());
      results.push(r.result.total);
      if (i === 0) show({ id: crypto.randomUUID(), label: "Ability score (4d6, drop lowest)", result: r.result, skin: c.details?.diceSkin });
    }
    setRolled(results);
    update({ baseScores: blank });
  };

  const skillsAllowed = sheet?.choices.skills ?? 0;
  const chosenSkills = c.skillProficiencies.filter((s) => !(sheet?.choices.grantedSkills ?? []).includes(s));
  const toggleSkill = (s: string) => update({ skillProficiencies: c.skillProficiencies.includes(s) ? c.skillProficiencies.filter((x) => x !== s) : [...c.skillProficiencies, s] });
  const hasHumanVersatile = species.traits.some((t) => t.id === "versatile");
  const originFeats = FEATS.filter((f) => f.type === "origin");
  const styleLimit = sheet?.choices.fightingStyles ?? 0;
  const gear = c.equipment;
  const toggleItem = (itemId: string) => update({ equipment: gear.some((e) => e.itemId === itemId) ? gear.filter((e) => e.itemId !== itemId) : [...gear, { itemId, equipped: true }] });
  const toggleMastery = (id: string) => update({ weaponMasteries: (c.weaponMasteries ?? []).includes(id) ? c.weaponMasteries!.filter((x) => x !== id) : [...(c.weaponMasteries ?? []), id] });

  const finish = () => {
    const { id, saved } = saveCharacter({ ...c, name: c.name.trim() || "Unnamed adventurer" });
    if (!saved) { alert("Your browser wouldn't save this. Its storage may be full: try a smaller portrait."); return; }
    router.push(`/characters/${id}`);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Build a character</h1>
      <ol className="mt-3 flex flex-wrap gap-1 text-sm">
        {STEPS.map((s, i) => <li key={s}><button aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)} className={`min-h-10 rounded-md px-3 ${i === step ? "bg-ember text-ink" : "border border-line hover:bg-white/5"}`}>{i + 1}. {s}</button></li>)}
      </ol>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {step === 0 && (
            <Panel title="Choose a class">
              <div className="grid gap-2 sm:grid-cols-2">
                {CLASSES.map((d) => (
                  <button key={d.id} aria-pressed={d.id === classDef.id} onClick={() => pickClass(d.id)} className={`rounded-md border p-3 text-left ${d.id === classDef.id ? "border-ember bg-ember/10" : "border-line hover:bg-white/5"}`}>
                    <span className="flex justify-between"><strong>{d.name}</strong><span className="text-xs text-parch/50">{CLASS_GUIDE[d.id]?.difficulty}</span></span>
                    <span className="mt-1 block text-sm text-parch/70">{CLASS_GUIDE[d.id]?.plays}</span>
                  </button>
                ))}
              </div>
              {choosesOrder && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {choosesOrder.options.map((o) => (
                    <button key={o.id} aria-pressed={c.options?.[choosesOrder.key] === o.id} onClick={() => update({ options: { ...c.options, [choosesOrder.key]: o.id } })} className={`rounded-md border p-3 text-left text-sm ${c.options?.[choosesOrder.key] === o.id ? "border-ember bg-ember/10" : "border-line"}`}>
                      <strong>{o.name}</strong><span className="block text-parch/70">{o.text}</span>
                    </button>
                  ))}
                </div>
              )}
              <h3 className="mt-4 text-sm text-gold">Class skills: choose {classDef.skillChoices?.choose}</h3>
              <SkillPicks from={classDef.skillChoices?.from ?? []} picked={c.skillProficiencies} granted={background.skills} toggle={toggleSkill} />
            </Panel>
          )}

          {step === 1 && (
            <Panel title="Choose a background">
              <div className="grid gap-2 sm:grid-cols-2">
                {[...srd.backgrounds.values()].map((b) => (
                  <button key={b.id} aria-pressed={b.id === c.backgroundId} onClick={() => pickBackground(b.id)} className={`rounded-md border p-3 text-left text-sm ${b.id === c.backgroundId ? "border-ember bg-ember/10" : "border-line hover:bg-white/5"}`}>
                    <strong>{b.name}</strong>
                    <span className="block text-parch/70">{b.abilities.map((a) => a.toUpperCase()).join(", ")} · {srd.feats.get(b.featId)?.name}</span>
                    <span className="block text-parch/50">{b.skills.map(titleCase).join(", ")}</span>
                  </button>
                ))}
              </div>
              <h3 className="mt-4 text-sm text-gold">Ability increases</h3>
              <div className="mt-2 flex gap-2">
                <Button aria-pressed={bonusStyle === "2-1"} onClick={() => { setBonusStyle("2-1"); update({ backgroundBonus: { [background.abilities[0]]: 2, [background.abilities[1]]: 1 } }); }}>+2 and +1</Button>
                <Button aria-pressed={bonusStyle === "1-1-1"} onClick={() => { setBonusStyle("1-1-1"); update({ backgroundBonus: Object.fromEntries(background.abilities.map((a) => [a, 1])) }); }}>+1, +1, +1</Button>
              </div>
              {bonusStyle === "2-1" && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {background.abilities.map((a) => (
                    <Field key={a} label={ABILITY_NAMES[a]}>
                      <select className={inputClass} value={c.backgroundBonus[a] ?? 0} onChange={(e) => setBonus(a, +e.target.value)}>
                        {[0, 1, 2].map((n) => <option key={n} value={n}>+{n}</option>)}
                      </select>
                    </Field>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {step === 2 && (
            <Panel title="Choose a species">
              <div className="grid gap-2 sm:grid-cols-2">
                {[...srd.species.values()].map((s) => (
                  <button key={s.id} aria-pressed={s.id === c.speciesId} onClick={() => update({ speciesId: s.id, lineageId: undefined, size: undefined })} className={`rounded-md border p-3 text-left text-sm ${s.id === c.speciesId ? "border-ember bg-ember/10" : "border-line hover:bg-white/5"}`}>
                    <strong>{s.name}</strong>
                    <span className="block text-parch/60">Speed {s.speed} ft. · {s.sizes.join(" or ")}</span>
                    <span className="block text-parch/50">{s.traits.map((t) => t.name).join(", ")}</span>
                  </button>
                ))}
              </div>
              {lineages.length > 0 && (
                <Field label="Lineage or ancestry">
                  <select className={`${inputClass} mt-1`} value={c.lineageId ?? ""} onChange={(e) => update({ lineageId: e.target.value || undefined })}>
                    <option value="">Choose one</option>
                    {lineages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              )}
              {species.sizes.length > 1 && (
                <Field label="Size">
                  <select className={`${inputClass} mt-1`} value={c.size ?? species.sizes[0]} onChange={(e) => update({ size: e.target.value })}>{species.sizes.map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
              )}
              {hasHumanVersatile && (
                <Field label="Versatile: extra Origin feat">
                  <select className={`${inputClass} mt-1`} value={c.feats[1] && srd.feats.get(c.feats[1].featId)?.type === "origin" ? c.feats[1].featId : ""} onChange={(e) => update({ feats: [c.feats[0], ...(e.target.value ? [{ featId: e.target.value }] : []), ...c.feats.slice(1).filter((f) => srd.feats.get(f.featId)?.type !== "origin")] })}>
                    <option value="">Choose one</option>
                    {originFeats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
              )}
              {(sheet?.choices.skills ?? 0) > (classDef.skillChoices?.choose ?? 0) && (
                <>
                  <h3 className="mt-4 text-sm text-gold">Extra skill from your species: {skillsAllowed - chosenSkills.length} left</h3>
                  <SkillPicks from={Object.keys(SKILLS)} picked={c.skillProficiencies} granted={background.skills} toggle={toggleSkill} />
                </>
              )}
            </Panel>
          )}

          {step === 3 && (
            <Panel title="Ability scores">
              <div className="flex flex-wrap gap-2">
                <Button aria-pressed={method === "standard-array"} onClick={() => { setMethod("standard-array"); update({ baseScores: blank }); }}>Standard array</Button>
                <Button aria-pressed={method === "point-buy"} onClick={() => { setMethod("point-buy"); update({ baseScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } }); }}>27-point buy</Button>
                <Button aria-pressed={method === "rolled"} onClick={() => { setMethod("rolled"); roll4d6(); }}>Roll 4d6, drop lowest</Button>
              </div>
              {method === "point-buy" && <p className="mt-2 text-sm text-parch/70">Points spent: {Number.isFinite(pointBuyTotal(c.baseScores)) ? pointBuyTotal(c.baseScores) : "?"} of 27</p>}
              {method === "rolled" && <p className="mt-2 text-sm text-parch/70">Your rolls, made by the server: {rolled.join(", ") || "rolling..."}</p>}
              <p className="mt-2 text-sm text-parch/50">{classDef.name}s usually put their highest score in {classDef.primary.map((a) => ABILITY_NAMES[a]).join(" or ")}.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ABILITIES.map((a) => {
                  const pool = method === "standard-array" ? STANDARD_ARRAY : rolled;
                  const used = ABILITIES.filter((x) => x !== a).map((x) => c.baseScores[x]);
                  const left = [...pool];
                  for (const u of used) { const i = left.indexOf(u); if (i >= 0) left.splice(i, 1); }
                  return (
                    <Field key={a} label={ABILITY_NAMES[a]} hint={sheet?.scores[a] && c.baseScores[a] ? `With bonuses: ${sheet.scores[a].value}` : undefined}>
                      {method === "point-buy" ? (
                        <select className={inputClass} value={c.baseScores[a]} onChange={(e) => setScore(a, +e.target.value)}>{Object.keys(POINT_BUY_COST).map((n) => <option key={n}>{n}</option>)}</select>
                      ) : (
                        <select className={inputClass} value={c.baseScores[a] || ""} onChange={(e) => setScore(a, +e.target.value || 0)}>
                          <option value="">Choose</option>
                          {[...new Set([...left, ...(c.baseScores[a] ? [c.baseScores[a]] : [])])].sort((x, y) => y - x).map((n) => <option key={n}>{n}</option>)}
                        </select>
                      )}
                    </Field>
                  );
                })}
              </div>
            </Panel>
          )}

          {step === 4 && (
            <Panel title="Equipment">
              <ItemList title="Armor and shields" items={ITEMS.filter((i) => i.armor)} gear={gear} toggle={toggleItem} note={(i) => (sheet?.training.armor.includes(i.armor!.type === "shield" ? "shields" : `${i.armor!.type}-armor`) ? "" : "no training")} />
              <ItemList title="Weapons" items={ITEMS.filter((i) => i.weapon)} gear={gear} toggle={toggleItem} note={(i) => `${i.weapon!.dice} ${i.weapon!.damageType}`} />
              {(sheet?.choices.weaponMasteries ?? 0) > 0 && (
                <>
                  <h3 className="mt-4 text-sm text-gold">Weapon Mastery: choose up to {sheet!.choices.weaponMasteries}</h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ITEMS.filter((i) => i.weapon?.mastery && (sheet!.training.weapons.includes(`${i.weapon.category}-weapons`) || sheet!.training.weapons.includes(`${i.id}s`))).map((i) => (
                      <Button key={i.id} aria-pressed={(c.weaponMasteries ?? []).includes(i.id)} className={(c.weaponMasteries ?? []).includes(i.id) ? "border-ember bg-ember/10" : ""} onClick={() => toggleMastery(i.id)}>{i.name} ({titleCase(i.weapon!.mastery!)})</Button>
                    ))}
                  </div>
                </>
              )}
              {styleLimit > 0 && (
                <Field label="Fighting Style">
                  <select className={`${inputClass} mt-1`} value={c.feats.find((f) => srd.feats.get(f.featId)?.type === "fighting-style")?.featId ?? ""} onChange={(e) => update({ feats: [...c.feats.filter((f) => srd.feats.get(f.featId)?.type !== "fighting-style"), ...(e.target.value ? [{ featId: e.target.value }] : [])] })}>
                    <option value="">Choose one</option>
                    {FEATS.filter((f) => f.type === "fighting-style").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
              )}
              {(sheet?.choices.expertise ?? 0) > 0 && (
                <>
                  <h3 className="mt-4 text-sm text-gold">Expertise: choose {sheet!.choices.expertise}</h3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.keys(SKILLS).filter((s) => sheet!.skills[s].proficient).map((s) => (
                      <Button key={s} aria-pressed={(c.expertise ?? []).includes(s)} className={(c.expertise ?? []).includes(s) ? "border-ember bg-ember/10" : ""} onClick={() => update({ expertise: (c.expertise ?? []).includes(s) ? c.expertise!.filter((x) => x !== s) : [...(c.expertise ?? []), s] })}>{titleCase(s)}</Button>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          )}

          {step === 5 && (
            <Panel title="Details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><input className={inputClass} value={c.name} onChange={(e) => update({ name: e.target.value })} /></Field>
                <Field label="Alignment"><input className={inputClass} value={c.details?.alignment ?? ""} onChange={(e) => update({ details: { ...c.details, alignment: e.target.value } })} /></Field>
              </div>
              <p className="mt-3 text-sm text-parch/60">You can add a portrait, personality, backstory and more on your character&apos;s page after saving.</p>
            </Panel>
          )}

          {step === 6 && (
            <Panel title="Review">
              {!issues.length && <p className="text-green-300">All good: nothing needs attention.</p>}
              <ul className="space-y-1 text-sm">
                {issues.map((i) => <li key={i.code + i.message} className={i.severity === "error" ? "text-red-300" : "text-gold"}>{i.severity === "error" ? "Must fix: " : "Check: "}{i.message}</li>)}
              </ul>
              <label className="mt-3 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> DM override / homebrew: save even if the rules say no</label>
              <Button variant="primary" className="mt-3" disabled={!isLegal(issues)} onClick={finish}>Save character</Button>
            </Panel>
          )}

          <div className="flex justify-between">
            <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < STEPS.length - 1 && <Button variant="primary" onClick={() => setStep((s) => s + 1)}>Next</Button>}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Panel title="So far">
            <p className="text-sm">{classDef.name}, {species.name}, {background.name}</p>
            {sheet && (
              <dl className="mt-2 grid grid-cols-2 gap-x-2 text-sm">
                <dt className="text-parch/50">AC</dt><dd>{sheet.ac.value}</dd>
                <dt className="text-parch/50">HP</dt><dd>{sheet.hpMax.value}</dd>
                <dt className="text-parch/50">Speed</dt><dd>{sheet.speed.value} ft.</dd>
                {ABILITIES.map((a) => <div key={a} className="contents"><dt className="text-parch/50">{a.toUpperCase()}</dt><dd>{sheet.scores[a].value}</dd></div>)}
              </dl>
            )}
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function SkillPicks({ from, picked, granted, toggle }: { from: string[]; picked: string[]; granted: string[]; toggle: (s: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {from.map((s) => {
        const given = granted.includes(s);
        return <Button key={s} disabled={given} aria-pressed={picked.includes(s) || given} className={picked.includes(s) || given ? "border-ember bg-ember/10" : ""} onClick={() => toggle(s)}>{titleCase(s)}{given ? " (background)" : ""}</Button>;
      })}
    </div>
  );
}

function ItemList({ title, items, gear, toggle, note }: { title: string; items: typeof ITEMS; gear: Character["equipment"]; toggle: (id: string) => void; note: (i: (typeof ITEMS)[number]) => string }) {
  return (
    <>
      <h3 className="mt-3 text-sm text-gold">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1">
        {items.map((i) => <Button key={i.id} aria-pressed={gear.some((e) => e.itemId === i.id)} className={gear.some((e) => e.itemId === i.id) ? "border-ember bg-ember/10" : ""} onClick={() => toggle(i.id)}>{i.name} <span className="text-parch/40">{note(i)}</span></Button>)}
      </div>
    </>
  );
}
