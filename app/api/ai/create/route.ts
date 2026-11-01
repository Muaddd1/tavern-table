// Create with AI: a concept in, a legal build out. The rules engine checks it, and problems go
// back for one correction before the player sees it in the builder.
import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { SKILLS, STANDARD_ARRAY } from "@/data/srd/mechanics";
import { AI_OFF, aiConfigured, anthropic, callerKey, MODEL, spend } from "@/lib/ai/client";
import { isLegal, srd, validate, type Character } from "@/lib/rules";

const body = z.object({ concept: z.string().trim().min(3).max(2000) }).strict();
const build = z.object({
  name: z.string(), classId: z.string(), speciesId: z.string(), lineageId: z.string().nullable(), backgroundId: z.string(),
  scores: z.object({ str: z.number(), dex: z.number(), con: z.number(), int: z.number(), wis: z.number(), cha: z.number() }),
  plusTwo: z.string(), plusOne: z.string(), skills: z.array(z.string()), equipment: z.array(z.string()), weaponMasteries: z.array(z.string()),
  fightingStyle: z.string().nullable(), extraOriginFeat: z.string().nullable(), order: z.string().nullable(), expertise: z.array(z.string()),
  personality: z.string(), ideals: z.string(), bonds: z.string(), flaws: z.string(), backstory: z.string(), appearance: z.string(), concept: z.string(),
});

const catalog = () => JSON.stringify({
  classes: [...srd.classes.values()].map((c) => ({ id: c.id, saves: c.saves, primary: c.primary, skills: c.skillChoices, armor: c.armor, weapons: c.weapons })),
  species: [...srd.species.values()].map((s) => ({ id: s.id, lineages: [...srd.lineages.values()].filter((l) => l.speciesId === s.id).map((l) => l.id) })),
  backgrounds: [...srd.backgrounds.values()].map((b) => ({ id: b.id, abilities: b.abilities, skills: b.skills, feat: b.featId })),
  skills: Object.keys(SKILLS), originFeats: [...srd.feats.values()].filter((f) => f.type === "origin").map((f) => f.id), fightingStyles: [...srd.feats.values()].filter((f) => f.type === "fighting-style").map((f) => f.id),
  armor: [...srd.items.values()].filter((i) => i.armor).map((i) => i.id), weapons: [...srd.items.values()].filter((i) => i.weapon).map((i) => i.id), standardArray: STANDARD_ARRAY,
});

const SYSTEM = `You help players create a level 1 character for a fifth edition game, from their concept, using only the options in the catalog below (the System Reference Document). Use exact ids. Scores must be the standard array, assigned to suit the class. plusTwo and plusOne must be two different abilities from the background's list. Choose exactly the class's number of skills, from its list, not repeating the background's. weaponMasteries only for classes with Weapon Mastery. order is "protector" or "thaumaturge" for a Cleric, "magician" or "warden" for a Druid. extraOriginFeat is only for a Human, whose species also gives a skill: add one extra skill. Write an original backstory of about 120 words that fits the concept. Don't use named settings or people from published books.`;

function toCharacter(x: z.infer<typeof build>): Character {
  return {
    name: x.name, classes: [{ classId: x.classId, level: 1 }], speciesId: x.speciesId, lineageId: x.lineageId ?? undefined, backgroundId: x.backgroundId,
    baseScores: x.scores, backgroundBonus: { [x.plusTwo]: 2, [x.plusOne]: 1 },
    feats: [{ featId: srd.backgrounds.get(x.backgroundId)?.featId ?? "" }, ...(x.extraOriginFeat ? [{ featId: x.extraOriginFeat }] : []), ...(x.fightingStyle ? [{ featId: x.fightingStyle }] : [])],
    skillProficiencies: x.skills, expertise: x.expertise, weaponMasteries: x.weaponMasteries, equipment: x.equipment.map((itemId) => ({ itemId, equipped: true })),
    options: x.order ? { [x.classId === "druid" ? "primal-order" : "divine-order"]: x.order } : undefined,
    details: { traits: x.personality, ideals: x.ideals, bonds: x.bonds, flaws: x.flaws, backstory: x.backstory, appearance: x.appearance },
  };
}

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: AI_OFF }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your character in a few words." }, { status: 400 });
  const check = spend(callerKey(req));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 429 });
  const client = anthropic();
  let prompt = `Concept: ${parsed.data.concept}`;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await client.messages.parse({ model: MODEL(), max_tokens: 8000, system: [{ type: "text", text: `${SYSTEM}\n\nCatalog:\n${catalog()}`, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: prompt }], output_config: { format: zodOutputFormat(build) } });
      if (!r.parsed_output) break;
      const character = toCharacter(r.parsed_output);
      let issues;
      try { issues = validate(character, { method: "standard-array" }); } catch (e) { prompt = `${prompt}\n\nYour last build failed: ${(e as Error).message}. Use exact ids from the catalog.`; continue; }
      if (isLegal(issues)) return NextResponse.json({ character, concept: r.parsed_output.concept });
      prompt = `${prompt}\n\nYour last build broke these rules: ${issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ")} Fix them.`;
    }
    return NextResponse.json({ error: "The AI couldn't make a legal build for that. Try rewording it." }, { status: 422 });
  } catch {
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
