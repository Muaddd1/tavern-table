// Proves events arrive live, rather than on the 15-second heartbeat. The roll card only ever
// appears from a live event, so seeing it on another screen within 5 seconds proves delivery.
import { expect, test, type Browser } from "@playwright/test";

const open = async (browser: Browser) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("tavern.settings.v1", JSON.stringify({ fastRolls: true })));
  return ctx.newPage();
};

test("rolls, secrets and kicks reach the right screens live", async ({ browser }) => {
  const dm = await open(browser);
  await dm.goto("/play");
  await dm.getByTestId("your-name").fill("Dee");
  await dm.getByTestId("room-name").fill("Realtime check");
  await dm.getByTestId("create").click();
  const code = (await dm.getByTestId("invite-code").textContent())!.trim();

  const pia = await open(browser);
  await pia.goto(`/play?code=${code}`);
  await pia.getByTestId("your-name").fill("Pia");
  await pia.getByTestId("join").click();
  await expect(pia.getByTestId("chat-input")).toBeVisible();
  const sam = await open(browser);
  await sam.goto(`/play?code=${code}`);
  await sam.getByTestId("your-name").fill("Sam");
  await sam.getByTestId("join").click();
  await expect(sam.getByTestId("chat-input")).toBeVisible();
  await pia.waitForTimeout(3000); // let every screen finish subscribing

  // A public roll appears on other screens.
  await pia.getByTestId("chat-input").fill("/roll 1d20+1");
  await pia.getByTestId("chat-send").click();
  await expect(sam.getByTestId("roll-card")).toBeVisible({ timeout: 5000 });
  await expect(dm.getByTestId("roll-card")).toBeVisible({ timeout: 5000 });
  const total = (await pia.getByTestId("log-total").last().textContent())!;
  await expect(sam.getByTestId("roll-total").last()).toHaveText(total);
  await expect(dm.getByTestId("roll-total").last()).toHaveText(total);

  // A DM secret roll tells players only that it happened, with no values anywhere in their data.
  await dm.waitForTimeout(6000);
  const bodies: string[] = [];
  sam.on("response", async (r) => { if (r.url().includes("/api/rooms/")) bodies.push(await r.text().catch(() => "")); });
  await dm.getByTestId("secret-roll").click();
  await expect(sam.getByTestId("toast").filter({ hasText: "The DM rolled" })).toBeVisible({ timeout: 5000 });
  await expect(dm.getByTestId("dm-feed-row")).toHaveCount(2);
  await sam.waitForTimeout(1000);
  await expect(sam.getByTestId("log-roll")).toHaveCount(1);
  expect(bodies.join("")).not.toContain("dm-secret");

  // A chat message arrives live too.
  await sam.getByTestId("chat-input").fill("hello table");
  await sam.getByTestId("chat-send").click();
  await expect(pia.getByTestId("roll-log")).toContainText("hello table", { timeout: 5000 });

  // Kicking moves the room to new channels, and the kicked player is shut out.
  dm.on("dialog", (d) => d.accept());
  await dm.locator("li", { hasText: "Sam" }).getByRole("button", { name: "Kick" }).click();
  await expect(sam.getByRole("link", { name: "Back to the lobby" })).toBeVisible({ timeout: 25000 });
  // Everyone else keeps playing on the new channels.
  await pia.waitForTimeout(3000);
  await pia.getByTestId("chat-input").fill("/roll 1d6");
  await pia.getByTestId("chat-send").click();
  await expect(dm.getByTestId("dm-feed-row")).toHaveCount(3, { timeout: 5000 });
});
