"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Field, inputClass, Panel, titleCase } from "@/components/ui";
import { getCharacter, saveCharacter, type SavedCharacter } from "@/lib/characters/store";
import { applyLevelUp, levelGains } from "@/lib/rules/levelup";
import { ABILITIES, ABILITY_NAMES, deriveSheet, srd, totalLevel, type Ability } from "@/lib/rules";

export default function LevelUp() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [saved, setSaved] = useState<SavedCharacter | null>(null);
  const [classId, setClassId] = useState("");
  const [subclassId, setSubclassId] = useState("");
  const [choice, setChoice] = useState<"asi" | "feat">("asi");
  const [featId, setFeatId] = useState("");
  const [a1, setA1] = useState<Ability>("str");
  const [a2, setA2] = useState<Ability>("str");
  useEffect(() => {
    const c = getCharacter(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(c);
    if (c) setClassId(c.character.classes[0].classId);
  }, [id]);
  const gains = useMemo(() => (saved && classId ? levelGains(saved.character, classId) : null), [saved, classId]);
  if (!saved || !gains) return null;
  const c = saved.character;
  if (totalLevel(c) >= 20) return <main className="p-8">{c.name} is already level 20.</main>;
  const subclasses = [...srd.subclasses.values(), ...(c.homebrew?.subclasses ?? [])].filter((s) => s.classId === classId);
  const needFeat = gains.needsAsiOrFeat || gains.needsEpicBoon;
  const feats = [...srd.feats.values(), ...(c.homebrew?.feats ?? [])].filter((f) => (gains.needsEpicBoon ? f.type === "epic-boon" : f.type === "general" && f.id !== "ability-score-improvement"));
  const feat = needFeat ? (choice === "asi" && !gains.needsEpicBoon
    ? { featId: "ability-score-improvement", abilityIncreases: a1 === a2 ? { [a1]: 2 } : { [a1]: 1, [a2]: 1 } }
    : featId ? { featId, abilityIncreases: { [a1]: 1 } } : undefined) : undefined;
  const ready = !gains.multiclassBlockedBy.length && (!gains.needsSubclass || subclassId) && (!needFeat || feat);
  const con = deriveSheet(c).mods.con.value;

  const finish = () => {
    saveCharacter(applyLevelUp(c, classId, { subclassId: subclassId || undefined, feat }), id);
    router.push(`/characters/${id}`);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Level up {c.name}</h1>
      <Panel title="Class">
        <Field label="Gain a level in" hint="Picking a new class is multiclassing, which needs 13 in both classes' main abilities.">
          <select className={inputClass} value={classId} onChange={(e) => { setClassId(e.target.value); setSubclassId(""); }}>
            {[...srd.classes.values()].map((d) => <option key={d.id} value={d.id}>{d.name} {c.classes.some((e) => e.classId === d.id) ? `(now level ${c.classes.find((e) => e.classId === d.id)!.level})` : "(new)"}</option>)}
          </select>
        </Field>
        {gains.multiclassBlockedBy.length > 0 && <p role="alert" className="mt-2 text-sm text-red-300">Not yet: this needs {gains.multiclassBlockedBy.join(", ")}.</p>}
      </Panel>
      <Panel title="Hit points">
        <p className="text-sm">+{Math.max(1, gains.averageHp + con)} HP: the d{gains.hitDie} average of {gains.averageHp}, plus Constitution ({con >= 0 ? "+" : ""}{con}). You also gain a d{gains.hitDie} Hit Die.</p>
      </Panel>
      {gains.needsSubclass && (
        <Panel title="Choose a subclass">
          <Field label="Subclass"><select className={inputClass} value={subclassId} onChange={(e) => setSubclassId(e.target.value)}><option value="">Choose one</option>{subclasses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <p className="mt-2 text-sm text-parch/60">The SRD includes one subclass per class. Others can be added as homebrew.</p>
        </Panel>
      )}
      {needFeat && (
        <Panel title={gains.needsEpicBoon ? "Choose an Epic Boon" : "Ability Score Improvement or feat"}>
          {!gains.needsEpicBoon && (
            <div className="mb-3 flex gap-2">
              <Button aria-pressed={choice === "asi"} className={choice === "asi" ? "border-ember bg-ember/10" : ""} onClick={() => setChoice("asi")}>Ability scores</Button>
              <Button aria-pressed={choice === "feat"} className={choice === "feat" ? "border-ember bg-ember/10" : ""} onClick={() => setChoice("feat")}>A feat</Button>
            </div>
          )}
          {(choice === "feat" || gains.needsEpicBoon) && <Field label="Feat"><select className={inputClass} value={featId} onChange={(e) => setFeatId(e.target.value)}><option value="">Choose one</option>{feats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label={choice === "asi" && !gains.needsEpicBoon ? "+1 to" : "Increase"}><select className={inputClass} value={a1} onChange={(e) => setA1(e.target.value as Ability)}>{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}</select></Field>
            {choice === "asi" && !gains.needsEpicBoon && <Field label="and +1 to" hint="The same ability twice is +2. Scores stop at 20."><select className={inputClass} value={a2} onChange={(e) => setA2(e.target.value as Ability)}>{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}</select></Field>}
          </div>
        </Panel>
      )}
      <Panel title="New features">
        {![...gains.features, ...gains.subclassFeatures].length && <p className="text-sm text-parch/60">No new features at this level.</p>}
        {[...gains.features, ...gains.subclassFeatures].map((f) => <details key={f.id} className="py-1 text-sm"><summary className="min-h-8 cursor-pointer">{f.name}</summary><p className="whitespace-pre-line text-parch/70">{f.description}</p></details>)}
        {(gains.cantripsGained > 0 || gains.preparedGained > 0) && <p className="mt-2 text-sm text-gold">Afterwards, add {[gains.cantripsGained > 0 && `${gains.cantripsGained} cantrip(s)`, gains.preparedGained > 0 && `${gains.preparedGained} prepared spell(s)`].filter(Boolean).join(" and ")} on the Spells tab. You can also swap spells there, as the rules for your class allow.</p>}
      </Panel>
      <Button variant="primary" disabled={!ready} onClick={finish}>Become {titleCase(classId)} {gains.newClassLevel}</Button>
    </main>
  );
}
