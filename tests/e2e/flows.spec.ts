// Single-player paths, with screenshots for checking by eye.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { fixtures } from "../fixtures/characters";

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const errorsOn = (page: Page) => { const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !/favicon|404|422|503/.test(m.text())) errors.push(m.text()); }); return errors; };

test("build a character with the wizard, then see the math", async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto("/characters/new");
  await page.getByRole("button", { name: /Fighter/ }).click();
  await page.getByRole("button", { name: "Perception" }).click();
  await page.getByRole("button", { name: "Survival" }).click();
  await shot(page, "builder-class");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click(); // background: Soldier
  await page.getByLabel("Versatile: extra Origin feat").selectOption("alert");
  await page.getByRole("button", { name: "Insight" }).click();
  await page.getByRole("button", { name: "Next" }).click(); // species: Human
  for (const [label, value] of [["Strength", "15"], ["Constitution", "14"], ["Dexterity", "13"], ["Wisdom", "12"], ["Charisma", "10"], ["Intelligence", "8"]]) await page.getByLabel(label).selectOption(value);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Chain Mail/ }).click();
  await page.getByRole("button", { name: /^Greatsword/ }).first().click();
  await page.getByRole("button", { name: /Greatsword \(Graze\)/ }).click();
  await page.getByLabel("Fighting Style").selectOption("defense");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Name").first().fill("Bryn");
  await page.getByRole("button", { name: "Next" }).click();
  await shot(page, "builder-review");
  await page.getByRole("button", { name: "Save character" }).click();
  await expect(page.getByRole("heading", { name: "Bryn" })).toBeVisible();
  // Fighter 1: AC 16 + 1 Defense; HP 10 + CON 2; greatsword +5, 2d6+3.
  await expect(page.getByLabel(/^17\./)).toBeVisible();
  await expect(page.getByLabel(/^12\./)).toBeVisible();
  await expect(page.getByLabel(/^5\. \+5 = \+3 Strength \+ \+2 proficiency/).first()).toBeVisible();
  await shot(page, "sheet");
  expect(errors).toEqual([]);
});

test("library, level-up and share link", async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto("/about");
  const character = fixtures.find((f) => f.name === "Fighter 1")!.character;
  await page.evaluate((c) => localStorage.setItem("tavern.characters.v1", JSON.stringify([{ id: "abc", character: { ...c, name: "Hero" }, updatedAt: Date.now(), versions: [] }])), character);
  await page.goto("/characters");
  await expect(page.getByText("Hero", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByText("Hero (copy)")).toBeVisible();
  await page.goto("/characters/abc/level-up");
  await page.getByRole("button", { name: /Become Fighter 2/ }).click();
  await expect(page.getByText("Level 2 Human Fighter 2")).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  const link = await page.evaluate(async () => { const raw = JSON.parse(localStorage.getItem("tavern.characters.v1")!)[0].character; const json = JSON.stringify(raw); return `/characters/share#${btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`; });
  await page.goto(link);
  await expect(page.getByRole("button", { name: "Copy to my characters" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("3D dice roll on the server's number", async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto("/dice");
  await page.getByLabel("Roll to make").fill("2d6+1d20+4");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(page.getByTestId("roll-card")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(page, "dice-flying");
  await page.waitForTimeout(3000);
  await shot(page, "dice-settled");
  await page.getByRole("button", { name: "d%" }).click();
  await page.getByRole("button", { name: "4d6kh3" }).click();
  await expect(page.getByText(/4d6kh3:/)).toBeVisible();
  await page.getByLabel("Roll to make").fill("banana");
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Can't read");
  expect(errors).toEqual([]);
});

test("the rules reference and global search work", async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto("/rules?tab=conditions");
  await expect(page.getByText("Grappled", { exact: true })).toBeVisible();
  await page.getByText("Grappled", { exact: true }).click();
  await expect(page.locator("details[open]").getByText("In plain words")).toBeVisible();
  await shot(page, "rules");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search", { exact: true }).fill("fireball");
  await page.getByRole("button", { name: /^Fireball/ }).first().click();
  await expect(page.getByText("Level 3 Evocation")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the tutorial runs start to finish", async ({ page }) => {
  const errors = errorsOn(page);
  await page.addInitScript(() => localStorage.setItem("tavern.settings.v1", JSON.stringify({ fastRolls: true })));
  await page.goto("/tutorial");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: /Move to square 5, 4/ }).click();
  await shot(page, "tutorial");
  for (let i = 0; i < 40; i++) {
    const next = page.getByRole("button", { name: /Swing|Roll damage|Goblin's turn|Use Second Wind|Take a Short Rest/ }).first();
    if (await page.getByText("That's the core of the game").isVisible()) break;
    await next.click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByText("That's the core of the game")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the battle map and 3D table draw, with DM tools", async ({ page }) => {
  const errors = errorsOn(page);
  await page.goto("/about");
  const character = fixtures.find((f) => f.name === "Fighter 5")!.character;
  await page.evaluate((c) => localStorage.setItem("tavern.characters.v1", JSON.stringify([{ id: "abc", character: { ...c, name: "Hero" }, updatedAt: Date.now(), versions: [] }])), character);
  await page.goto("/play");
  await page.getByTestId("your-name").fill("Dee");
  await page.getByTestId("room-name").fill("Map test");
  await page.getByTestId("create").click();
  await page.getByTestId("bring-Hero").click();
  await expect(page.getByTestId("battle-map").locator("canvas")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("map-select").selectOption("crypt");
  await page.getByTestId("monster-search").click();
  await page.getByTestId("monster-search").fill("Skeleton");
  await page.getByTestId("add-skeleton").click();
  await page.getByTestId("place-encounter").click();
  await page.waitForTimeout(1200);
  await shot(page, "room-map");
  await page.getByTestId("environment").selectOption("infernal");
  await page.getByTestId("view-table").click();
  await expect(page.getByTestId("table-scene").locator("canvas")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Roll Perception check" }).click();
  await page.waitForTimeout(1500);
  await shot(page, "room-table");
  await page.getByTestId("what-can-i-do").click();
  await expect(page.getByTestId("turn-guide")).toContainText("2 attacks");
  await page.getByTestId("view-map").click();
  await page.getByLabel("Map").first().scrollIntoViewIfNeeded().catch(() => undefined);
  expect(errors).toEqual([]);
});

test("phone layout has tabs and no sideways scrolling", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  for (const path of ["/", "/characters", "/characters/new", "/play", "/rules", "/dice", "/tutorial", "/settings", "/characters/import", "/about"]) {
    await page.goto(path);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/play");
  await page.getByTestId("your-name").fill("Dee");
  await page.getByTestId("room-name").fill("Phone");
  await page.getByTestId("create").click();
  await expect(page.getByRole("tab", { name: "Scene" })).toBeVisible();
  await page.getByRole("tab", { name: "DM" }).click();
  await expect(page.getByTestId("invite-code")).toBeVisible();
  await shot(page, "room-phone");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("AI features explain themselves when they're off", async ({ page }) => {
  await page.goto("/characters/create");
  await page.getByLabel("Your concept").fill("A cursed knight");
  await page.getByRole("button", { name: "Suggest a character" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("aren't turned on");
});
