// The only way the AI DM can touch the game: named tools that become ordinary room intents.
// The same reducer validates them, and the app rolls all the dice.
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { RoomState } from "@/lib/room/types";

export const DM_TOOLS: Tool[] = [
  { name: "request_check", description: "Ask players for an ability check or saving throw. The app rolls it and reports the result next turn.", input_schema: { type: "object", properties: { label: { type: "string" }, kind: { type: "string", enum: ["skill", "save", "ability"] }, key: { type: "string", description: "A skill id such as perception, or an ability: str, dex, con, int, wis, cha" }, who: { type: "array", items: { type: "string" }, description: "Character names, or empty for everyone" } }, required: ["label", "kind", "key", "who"], additionalProperties: false } },
  { name: "start_combat", description: "Roll initiative for everyone on the map and start combat.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "spawn_monster", description: "Place a monster from the SRD bestiary on the map, with its stats.", input_schema: { type: "object", properties: { name: { type: "string" }, x: { type: "integer" }, y: { type: "integer" }, hp: { type: "integer" }, ac: { type: "integer" }, hidden: { type: "boolean" } }, required: ["name", "x", "y", "hp", "ac"], additionalProperties: false } },
  { name: "monster_attack", description: "Have a monster on the map attack a character. The app rolls to hit and damage, using the character's real AC.", input_schema: { type: "object", properties: { monster: { type: "string" }, target: { type: "string" }, attack: { type: "string" }, toHit: { type: "integer" }, damage: { type: "string", description: "Dice notation, such as 1d6+2" }, damageType: { type: "string" } }, required: ["monster", "target", "attack", "toHit", "damage", "damageType"], additionalProperties: false } },
  { name: "apply_damage", description: "Apply damage from a trap or hazard to a character or monster.", input_schema: { type: "object", properties: { target: { type: "string" }, amount: { type: "integer" }, damageType: { type: "string" } }, required: ["target", "amount"], additionalProperties: false } },
  { name: "give_item", description: "Give a character an item they found or earned.", input_schema: { type: "object", properties: { character: { type: "string" }, item: { type: "string" } }, required: ["character", "item"], additionalProperties: false } },
  { name: "change_environment", description: "Change the scene's room, light and ambient sound for everyone.", input_schema: { type: "object", properties: { environment: { type: "string", enum: ["dungeon", "cave", "forest", "tavern", "castle", "ship", "desert", "infernal"] } }, required: ["environment"], additionalProperties: false } },
  { name: "reveal_area", description: "Clear fog of war from a rectangle of map squares.", input_schema: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" }, width: { type: "integer" }, height: { type: "integer" } }, required: ["x", "y", "width", "height"], additionalProperties: false } },
  { name: "update_memory", description: "Save what must be remembered next session: a short running summary, and known NPCs, quests and locations. Call this when something important changes.", input_schema: { type: "object", properties: { summary: { type: "string" }, npcs: { type: "array", items: { type: "string" } }, quests: { type: "array", items: { type: "string" } }, locations: { type: "array", items: { type: "string" } } }, additionalProperties: false } },
];

export class ToolError extends Error {}
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function memberByCharacter(state: RoomState, name: string) {
  const seat = Object.values(state.seats).find((s) => same(s.character.name, name));
  if (!seat) throw new ToolError(`No character is named ${name}. Characters here: ${Object.values(state.seats).map((s) => s.character.name).join(", ") || "none"}.`);
  return seat.memberId;
}
function tokenByName(state: RoomState, name: string) {
  const t = state.tokens.find((x) => same(x.name, name));
  if (!t) throw new ToolError(`Nothing named ${name} is on the map. On the map: ${state.tokens.map((x) => x.name).join(", ") || "nothing"}.`);
  return t;
}

// Maps a tool call to intents. Bad names throw, and the message goes back to the AI to correct.
export function toolToIntents(name: string, input: Record<string, unknown>, state: RoomState, newId: () => string): Record<string, unknown>[] {
  const str = (k: string) => String(input[k] ?? "");
  const num = (k: string) => Number(input[k] ?? 0);
  switch (name) {
    case "request_check": {
      const who = (input.who as string[] | undefined) ?? [];
      const targets = who.length ? who.map((n) => memberByCharacter(state, n)) : Object.values(state.seats).map((s) => s.memberId);
      if (!targets.length) throw new ToolError("No characters are at the table yet.");
      return [{ type: "request_roll", label: str("label"), kind: str("kind"), key: str("key"), targets }];
    }
    case "start_combat": return [{ type: "start_combat" }];
    case "spawn_monster": return [{ type: "token_add", name: str("name"), x: Math.max(0, Math.min(state.map.width - 1, num("x"))), y: Math.max(0, Math.min(state.map.height - 1, num("y"))), hp: num("hp"), ac: num("ac"), hidden: !!input.hidden }];
    case "monster_attack": return [{ type: "monster_attack", requestId: newId(), tokenId: tokenByName(state, str("monster")).id, targetTokenId: tokenByName(state, str("target")).id, name: str("attack"), toHit: num("toHit"), damage: str("damage"), damageType: str("damageType") }];
    case "apply_damage": {
      const t = tokenByName(state, str("target"));
      if (t.memberId) return [{ type: "session_change", memberId: t.memberId, change: { kind: "damage", amount: num("amount"), damageType: input.damageType ? str("damageType") : undefined } }];
      return [{ type: "token_update", id: t.id, hp: Math.max(0, (t.hp ?? 0) - num("amount")) }];
    }
    case "give_item": return [{ type: "give_item", memberId: memberByCharacter(state, str("character")), name: str("item") }];
    case "change_environment": return [{ type: "scene", environment: str("environment") }];
    case "reveal_area": {
      const cells = [];
      for (let y = num("y"); y < num("y") + num("height") && y < state.map.height; y++) for (let x = num("x"); x < num("x") + num("width") && x < state.map.width; x++) cells.push({ x, y });
      return [{ type: "fog_reveal", cells }];
    }
    case "update_memory": return [{ type: "ai_memory", ...input }];
    default: throw new ToolError(`There's no tool called ${name}.`);
  }
}
