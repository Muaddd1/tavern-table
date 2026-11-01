// Licensing and integrity checks on the data that ships with the app.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import classes from "@/data/srd/classes.json";
import items from "@/data/srd/items.json";
import monsters from "@/data/srd/monsters.json";
import spells from "@/data/srd/spells.json";
import feats from "@/data/srd/feats.json";
import { CONDITIONS, FEATURE_EFFECTS, MULTICLASS_SLOTS } from "@/data/srd/mechanics";
import { srd } from "@/lib/rules";

const shipped = fs.readdirSync("data/srd").filter((f) => f.endsWith(".json")).map((f) => ({ f, text: fs.readFileSync(path.join("data/srd", f), "utf8") }));

// Well-known names that aren't in SRD 5.2.1, so finding one means non-SRD content got in.
const NON_SRD = [
  "Battle Master", "Superiority Di", "Student of War", "Eldritch Knight", "Beholder", "Mind Flayer", "Illithid", "Displacer Beast", "Githyanki", "Yuan-ti",
  "Forgotten Realms", "Faerûn", "Faerun", "Greyhawk", "Eberron", "Baldur's Gate", "Waterdeep", "Bigby", "Mordenkainen", "Tasha's", "Tenser", "Otiluke", "Melf",
  "Dulcimer", "Dungeons & Dragons", "D&D Beyond", "Tortle", "Aasimar", "Warforged", "Tabaxi",
];

describe("licensing", () => {
  it.each(NON_SRD)("shipped data doesn't contain %s", (term) => {
    for (const { f, text } of shipped) expect(text.toLowerCase().includes(term.toLowerCase()), f).toBe(false);
  });
  it("mechanics contain no non-SRD subclass", () => {
    const ids = Object.keys(FEATURE_EFFECTS).filter((k) => k.includes(":")).map((k) => k.split(":")[0]);
    for (const id of new Set(ids)) expect(srd.subclasses.has(id), id).toBe(true);
  });
  it("has no API urls or hosted images", () => {
    for (const { f, text } of shipped) {
      expect(text.includes('"url"'), f).toBe(false);
      expect(text.includes('"image"'), f).toBe(false);
    }
  });
});

describe("counts match the official PDF", () => {
  it("has all 339 spells and the 12 classes", () => {
    expect(spells).toHaveLength(339);
    expect(classes).toHaveLength(12);
  });
  it("has one subclass per class", () => {
    expect([...srd.subclasses.values()].map((s) => s.classId).sort()).toEqual((classes as { id: string }[]).map((c) => c.id).sort());
  });
  it("includes the stat blocks that were missing from the source", () => {
    const names = new Set((monsters as { name: string }[]).map((m) => m.name));
    for (const n of ["Octopus", "Giant Fly", "Avatar of Death", "Giant Insect", "Draconic Spirit", "Otherworldly Steed"]) expect(names.has(n), n).toBe(true);
    expect(names.size).toBe((monsters as unknown[]).length);
  });
  it("has the 17 SRD feats, with the PDF's name for Two-Weapon Fighting", () => {
    expect(feats).toHaveLength(17);
    expect((feats as { name: string }[]).map((f) => f.name)).toContain("Two-Weapon Fighting");
  });
  it("applies the fixes the audit found", () => {
    const list = spells as { id: string; concentration: boolean }[];
    expect(list.find((s) => s.id === "protection-from-evil-and-good")?.concentration).toBe(true);
    expect((classes as { id: string; weapons: string[] }[]).find((c) => c.id === "rogue")?.weapons).not.toContain("longswords");
    expect((items as { id: string; name: string }[]).find((i) => i.id === "half-plate-armor")?.name).toBe("Half Plate Armor");
    expect((items as { id: string }[]).some((i) => i.id === "dulcimer")).toBe(false);
  });
});

describe("hand-curated mechanics line up with the data", () => {
  it("every mechanics key is a real feature, trait or feat", () => {
    const ids = new Set<string>([
      ...[...srd.classes.values()].flatMap((c) => c.levels.flatMap((l) => l.features.map((f) => f.id))),
      ...[...srd.subclasses.values()].flatMap((s) => s.features.map((f) => f.id)),
      ...[...srd.species.values()].flatMap((s) => s.traits.map((t) => t.id)),
      ...[...srd.lineages.values()].flatMap((s) => s.traits.map((t) => t.id)),
      ...srd.feats.keys(),
    ]);
    expect(Object.keys(FEATURE_EFFECTS).filter((k) => !ids.has(k))).toEqual([]);
  });
  it("covers all 15 conditions", () => {
    expect(Object.keys(CONDITIONS)).toHaveLength(15);
  });
  it("has 20 rows in the multiclass slot table", () => {
    expect(MULTICLASS_SLOTS).toHaveLength(20);
    expect(MULTICLASS_SLOTS[19]).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });
  it("level tables run 1 to 20 for every class", () => {
    for (const c of srd.classes.values()) expect(c.levels.map((l) => l.level)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
  it("every class resolves its data at all 20 levels", () => {
    for (const c of srd.classes.values()) for (const l of c.levels) expect(l.proficiency).toBe(Math.ceil(l.level / 4) + 1);
  });
});

// MULTICLASS_SLOTS was typed from the PDF, so it independently checks the imported class tables.
describe("class slot tables agree with the PDF's multiclass table", () => {
  const trimmed = (slots: number[]) => slots.filter((n) => n > 0);
  it("full casters use the row for their level", () => {
    for (const id of ["bard", "cleric", "druid", "sorcerer", "wizard"]) {
      for (const l of srd.classes.get(id)!.levels) expect(trimmed(l.spell!.slots), `${id} ${l.level}`).toEqual(MULTICLASS_SLOTS[l.level - 1]);
    }
  });
  it("half casters use the row for half their level, rounded up, up to level 5 slots", () => {
    for (const id of ["paladin", "ranger"]) {
      for (const l of srd.classes.get(id)!.levels) expect(trimmed(l.spell!.slots), `${id} ${l.level}`).toEqual(MULTICLASS_SLOTS[Math.ceil(l.level / 2) - 1]);
    }
  });
});

describe("class tables", () => {
  const spell = (id: string) => srd.classes.get(id)!.levels.map((l) => l.spell!);
  it("match the PDF's Wizard prepared spells, which 5e-database has wrong from level 14", () => {
    expect(spell("wizard").map((s) => s.prepared)).toEqual([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25]);
  });
  it("match the PDF's Druid cantrips, which 5e-database has wrong at levels 7 and 16", () => {
    expect(spell("druid").map((s) => s.cantrips)).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  });
  it("never go down as a class levels up", () => {
    for (const c of srd.classes.values()) {
      const columns: Record<string, number[]> = {};
      for (const l of c.levels) {
        for (const [k, v] of Object.entries(l.table)) if (typeof v === "number") (columns[k] ??= []).push(v);
        if (l.spell) { (columns.cantrips ??= []).push(l.spell.cantrips); (columns.prepared ??= []).push(l.spell.prepared); }
      }
      for (const [k, values] of Object.entries(columns)) expect(values, `${c.id} ${k}`).toEqual([...values].sort((a, b) => a - b));
    }
  });
});
