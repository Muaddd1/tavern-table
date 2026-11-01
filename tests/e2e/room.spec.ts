// 1 DM + 4 players in separate browsers: everyone rolls, one round of combat runs, all 5 see the
// same results, and the DM's feed shows every roll in order. Dice are in fast mode so the test
// reads results quickly; a separate test below runs the 3D path.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { fixtures } from "../fixtures/characters";

const PLAYERS = ["Pia", "Sam", "Rin", "Lux"];
const CHARS = ["Fighter 5", "Rogue 5", "Wizard 5", "Cleric 5"];

async function newPlayer(browser: Browser, characterName?: string, name?: string): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("tavern.settings.v1", JSON.stringify({ fastRolls: true })));
  const page = await ctx.newPage();
  await page.goto("/about");
  if (characterName) {
    const character = { ...fixtures.find((f) => f.name === characterName)!.character, name: `${name}'s hero` };
    await page.evaluate((c) => localStorage.setItem("tavern.characters.v1", JSON.stringify([{ id: crypto.randomUUID(), character: c, updatedAt: Date.now(), versions: [] }])), character);
  }
  return page;
}
const logTotals = async (page: Page) => page.locator('[data-testid="log-roll"]').evaluateAll((rows) => rows.map((r) => [r.getAttribute("data-roll-id"), r.querySelector('[data-testid="log-total"]')?.textContent]));

test("five people play a round of combat and see identical results", async ({ browser }) => {
  const dm = await newPlayer(browser);
  await dm.goto("/play");
  await dm.getByTestId("your-name").fill("Dee");
  await dm.getByTestId("room-name").fill("Test campaign");
  await dm.getByTestId("create").click();
  const code = (await dm.getByTestId("invite-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{6}$/);

  const pages: Page[] = [];
  for (const [i, name] of PLAYERS.entries()) {
    const p = await newPlayer(browser, CHARS[i], name);
    await p.goto(`/play?code=${code}`);
    await p.getByTestId("your-name").fill(name);
    await p.getByTestId("join").click();
    await p.getByTestId(`bring-${name}'s hero`).click();
    await expect(p.getByText("Waiting for the DM to approve")).toBeVisible();
    pages.push(p);
  }
  const everyone = [dm, ...pages];

  // The DM sees every player online, and approves each character.
  for (const name of PLAYERS) {
    await expect(dm.getByTestId(`status-${name}`)).toHaveText("online");
    await dm.getByTestId(`approve-${name}`).click();
  }
  for (const p of pages) await expect(p.getByText("Waiting for the DM to approve")).toBeHidden();

  // A player can't use a DM action in the UI: no DM tools are there.
  await expect(pages[0].getByTestId("start-combat")).toHaveCount(0);

  // Everyone rolls.
  for (const p of pages) await p.getByRole("button", { name: "Roll Perception check" }).click();
  await dm.getByTestId("secret-roll").click();

  await expect(dm.getByTestId("dm-feed-row")).toHaveCount(5);
  for (const p of pages) await expect(p.getByTestId("log-roll")).toHaveCount(4); // the secret roll isn't theirs to see

  const reference = (await logTotals(pages[0])).sort();
  for (const p of pages.slice(1)) expect((await logTotals(p)).sort()).toEqual(reference);
  const feed = await dm.getByTestId("dm-feed-row").evaluateAll((rows) => rows.map((r) => [r.getAttribute("data-roll-id"), r.querySelector('[data-testid="feed-total"]')?.textContent]));
  for (const pair of reference) expect(feed).toContainEqual(pair);
  await expect(pages[0].getByText("The DM rolled").first()).toBeVisible();

  // The feed shows modifiers with their sources.
  await expect(dm.getByTestId("dm-feed-row").filter({ hasText: "Pia's hero" }).first()).toContainText("+1 Wisdom");

  // Roll requests.
  await dm.getByTestId("ask-roll").selectOption("save:dex");
  await dm.getByRole("button", { name: "Everyone", exact: true }).click();
  await dm.getByTestId("send-request").click();
  for (const p of pages) await p.getByTestId("answer-request").click();
  await expect(dm.getByTestId("dm-feed-row")).toHaveCount(9);

  // One round of combat, with a monster.
  await dm.getByTestId("monster-search").click();
  await dm.getByTestId("monster-search").fill("Goblin Warrior");
  await dm.getByTestId("add-goblin-warrior").click();
  await dm.getByTestId("place-encounter").click();
  await expect(dm.getByTestId("monster-attacker").locator("option", { hasText: "Goblin Warrior" })).toHaveCount(1);
  await dm.getByTestId("start-combat").click();
  for (const p of everyone) await expect(p.getByTestId("initiative").locator("li")).toHaveCount(5);
  const order = await dm.getByTestId("initiative").locator("li").allTextContents();
  for (const p of pages) expect(await p.getByTestId("initiative").locator("li").allTextContents()).toEqual(order);

  // A player attacks the goblin through the full flow, whenever it's their turn.
  const attacker = pages[0];
  await attacker.getByRole("button", { name: "Roll Greatsword attack" }).click();
  await attacker.getByTestId("attack-target").selectOption({ label: "Goblin Warrior" });
  await attacker.getByTestId("attack-confirm").click();
  await expect(dm.getByTestId("dm-feed-row").filter({ hasText: "Greatsword vs Goblin Warrior" })).toHaveCount(1);

  // The DM attacks a player; only that player is asked about a Reaction.
  await dm.getByTestId("monster-attacker").selectOption({ label: "Goblin Warrior" });
  await dm.getByTestId("monster-target").selectOption({ label: "Sam's hero" });
  await dm.getByTestId("monster-attack").click();
  await expect(pages[1].getByTestId("reaction")).toBeVisible();
  await expect(pages[0].getByTestId("reaction")).toHaveCount(0);

  // End each turn in the order given, and see the round advance on every screen.
  for (let i = 0; i < 5; i++) await dm.getByTestId("end-turn").click();
  for (const p of everyone) await expect(p.getByText("Initiative · round 2")).toBeVisible();

  // Every screen ends with the same public rolls.
  await pages[3].waitForTimeout(500);
  const final = (await logTotals(pages[0])).sort();
  for (const p of pages.slice(1)) expect((await logTotals(p)).sort()).toEqual(final);

  // A refresh rejoins the same state, without repeating or losing anything.
  const before = await pages[2].getByTestId("log-roll").count();
  await pages[2].reload();
  await expect(pages[2].getByTestId("log-roll")).toHaveCount(before);
  await expect(pages[2].getByText("Initiative · round 2")).toBeVisible();
});

test("a client can't send its own dice result, or cheat through the API", async ({ browser, request }) => {
  const dm = await newPlayer(browser);
  await dm.goto("/play");
  await dm.getByTestId("your-name").fill("Dee");
  await dm.getByTestId("room-name").fill("Cheat test");
  await dm.getByTestId("create").click();
  await expect(dm.getByTestId("invite-code")).toBeVisible();
  const code = (await dm.getByTestId("invite-code").textContent())!.trim();
  const join = await (await request.post("/api/rooms/join", { data: { code, name: "Cheater" } })).json();
  const send = (data: unknown, token = join.token) => request.post(`/api/rooms/${join.roomId}/intents`, { data, headers: { Authorization: `Bearer ${token}` } });

  expect((await send({ type: "roll", requestId: "x", kind: "typed", notation: "1d20", total: 20 })).status()).toBe(422);
  expect((await send({ type: "set_dice", value: 20 })).status()).toBe(422);
  expect((await send({ type: "start_combat" })).status()).toBe(422);
  expect((await send({ type: "roll", requestId: "x", kind: "typed", notation: "1d20" }, "wrong-token")).status()).toBe(401);
  const first = await (await send({ type: "roll", requestId: "same", kind: "typed", notation: "1d20" })).json();
  const again = await (await send({ type: "roll", requestId: "same", kind: "typed", notation: "1d20" })).json();
  expect(again.replayed).toBe(true);
  expect(again.rolls[0].id).toBe(first.rolls[0].id);

  await expect(dm.getByTestId("flags")).toContainText("invalid-intent", { timeout: 20000 });
  await expect(dm.getByTestId("flags")).toContainText("replayed-roll");
  await expect(dm.getByTestId("dm-feed-row")).toHaveCount(1);

  // Without a token there's no way to read the room at all.
  expect((await request.get(`/api/rooms/${join.roomId}`)).status()).toBe(401);
  expect((await request.get(`/api/rooms/${join.roomId}/export`, { headers: { Authorization: `Bearer ${join.token}` } })).status()).toBe(403);
});
