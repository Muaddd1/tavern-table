// Homebrew packs use the SRD data format and override or add entries by id.
import { describe, expect, it } from "vitest";
import { srd, withHomebrew } from "@/lib/rules";
import type { FeatDef, ItemDef } from "@/lib/rules/types";

describe("withHomebrew", () => {
  it("returns the base compendium itself when there is no pack", () => {
    expect(withHomebrew(srd)).toBe(srd);
  });

  it("adds new entries and replaces SRD ones with the same id, without touching the SRD maps", () => {
    const alert = srd.feats.get("alert")!;
    const pack = { feats: [{ ...alert, name: "Alert (house rule)" } as FeatDef], items: [{ id: "hb-lantern", name: "Everburning Lantern" } as ItemDef] };
    const c = withHomebrew(srd, pack);
    expect(c.feats.get("alert")!.name).toBe("Alert (house rule)");
    expect(c.items.get("hb-lantern")!.name).toBe("Everburning Lantern");
    expect(c.feats.size).toBe(srd.feats.size);
    expect(c.items.size).toBe(srd.items.size + 1);
    expect(srd.feats.get("alert")!.name).toBe(alert.name);
  });

  it("reuses the SRD map for a category the pack leaves empty", () => {
    const c = withHomebrew(srd, { feats: [] });
    expect(c.feats).toBe(srd.feats);
    expect(c.classes).toBe(srd.classes);
  });
});
