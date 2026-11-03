// Retakes the README's screenshots. Only runs on request, against a local build:
//   README_SHOTS=1 npx playwright test tests/e2e/readme-screenshots.spec.ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { fixtures } from "../fixtures/characters";

const DIR = "docs/screenshots";
const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png` });

test.skip(!process.env.README_SHOTS, "Only runs when retaking the README's screenshots.");

async function newUser(browser: Browser, characterName?: string, name?: string, opts: { fast?: boolean; phone?: boolean } = {}) {
  const ctx = await browser.newContext(opts.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
  if (opts.fast) await ctx.addInitScript(() => localStorage.setItem("tavern.settings.v1", JSON.stringify({ fastRolls: true })));
  const page = await ctx.newPage();
  await page.goto("/about");
  if (characterName) {
    const character = { ...fixtures.find((f) => f.name === characterName)!.character, name };
    await page.evaluate((c) => localStorage.setItem("tavern.characters.v1", JSON.stringify([{ id: "demo", character: c, updatedAt: Date.now(), versions: [] }])), character);
  }
  return page;
}

test("take the README screenshots", async ({ browser }) => {
  const visitor = await newUser(browser, "Paladin 5", "Seren Vale");
  await visitor.goto("/characters/new");
  await visitor.getByRole("button", { name: /Rogue/ }).click();
  await shot(visitor, "builder");
  await visitor.goto("/characters/demo");
  await expect(visitor.getByRole("heading", { name: "Seren Vale" })).toBeVisible();
  await visitor.getByRole("button", { name: "Roll Greatsword attack" }).count();
  await shot(visitor, "sheet");
  await visitor.goto("/rules?tab=conditions&q=Prone");
  await expect(visitor.getByText("In plain words")).toBeVisible();
  await shot(visitor, "rules");

  await visitor.goto("/dice");
  await visitor.getByLabel("Roll to make").fill("2d6+1d20+1d12+3");
  await visitor.getByRole("button", { name: "Roll", exact: true }).click();
  await expect(visitor.locator("canvas")).toBeVisible({ timeout: 15000 });
  await visitor.waitForTimeout(3200);
  await shot(visitor, "dice");

  // A table in progress: a DM, two players, a monster and a few rolls.
  const dm = await newUser(browser, undefined, undefined, { fast: true });
  await dm.goto("/play");
  await dm.getByTestId("your-name").fill("Dana");
  await dm.getByTestId("room-name").fill("The Lamplighter's Crypt");
  await dm.getByTestId("create").click();
  const code = (await dm.getByTestId("invite-code").textContent())!.trim();
  const roomId = dm.url().split("/").pop()!;
  const act = (page: Page, intent: object) => page.evaluate(async ({ roomId, intent }) => {
    await fetch(`/api/rooms/${roomId}/intents`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem(`tavern.room.${roomId}`)}` }, body: JSON.stringify(intent) });
  }, { roomId, intent });

  const players: Page[] = [];
  for (const [who, sheet, hero] of [["Priya", "Fighter 5", "Bryn Ashgrove"], ["Sam", "Rogue 5", "Nim Quickfoot"], ["Lee", "Wizard 5", "Oriel Thorne"]] as const) {
    // Lee's screen shows the 3D table, so it keeps real dice on.
    const p = await newUser(browser, sheet, hero, { fast: who !== "Lee" });
    await p.goto(`/play?code=${code}`);
    await p.getByTestId("your-name").fill(who);
    await p.getByTestId("join").click();
    await p.getByTestId(`bring-${hero}`).click();
    await dm.getByTestId(`approve-${who}`).click();
    players.push(p);
  }
  await dm.getByTestId("map-select").selectOption("village");
  await dm.getByTestId("monster-search").click();
  await dm.getByTestId("monster-search").fill("Goblin Warrior");
  await dm.getByTestId("add-goblin-warrior").click();
  await dm.getByTestId("add-goblin-warrior").click();
  await dm.getByTestId("place-encounter").click();
  await dm.waitForTimeout(800);
  const state = await dm.evaluate(async (id) => (await (await fetch(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem(`tavern.room.${id}`)}` } })).json()).view, roomId);
  const spots = [[12, 10], [11, 12], [13, 13], [17, 11], [18, 13]];
  for (const [i, t] of (state.tokens as { id: string }[]).entries()) await act(dm, { type: "token_move", id: t.id, x: spots[i][0], y: spots[i][1] });
  await dm.getByTestId("environment").selectOption("forest");
  await dm.getByTestId("start-combat").click();
  await players[0].getByRole("button", { name: "Roll Perception check" }).click();
  await players[1].getByRole("button", { name: "Roll Stealth check" }).click();
  await act(dm, { type: "roll", requestId: "secret", kind: "typed", notation: "1d20+3", visibility: "dm-secret" });
  await dm.waitForTimeout(7000); // let the popups clear, so they don't cover the map
  await dm.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('[data-testid="dm-feed"]')?.closest(".lg\\:overflow-auto")?.scrollTo(0, 0);
  });
  await shot(dm, "dm-table");
  await dm.locator("section", { hasText: "Live roll feed" }).first().screenshot({ path: `${DIR}/dm-feed.png` });

  // The 3D table, with real dice mid-roll.
  const watcher = players[2];
  await watcher.getByTestId("view-table").click();
  await expect(watcher.getByTestId("table-scene").locator("canvas")).toBeVisible({ timeout: 20000 });
  await act(dm, { type: "scene", environment: "tavern" });
  await watcher.waitForTimeout(2000);
  await act(players[0], { type: "roll", requestId: "t1", kind: "typed", notation: "2d6+1d20" });
  await watcher.waitForTimeout(2600);
  await watcher.locator("section").filter({ has: watcher.getByTestId("table-scene") }).screenshot({ path: `${DIR}/table.png` });

  // A phone, on the player's sheet.
  const phone = await newUser(browser, "Cleric 5", "Tamsin Reed", { fast: true, phone: true });
  await phone.goto(`/play?code=${code}`);
  await phone.getByTestId("your-name").fill("Noor");
  await phone.getByTestId("join").click();
  await phone.getByRole("tab", { name: "Sheet" }).click();
  await phone.getByTestId("bring-Tamsin Reed").click();
  await dm.getByTestId(`approve-Noor`).click();
  await phone.waitForTimeout(800);
  await phone.getByTestId("what-can-i-do").click();
  await phone.waitForTimeout(300);
  await shot(phone, "phone");
});
