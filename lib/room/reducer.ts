// The room's rules, as a pure function: (state, who, intent, dice) -> new state and events.
// All game math goes through lib/rules. Dice come from the injected rng, so nothing here
// trusts a number from a client.
import { parseNotation, rollParsed, type RollResult } from "@/lib/dice/notation";
import { distanceFeet, lineOfSight } from "@/lib/map/geometry";
import {
  abilityCheck, addCondition, applyDamage, attackRoll, concentrate, deriveSheet, exhaustionPenalty, grantTempHp, heal, longRest, newState, removeCondition, rollDeathSave, RuleError,
  canCastAsRitual, savingThrow, shortRest, spellDamage, eldritchBlastBeams, spendResource, spendSlot, srd, validate, isLegal,
  type Ability, type Character, type Sheet, type SpellDef,
} from "@/lib/rules";
import spellData from "@/data/srd/spells.json";
import { AI_DM_ID } from "./types";
import type { ChatMessage, Intent, Member, Outcome, Roll, RoomState, SecurityFlag, SeatedCharacter, Token, Visibility } from "./types";

const SPELLS = spellData as unknown as SpellDef[];
export type Rng = (sides: number) => number;
export type Ctx = { rng: Rng; now: number; newId: () => string };

const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 20;
const DM_ONLY = new Set(["approve_character", "request_roll", "grant_reroll", "decide_damage", "decide_sheet_change", "settings", "member", "start_combat", "add_combatant", "end_combat", "add_effect", "token_add", "token_update", "token_remove", "map_set", "fog_reveal", "scene", "handout", "monster_attack", "give_item", "ai_memory"]);
export const COLORS = ["#e0803a", "#5aa9e6", "#7bc47f", "#c678dd", "#e5c07b", "#e06c75", "#56b6c2", "#d19a66", "#98c379"];

const dmOf = (s: RoomState) => s.members.find((m) => m.role === "dm" && !m.kicked);

export function createRoom(id: string, name: string, inviteCode: string, dmName: string, dmId: string, now: number, dmMode: RoomState["dmMode"] = "human"): RoomState {
  return {
    id, name, inviteCode, dmMode, maxPlayers: 8, version: 0, seq: 0, epoch: 0, paused: false, sheetsLocked: false, allowManualDice: false, autoApplyDamage: false, tone: "serious",
    members: [
      { id: dmId, name: dmName, role: dmMode === "ai" ? "player" : "dm", color: COLORS[0], diceSkin: "bone", joinedAt: now },
      ...(dmMode === "ai" ? [{ id: AI_DM_ID, name: "AI Dungeon Master", role: "dm" as const, color: "#d9b36c", diceSkin: "obsidian", joinedAt: now }] : []),
    ],
    seats: {}, combat: null, tokens: [],
    map: { name: "Stone hall", width: 30, height: 20, walls: [], fog: false, revealed: [], dark: false, weather: "none", templates: [] },
    scene: { environment: "dungeon", startAt: now },
    rollRequests: [], pendingDamage: [], reactions: [], sheetChanges: [], handouts: [], notes: "", loot: "", xp: 0, npcs: "",
    rateWindow: {}, rejected: {}, cancelled: {}, rerollGrants: {},
  };
}

export function addMember(s: RoomState, m: { id: string; name: string; role: "player" | "spectator"; now: number }): RoomState {
  const players = s.members.filter((x) => x.role === "player" && !x.kicked).length;
  if (m.role === "player" && players >= s.maxPlayers) throw new RuleError(`This room is full (${s.maxPlayers} players).`);
  return { ...s, members: [...s.members, { id: m.id, name: m.name, role: m.role, color: COLORS[s.members.length % COLORS.length], diceSkin: "bone", joinedAt: m.now }] };
}

const sheetFor = (seat: SeatedCharacter): Sheet => deriveSheet(seat.character);

function requireSeat(s: RoomState, memberId: string): SeatedCharacter {
  const seat = s.seats[memberId];
  if (!seat) throw new RuleError("Choose a character first.");
  if (!seat.approved) throw new RuleError("The DM hasn't approved your character yet.");
  return seat;
}

// Fields that mustn't change during a session without the DM's approval.
function baseStatsChanged(a: Character, b: Character) {
  const pick = (c: Character) => JSON.stringify([c.classes, c.baseScores, c.backgroundBonus, c.feats, c.skillProficiencies, c.expertise, c.speciesId, c.lineageId, c.backgroundId, c.options, c.weaponMasteries, c.hpRolls, c.homebrew, c.customFeatures, c.customAttacks, c.equipment.map((e) => [e.itemId, e.bonus])]);
  return pick(a) !== pick(b);
}

// Builds the formula for a roll from the rules engine, at the moment of rolling.
function engineRoll(seat: SeatedCharacter, kind: string, key?: string) {
  const sheet = sheetFor(seat);
  const conds = seat.session.conditions;
  const penalty = seat.session.exhaustion ? [{ label: `Exhaustion ${seat.session.exhaustion}`, value: exhaustionPenalty(seat.session.exhaustion) }] : [];
  if (kind === "skill") {
    const check = sheet.skills[key ?? ""];
    if (!check) throw new RuleError("Unknown skill.");
    const r = abilityCheck(conds, { advantageFrom: check.advantageFrom });
    return { label: `${titleCase(key!)} check`, parts: [...check.value.parts, ...penalty], ...r };
  }
  if (kind === "save") {
    const check = sheet.saves[key as Ability];
    if (!check) throw new RuleError("Unknown saving throw.");
    const r = savingThrow(key as Ability, conds, { advantageFrom: check.advantageFrom });
    return { label: `${titleCase(key!)} save`, parts: [...check.value.parts, ...penalty], autoFail: r.autoFail, state: r.state, advantageFrom: r.advantageFrom, disadvantageFrom: r.disadvantageFrom };
  }
  if (kind === "ability") {
    const mod = sheet.mods[key as Ability];
    if (!mod) throw new RuleError("Unknown ability.");
    const r = abilityCheck(conds);
    return { label: `${titleCase(key!)} check`, parts: [...mod.parts, ...penalty], ...r };
  }
  if (kind === "initiative") {
    const r = abilityCheck(conds, { advantageFrom: [...sheet.initiative.advantageFrom, ...(conds.includes("invisible") ? ["Invisible"] : [])], disadvantageFrom: conds.includes("incapacitated") ? ["Incapacitated"] : [] });
    return { label: "Initiative", parts: [...sheet.initiative.value.parts, ...penalty], ...r };
  }
  if (kind === "death-save") return { label: "Death save", parts: [], state: "normal" as const, advantageFrom: [], disadvantageFrom: [] };
  throw new RuleError("Unknown roll.");
}

// An ordinary Unarmed Strike deals a flat 1 + Strength, so it has no dice to roll.
function rollDamage(notation: string, rng: Rng): RollResult {
  if (notation.includes("d")) return rollParsed(parseNotation(notation), rng);
  const total = [...notation.matchAll(/[+-]?\d+/g)].reduce((n, m) => n + +m[0], 0);
  return { dice: [], modifier: total, total, advantage: "normal" };
}

const titleCase = (s: string) => {
  const names: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  return names[s] ?? s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
};

const sum = (parts: { value: number }[]) => parts.reduce((n, p) => n + p.value, 0);

export function applyIntent(state: RoomState, actorId: string, intent: Intent, ctx: Ctx): Outcome {
  const actor: Member | undefined = state.members.find((m) => m.id === actorId);
  if (!actor || actor.kicked) throw new RuleError("You aren't in this room.");
  const isDm = actor.role === "dm";
  // A signal sent during an AI game also pauses the AI's next turn, through the room's event log.
  if (DM_ONLY.has(intent.type) && !isDm) throw new RuleError("Only the DM can do that.");
  if (actor.role === "spectator" && intent.type !== "chat") throw new RuleError("Spectators can only chat.");
  if (actor.muted && intent.type === "chat") throw new RuleError("The DM has muted you.");
  if (state.paused && !isDm && !["chat", "safety_signal"].includes(intent.type)) throw new RuleError("The DM has paused the game.");

  const s: RoomState = { ...state };
  const out: Outcome = { state: s, events: [], rolls: [], audits: [], flags: [], chat: [] };
  const emit = (type: string, payload: Record<string, unknown>, audience: Outcome["events"][number]["audience"] = { kind: "all" }) => out.events.push({ type, audience, payload });
  const audit = (memberId: string, field: string, before: unknown, after: unknown) => {
    const a = { id: ctx.newId(), memberId, actorId, field, before, after, at: ctx.now };
    out.audits.push(a);
    emit("sheet.audit", a, { kind: "dm" });
  };
  const flag = (memberId: string, kind: string, detail: string) => {
    const f: SecurityFlag = { id: ctx.newId(), memberId, kind, detail, at: ctx.now };
    out.flags.push(f);
    emit("flag.raised", f, { kind: "dm" });
  };
  const chat = (m: Omit<ChatMessage, "id" | "at">, audience: Outcome["events"][number]["audience"] = { kind: "all" }) => {
    const message = { ...m, id: ctx.newId(), at: ctx.now };
    out.chat.push(message);
    emit("chat.message", message, audience);
  };

  // Commits a roll with its log row and the right event for each audience. Dialogs can't undo this.
  const commitRoll = (r: { requestId: string; kind: string; label: string; formula: string; result: RollResult; parts: Roll["parts"]; advantageFrom: string[]; disadvantageFrom: string[]; visibility: Visibility; source: Roll["source"]; rollRequestId?: string; rerollOf?: string; throwVector?: [number, number] }) => {
    const seat = s.seats[actorId];
    const roll: Roll = { ...r, id: ctx.newId(), memberId: actorId, characterLabel: seat?.character.name ?? actor.name, at: ctx.now, color: actor.color, skin: actor.diceSkin };
    out.rolls.push(roll);
    const others = s.members.filter((m) => m.id !== actorId && m.role !== "dm").map((m) => m.id);
    if (r.visibility === "public") emit("roll.result", { roll });
    else if (r.visibility === "dm-only") {
      emit("roll.result", { roll }, { kind: "members", ids: [actorId, ...s.members.filter((m) => m.role === "dm").map((m) => m.id)].filter((v, i, a) => a.indexOf(v) === i) });
      if (others.length) emit("roll.stub", { memberId: actorId, name: roll.characterLabel, at: ctx.now, text: `${roll.characterLabel} rolled privately for the DM` }, { kind: "members", ids: others });
    } else {
      emit("roll.result", { roll }, { kind: "dm" });
      if (others.length) emit("roll.stub", { memberId: actorId, name: "The DM", at: ctx.now, text: "The DM rolled" }, { kind: "members", ids: others });
    }
    return roll;
  };

  const checkRate = () => {
    const recent = (s.rateWindow[actorId] ?? []).filter((t) => ctx.now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) throw new RuleError("Too many rolls. Wait a few seconds.");
    s.rateWindow = { ...s.rateWindow, [actorId]: [...recent, ctx.now] };
    if (recent.length === Math.floor(RATE_LIMIT * 0.75)) flag(actorId, "roll-rate", `${recent.length + 1} rolls in ${RATE_WINDOW_MS / 1000} seconds`);
  };

  const answerRequest = (rollRequestId?: string) => {
    if (!rollRequestId) return;
    const req = s.rollRequests.find((r) => r.id === rollRequestId);
    if (!req || req.closed) throw new RuleError("That roll request is closed.");
    if (!req.targets.includes(actorId)) throw new RuleError("That roll request isn't for you.");
    if (req.answered.includes(actorId)) throw new RuleError("You already answered that roll request.");
    const answered = [...req.answered, actorId];
    const closed = req.targets.every((t) => answered.includes(t));
    s.rollRequests = s.rollRequests.map((r) => (r.id === req.id ? { ...r, answered, closed } : r));
    if (closed) emit("roll.request_closed", { id: req.id });
  };

  const setSession = (memberId: string, session: SeatedCharacter["session"]) => {
    s.seats = { ...s.seats, [memberId]: { ...s.seats[memberId], session } };
    syncTokenFromSeat(memberId);
  };
  const syncTokenFromSeat = (memberId: string) => {
    const seat = s.seats[memberId];
    if (!seat) return;
    s.tokens = s.tokens.map((t) => (t.memberId === memberId ? { ...t, hp: seat.session.hp, conditions: seat.session.conditions } : t));
  };
  const nextCombatTurn = () => {
    const c = s.combat!;
    if (!c.order.length) return;
    const ended = c.order[c.turn];
    const reminders = c.effects.filter((e) => e.combatantId === ended?.id && e.ends === "end");
    let turn = c.turn + 1, round = c.round;
    if (turn >= c.order.length) { turn = 0; round++; }
    const started = c.order[turn];
    const startReminders = c.effects.filter((e) => e.combatantId === started.id && e.ends === "start");
    s.combat = { ...c, turn, round, effects: c.effects.filter((e) => !reminders.includes(e) && !startReminders.includes(e)) };
    for (const e of [...reminders, ...startReminders]) emit("reminder.effect", { label: e.label, ended: true });
    // Hidden combatants' turns aren't announced to players.
    emit("turn.advanced", { round, turn, name: started.hidden ? "Someone" : started.name, memberId: started.hidden ? undefined : started.memberId });
  };

  switch (intent.type) {
    case "set_character": {
      if (actor.role !== "player" && !isDm) throw new RuleError("Only players bring characters.");
      if (s.sheetsLocked) throw new RuleError("The DM has locked all sheets.");
      const c = intent.character;
      const sheet = deriveSheet(c); // throws on unknown class, species or item ids
      if (!isLegal(validate(c, { override: true }))) throw new RuleError("That character can't be read.");
      const session = newState(sheet);
      s.seats = { ...s.seats, [actorId]: { memberId: actorId, approved: isDm || s.dmMode === "ai", character: c, session, approvedCopy: isDm ? c : undefined } };
      emit("character.submitted", { memberId: actorId, name: c.name });
      if (isDm || s.dmMode === "ai") addPlayerToken(s, actorId, sheet, ctx);
      break;
    }
    case "approve_character": {
      const seat = s.seats[intent.memberId];
      if (!seat) throw new RuleError("That player hasn't chosen a character.");
      s.seats = { ...s.seats, [intent.memberId]: { ...seat, approved: intent.approved, approvedCopy: intent.approved ? seat.character : undefined } };
      if (intent.approved && !s.tokens.some((t) => t.memberId === intent.memberId)) addPlayerToken(s, intent.memberId, sheetFor(seat), ctx);
      emit("character.approved", { memberId: intent.memberId, approved: intent.approved, intro: seat.character.details?.intro });
      break;
    }
    case "chat": {
      if (intent.mode === "whisper") {
        const to = intent.to ?? dmOf(s)?.id;
        if (!to || !s.members.some((m) => m.id === to)) throw new RuleError("No one to whisper to.");
        chat({ memberId: actorId, name: actor.name, mode: "whisper", body: intent.body, to }, { kind: "members", ids: [...new Set([actorId, to])] });
      } else {
        const seatName = s.seats[actorId]?.character.name;
        chat({ memberId: actorId, name: intent.mode === "ic" && seatName ? seatName : actor.name, mode: intent.mode, body: intent.body });
      }
      break;
    }
    case "roll": {
      checkRate();
      let rerollOf = intent.rerollOf;
      if (rerollOf) {
        if (s.rerollGrants[rerollOf] !== actorId) throw new RuleError("A re-roll needs the DM's permission.");
        const { [rerollOf]: _used, ...rest } = s.rerollGrants;
        void _used;
        s.rerollGrants = rest;
      } else rerollOf = undefined;
      answerRequest(intent.rollRequestId);
      const visibility: Visibility = intent.visibility === "dm-secret" && !isDm ? "dm-only" : intent.visibility;
      if (intent.kind === "typed") {
        const parsed = parseNotation(intent.notation ?? "");
        commitRoll({ requestId: intent.requestId, kind: "typed", label: `Typed: ${parsed.text}`, formula: parsed.text, result: rollParsed(parsed, ctx.rng), parts: [], advantageFrom: [], disadvantageFrom: [], visibility, source: "typed", rerollOf, throwVector: intent.throwVector });
        const typedCount = (s.rejected[`typed:${actorId}`] ?? 0) + 1;
        s.rejected = { ...s.rejected, [`typed:${actorId}`]: typedCount };
        if (typedCount === 15) flag(actorId, "many-typed-rolls", "15 typed rolls this session");
        break;
      }
      if (intent.kind === "hit-die") {
        const seat = requireSeat(s, actorId);
        const sheet = sheetFor(seat);
        const die = Object.keys(sheet.hitDice).find((d) => (seat.session.hitDiceUsed[d] ?? 0) < sheet.hitDice[d] && (!intent.key || d === intent.key));
        if (!die) throw new RuleError("No Hit Dice left.");
        const result = rollParsed(parseNotation(`1${die}`), ctx.rng);
        const healed = Math.max(1, result.total + sheet.mods.con.value);
        commitRoll({ requestId: intent.requestId, kind: "hit-die", label: `Hit Die (${die})`, formula: `1${die}+CON`, result, parts: sheet.mods.con.parts, advantageFrom: [], disadvantageFrom: [], visibility, source: "engine", throwVector: intent.throwVector });
        const next = { ...seat.session, hitDiceUsed: { ...seat.session.hitDiceUsed, [die]: (seat.session.hitDiceUsed[die] ?? 0) + 1 }, hp: Math.min(sheet.hpMax.value, seat.session.hp + healed) };
        audit(actorId, "hp", seat.session.hp, next.hp);
        setSession(actorId, next);
        break;
      }
      const seat = requireSeat(s, actorId);
      const e = engineRoll(seat, intent.kind, intent.key);
      const parts = [...e.parts];
      if (intent.bonus) parts.push({ label: `PLAYER-ADDED: ${intent.bonusReason ?? "situational bonus"}`, value: intent.bonus });
      const advFrom = [...e.advantageFrom, ...(intent.claim === "advantage" ? [`PLAYER-ADDED: ${intent.claimReason ?? "advantage"}`] : [])];
      const disFrom = [...e.disadvantageFrom, ...(intent.claim === "disadvantage" ? [`PLAYER-ADDED: ${intent.claimReason ?? "disadvantage"}`] : [])];
      const mode = advFrom.length && disFrom.length ? "normal" : advFrom.length ? "advantage" : disFrom.length ? "disadvantage" : "normal";
      const modifier = sum(parts);
      const result = rollParsed({ dice: [{ count: 1, sides: 20 }], modifier, advantage: mode, text: "" }, ctx.rng);
      const roll = commitRoll({ requestId: intent.requestId, kind: intent.kind, label: e.label, formula: `1d20${modifier >= 0 ? "+" : ""}${modifier}${mode === "normal" ? "" : ` ${mode}`}`, result, parts, advantageFrom: advFrom, disadvantageFrom: disFrom, visibility, source: "engine", rollRequestId: intent.rollRequestId, rerollOf, throwVector: intent.throwVector });
      if ("autoFail" in e && e.autoFail) emit("save.autofail", { rollId: roll.id, label: e.label });
      if (intent.kind === "death-save") {
        const sheet = sheetFor(seat);
        setSession(actorId, rollDeathSave(seat.session, sheet, result.dice[0].value));
      }
      if (intent.kind === "initiative" && s.combat) {
        const sheetName = seat.character.name;
        const order = s.combat.order.filter((o) => o.memberId !== actorId);
        const token = s.tokens.find((t) => t.memberId === actorId);
        s.combat = { ...s.combat, order: sortOrder([...order, { id: `m:${actorId}`, name: sheetName, initiative: result.total, memberId: actorId, tokenId: token?.id }]) };
        emit("initiative.set", { memberId: actorId, name: sheetName, total: result.total });
      }
      break;
    }
    case "manual_roll": {
      if (!s.allowManualDice && !isDm) throw new RuleError("The DM hasn't allowed physical dice.");
      checkRate();
      answerRequest(intent.rollRequestId);
      commitRoll({ requestId: intent.requestId, kind: "manual", label: `MANUAL: ${intent.label}`, formula: "entered by hand", result: { dice: [], modifier: intent.value, total: intent.value, advantage: "normal" }, parts: [], advantageFrom: [], disadvantageFrom: [], visibility: intent.visibility, source: "manual", rollRequestId: intent.rollRequestId });
      break;
    }
    case "request_roll": {
      const req = { id: ctx.newId(), label: intent.label, kind: intent.kind, key: intent.key, targets: intent.targets, answered: [], createdBy: actorId };
      s.rollRequests = [...s.rollRequests, req];
      emit("roll.requested", req, { kind: "members", ids: [...new Set([actorId, ...intent.targets])] });
      break;
    }
    case "grant_reroll": {
      const memberId = lookupRollOwner(intent.rollId);
      s.rerollGrants = { ...s.rerollGrants, [intent.rollId]: memberId };
      audit(memberId, "reroll-granted", intent.rollId, intent.reason);
      emit("reroll.granted", { rollId: intent.rollId, memberId }, { kind: "members", ids: [memberId, actorId] });
      break;
    }
    case "attack": {
      checkRate();
      const seat = requireSeat(s, actorId);
      const sheet = sheetFor(seat);
      const attack = sheet.attacks.find((a) => a.id === intent.attackId);
      if (!attack) throw new RuleError("That attack isn't on your sheet.");
      const target = s.tokens.find((t) => t.id === intent.targetTokenId);
      if (!target) throw new RuleError("That target isn't on the map.");
      const me = s.tokens.find((t) => t.memberId === actorId);
      const ranged = !!attack.range && attack.properties.includes("ammunition");
      const distance = me ? distanceFeet(me, target) : 5;
      const enemyAdjacent = me ? s.tokens.some((t) => !t.memberId && !t.hidden && t.id !== target.id && distanceFeet(t, me) <= 5) || distance <= 5 : false;
      const roll = attackRoll({ attacker: seat.session.conditions, target: target.conditions, distanceFeet: distance, ranged, enemyAdjacent, disadvantageFrom: attack.disadvantageFrom });
      const penalty = seat.session.exhaustion ? exhaustionPenalty(seat.session.exhaustion) : 0;
      const parts = [...attack.toHit.parts, ...(penalty ? [{ label: `Exhaustion ${seat.session.exhaustion}`, value: penalty }] : [])];
      const modifier = sum(parts);
      const toHit = rollParsed({ dice: [{ count: 1, sides: 20 }], modifier, advantage: roll.state, text: "" }, ctx.rng);
      const face = toHit.dice.find((d) => d.kept)!.value;
      const critical = face >= attack.critMin || (roll.autoCrit && face !== 1);
      const hit = face !== 1 && (critical || target.ac === undefined || toHit.total >= target.ac);
      const visibleLabel = target.hidden ? "a target" : target.name;
      commitRoll({ requestId: intent.requestId, kind: "attack", label: `${attack.name} vs ${visibleLabel}`, formula: `1d20${modifier >= 0 ? "+" : ""}${modifier}${roll.state === "normal" ? "" : ` ${roll.state}`}`, result: toHit, parts, advantageFrom: roll.advantageFrom, disadvantageFrom: roll.disadvantageFrom, visibility: intent.visibility, source: "engine", throwVector: intent.throwVector });
      emit("attack.rolled", { hit, critical, attacker: actor.name, target: visibleLabel, name: attack.name });
      if (hit) {
        const notation = critical ? attack.critDamage : attack.damage;
        const damage = rollDamage(notation, ctx.rng);
        commitRoll({ requestId: `${intent.requestId}:damage`, kind: "damage", label: `${attack.name} damage${critical ? " (critical)" : ""}`, formula: notation, result: damage, parts: attack.damageBonus.parts, advantageFrom: [], disadvantageFrom: [], visibility: intent.visibility, source: "engine" });
        applyOrPropose(Math.max(0, damage.total), attack.damageType, critical, target, attack.name);
        offerOnHit(attack, seat);
      } else if (attack.mastery?.grazeDamage) {
        emit("mastery.graze", { amount: attack.mastery.grazeDamage, target: visibleLabel });
        applyOrPropose(attack.mastery.grazeDamage, attack.damageType, false, target, `${attack.name} (Graze)`);
      }
      break;
    }
    case "cast_spell": {
      checkRate();
      const seat = requireSeat(s, actorId);
      const sheet = sheetFor(seat);
      const spell = SPELLS.find((x) => x.id === intent.spellId);
      const caster = sheet.spellcasting.classes.find((c) => c.classId === intent.classId);
      if (!spell || !caster) throw new RuleError("You can't cast that.");
      const known = seat.character.spells?.find((x) => x.spellId === spell.id && x.classId === intent.classId);
      if (!known && !(intent.ritual && caster.ritualFromBook)) throw new RuleError(`${spell.name} isn't prepared.`);
      if (sheet.armorWorn?.untrained) throw new RuleError("You can't cast spells in armor you aren't trained with.");
      let session = seat.session;
      let slot = 0;
      if (spell.level > 0 && intent.ritual) {
        if (!canCastAsRitual(spell, caster, { prepared: !!known, inSpellbook: true })) throw new RuleError(`${spell.name} can't be cast as a Ritual.`);
        slot = spell.level;
      } else if (spell.level > 0) {
        slot = intent.slotLevel ?? spell.level;
        if (slot < spell.level) throw new RuleError(`${spell.name} needs a level ${spell.level} slot or higher.`);
        session = spendSlot(session, sheet, slot);
      }
      if (spell.concentration) session = concentrate(session, spell.id);
      setSession(actorId, session);
      audit(actorId, `cast:${spell.id}`, slot, intent.ritual ? "ritual" : "slot");
      emit("spell.cast", { who: seat.character.name, spell: spell.name, level: slot, dc: spell.save ? caster.saveDc.value : undefined, save: spell.save, ritual: !!intent.ritual });
      const target = intent.targetTokenId ? s.tokens.find((t) => t.id === intent.targetTokenId) : undefined;
      const level = sheet.level;
      const damage = spellDamage(spell, slot, level);
      if (spell.attack) {
        if (!target) throw new RuleError("Choose a target for that spell.");
        const me = s.tokens.find((t) => t.memberId === actorId);
        const beams = spell.id === "eldritch-blast" ? eldritchBlastBeams(level) : 1;
        for (let beam = 0; beam < beams; beam++) {
          const roll = attackRoll({ attacker: session.conditions, target: target.conditions, distanceFeet: me ? distanceFeet(me, target) : 5, ranged: spell.attack === "ranged" });
          const modifier = sum(caster.attack.parts);
          const toHit = rollParsed({ dice: [{ count: 1, sides: 20 }], modifier, advantage: roll.state, text: "" }, ctx.rng);
          const face = toHit.dice.find((d) => d.kept)!.value;
          const critical = face === 20 || (roll.autoCrit && face !== 1);
          const hit = face !== 1 && (critical || target.ac === undefined || toHit.total >= target.ac);
          const suffix = beam ? `:${beam}` : "";
          commitRoll({ requestId: `${intent.requestId}${suffix}`, kind: "attack", label: `${spell.name} vs ${target.hidden ? "a target" : target.name}`, formula: `1d20${modifier >= 0 ? "+" : ""}${modifier}`, result: toHit, parts: caster.attack.parts, advantageFrom: roll.advantageFrom, disadvantageFrom: roll.disadvantageFrom, visibility: intent.visibility, source: "engine" });
          emit("attack.rolled", { hit, critical, attacker: seat.character.name, target: target.hidden ? "a target" : target.name, name: spell.name });
          if (hit && damage) {
            const notation = critical ? damage.replace(/^(\d+)d/, (_, n) => `${+n * 2}d`) : damage;
            const rolled = rollDamage(notation, ctx.rng);
            commitRoll({ requestId: `${intent.requestId}${suffix}:damage`, kind: "damage", label: `${spell.name} damage`, formula: notation, result: rolled, parts: [], advantageFrom: [], disadvantageFrom: [], visibility: intent.visibility, source: "engine" });
            applyOrPropose(Math.max(0, rolled.total), spell.damageType ?? "force", critical, target, spell.name);
          }
        }
      } else if (damage) {
        // A save spell's damage is rolled once and shared. Each target's save is the DM's call.
        const rolled = rollDamage(damage, ctx.rng);
        commitRoll({ requestId: intent.requestId, kind: "damage", label: `${spell.name} damage${spell.save ? ` (DC ${caster.saveDc.value} ${spell.save.toUpperCase()} save)` : ""}`, formula: damage, result: rolled, parts: [], advantageFrom: [], disadvantageFrom: [], visibility: intent.visibility, source: "engine" });
        if (target) applyOrPropose(Math.max(0, rolled.total), spell.damageType ?? "force", false, target, spell.name);
      }
      break;
    }
    case "monster_attack": {
      const token = s.tokens.find((t) => t.id === intent.tokenId);
      const target = s.tokens.find((t) => t.id === intent.targetTokenId);
      if (!token || !target) throw new RuleError("Choose a monster and a target on the map.");
      const targetSeat = target.memberId ? s.seats[target.memberId] : undefined;
      const targetAc = targetSeat ? sheetFor(targetSeat).ac.value : target.ac;
      const roll = attackRoll({ attacker: token.conditions, target: target.conditions, distanceFeet: distanceFeet(token, target) });
      const toHit = rollParsed({ dice: [{ count: 1, sides: 20 }], modifier: intent.toHit, advantage: roll.state, text: "" }, ctx.rng);
      const face = toHit.dice.find((d) => d.kept)!.value;
      const critical = face === 20 || (roll.autoCrit && face !== 1);
      const hit = face !== 1 && (critical || targetAc === undefined || toHit.total >= targetAc);
      const label = token.hidden ? "Something" : token.name;
      commitRoll({ requestId: intent.requestId, kind: "attack", label: `${label}'s ${intent.name} vs ${target.name}`, formula: `1d20${intent.toHit >= 0 ? "+" : ""}${intent.toHit}`, result: toHit, parts: [{ label: intent.name, value: intent.toHit }], advantageFrom: roll.advantageFrom, disadvantageFrom: roll.disadvantageFrom, visibility: intent.visibility, source: "engine" });
      emit("attack.rolled", { hit, critical, attacker: label, target: target.name, name: intent.name });
      if (target.memberId) promptReaction(target.memberId, hit ? `${label} hit you with ${intent.name}. Use your Reaction?` : `${label} missed you with ${intent.name}. Use your Reaction?`);
      if (hit) {
        const doubled = critical ? intent.damage.replace(/^(\d+)d/, (_, n) => `${+n * 2}d`) : intent.damage;
        const damage = rollDamage(doubled, ctx.rng);
        commitRoll({ requestId: `${intent.requestId}:damage`, kind: "damage", label: `${intent.name} damage${critical ? " (critical)" : ""}`, formula: doubled, result: damage, parts: [], advantageFrom: [], disadvantageFrom: [], visibility: intent.visibility, source: "engine" });
        dealDamage(target, Math.max(0, damage.total), intent.damageType, critical, intent.name);
      }
      break;
    }
    case "reaction_answer": {
      const prompt = s.reactions.find((r) => r.id === intent.id);
      if (!prompt || prompt.memberId !== actorId) throw new RuleError("That prompt has passed.");
      s.reactions = s.reactions.filter((r) => r.id !== intent.id);
      if (intent.use) emit("reaction.used", { memberId: actorId, name: s.seats[actorId]?.character.name ?? actor.name, text: prompt.text });
      break;
    }
    case "attack_cancelled": {
      const n = (s.cancelled[actorId] ?? 0) + 1;
      s.cancelled = { ...s.cancelled, [actorId]: n };
      if (n % 5 === 0) flag(actorId, "cancelled-actions", `${n} cancelled attacks this session`);
      break;
    }
    case "decide_damage": {
      const p = s.pendingDamage.find((d) => d.id === intent.id);
      if (!p) throw new RuleError("That damage was already decided.");
      s.pendingDamage = s.pendingDamage.filter((d) => d.id !== p.id);
      const target = s.tokens.find((t) => t.id === p.targetTokenId);
      if (intent.apply && target) dealDamage(target, p.amount, p.type, p.critical, p.label);
      else emit("damage.rejected", { label: p.label });
      break;
    }
    case "session_change": {
      const memberId = intent.memberId ?? actorId;
      if (memberId !== actorId && !isDm) throw new RuleError("You can only change your own character.");
      const seat = requireSeat(s, memberId);
      const sheet = sheetFor(seat);
      const c = intent.change;
      let next = seat.session;
      switch (c.kind) {
        case "damage": {
          const r = applyDamage(next, sheet, { amount: c.amount, type: c.damageType });
          next = r.state;
          if (r.concentrationDc) emit("concentration.check", { memberId, dc: r.concentrationDc, spell: next.concentration });
          break;
        }
        case "heal":
          next = heal(next, sheet, c.amount);
          if (!isDm) flag(memberId, "manual-heal", `${actor.name} added ${c.amount} HP by hand`);
          break;
        case "temp": next = grantTempHp(next, c.amount); break;
        case "condition": next = c.on ? addCondition(next, c.id) : removeCondition(next, c.id); break;
        case "resource": next = spendResource(next, sheet, c.id); break;
        case "slot": next = spendSlot(next, sheet, c.level); break;
        case "rest": next = c.rest === "short" ? shortRest(next, sheet) : longRest(next, sheet); break;
        case "concentrate": next = c.spellId ? concentrate(next, c.spellId) : { ...next, concentration: null }; break;
        case "equip": {
          if (!seat.character.equipment.some((e) => e.itemId === c.itemId)) throw new RuleError("You don't own that item.");
          const character = { ...seat.character, equipment: seat.character.equipment.map((e) => (e.itemId === c.itemId ? { ...e, equipped: c.equipped } : e)) };
          s.seats = { ...s.seats, [memberId]: { ...seat, character } };
          audit(memberId, `equip:${c.itemId}`, !c.equipped, c.equipped);
          emit("sheet.changed", { memberId });
          out.state = s;
          break;
        }
      }
      if (c.kind !== "equip") {
        audit(memberId, c.kind, snapshotOf(seat.session), snapshotOf(next));
        setSession(memberId, next);
        emit("character.changed", { memberId });
      }
      break;
    }
    case "request_sheet_change": {
      if (s.sheetsLocked) throw new RuleError("The DM has locked all sheets.");
      const seat = s.seats[actorId];
      if (!seat) throw new RuleError("Choose a character first.");
      if (!baseStatsChanged(seat.character, intent.after)) {
        s.seats = { ...s.seats, [actorId]: { ...seat, character: intent.after } };
        audit(actorId, "details", null, "non-mechanical change");
        break;
      }
      deriveSheet(intent.after);
      const change = { id: ctx.newId(), memberId: actorId, before: seat.character, after: intent.after, status: "pending" as const, at: ctx.now };
      s.sheetChanges = [...s.sheetChanges, change];
      emit("sheet.change_requested", { id: change.id, memberId: actorId }, { kind: "dm" });
      break;
    }
    case "decide_sheet_change": {
      const change = s.sheetChanges.find((c) => c.id === intent.id && c.status === "pending");
      if (!change) throw new RuleError("That change was already decided.");
      s.sheetChanges = s.sheetChanges.map((c) => (c.id === intent.id ? { ...c, status: intent.approve ? "approved" : "rejected" } : c));
      if (intent.approve) {
        const seat = s.seats[change.memberId];
        s.seats = { ...s.seats, [change.memberId]: { ...seat, character: change.after, approvedCopy: change.after } };
        audit(change.memberId, "base-stats", change.before, change.after);
      }
      emit("sheet.change_decided", { memberId: change.memberId, approved: intent.approve });
      break;
    }
    case "settings": {
      const { type: _t, ...patch } = intent;
      void _t;
      Object.assign(s, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      if (intent.paused !== undefined) emit(intent.paused ? "room.paused" : "room.resumed", {});
      if (intent.sheetsLocked !== undefined) emit("sheets.locked", { locked: intent.sheetsLocked });
      break;
    }
    case "member": {
      const target = s.members.find((m) => m.id === intent.memberId);
      if (!target) throw new RuleError("No such member.");
      if (intent.action === "kick") {
        if (target.id === actorId) throw new RuleError("You can't kick yourself.");
        s.members = s.members.map((m) => (m.id === target.id ? { ...m, kicked: true } : m));
        s.tokens = s.tokens.filter((t) => t.memberId !== target.id);
        s.epoch++;
        emit("member.kicked", { memberId: target.id });
      } else if (intent.action === "mute" || intent.action === "unmute") {
        s.members = s.members.map((m) => (m.id === target.id ? { ...m, muted: intent.action === "mute" } : m));
        emit("member.muted", { memberId: target.id, muted: intent.action === "mute" });
      } else {
        if (target.role === "spectator" || target.kicked) throw new RuleError("Choose a player.");
        s.members = s.members.map((m) => (m.id === target.id ? { ...m, role: "dm" } : m.id === actorId ? { ...m, role: "player" } : m));
        s.epoch++;
        emit("dm.transferred", { memberId: target.id });
      }
      emit("room.epoch_changed", { epoch: s.epoch });
      break;
    }
    case "start_combat": {
      if (s.combat) throw new RuleError("Combat is already running.");
      // One button rolls for everyone, on the server, using each sheet's Initiative.
      const order = [];
      for (const seat of Object.values(s.seats).filter((x) => x.approved)) {
        const member = s.members.find((m) => m.id === seat.memberId);
        if (!member || member.kicked) continue;
        const e = engineRoll(seat, "initiative");
        const modifier = sum(e.parts);
        const result = rollParsed({ dice: [{ count: 1, sides: 20 }], modifier, advantage: e.state, text: "" }, ctx.rng);
        const roll: Roll = { id: ctx.newId(), requestId: `init:${ctx.newId()}`, memberId: seat.memberId, characterLabel: seat.character.name, kind: "initiative", label: "Initiative", formula: `1d20${modifier >= 0 ? "+" : ""}${modifier}`, result, parts: e.parts, advantageFrom: e.advantageFrom, disadvantageFrom: e.disadvantageFrom, visibility: "public", source: "engine", at: ctx.now, color: member.color, skin: member.diceSkin };
        out.rolls.push(roll);
        emit("roll.result", { roll });
        order.push({ id: `m:${seat.memberId}`, name: seat.character.name, initiative: result.total, memberId: seat.memberId, tokenId: s.tokens.find((t) => t.memberId === seat.memberId)?.id });
      }
      for (const t of s.tokens.filter((x) => !x.memberId)) {
        const result = rollParsed({ dice: [{ count: 1, sides: 20 }], modifier: 0, advantage: "normal", text: "" }, ctx.rng);
        order.push({ id: `t:${t.id}`, name: t.name, initiative: result.total, tokenId: t.id, hidden: t.hidden });
      }
      s.combat = { round: 1, order: sortOrder(order), turn: 0, effects: [] };
      emit("combat.started", { order: s.combat.order.filter((o) => !o.hidden).map((o) => ({ name: o.name, initiative: o.initiative })) });
      break;
    }
    case "add_combatant": {
      if (!s.combat) throw new RuleError("Start combat first.");
      s.combat = { ...s.combat, order: sortOrder([...s.combat.order, { id: ctx.newId(), name: intent.name, initiative: intent.initiative, tokenId: intent.tokenId, hidden: intent.hidden }]) };
      emit("combat.changed", {});
      break;
    }
    case "end_turn": {
      if (!s.combat) throw new RuleError("There's no combat running.");
      const current = s.combat.order[s.combat.turn];
      if (!isDm && current?.memberId !== actorId) throw new RuleError("It isn't your turn.");
      nextCombatTurn();
      break;
    }
    case "end_combat": s.combat = null; emit("combat.ended", {}); break;
    case "add_effect": {
      if (!s.combat) throw new RuleError("Start combat first.");
      s.combat = { ...s.combat, effects: [...s.combat.effects, { id: ctx.newId(), label: intent.label, combatantId: intent.combatantId, ends: intent.ends }] };
      emit("combat.changed", {});
      break;
    }
    case "token_add": {
      const t: Token = { id: ctx.newId(), name: intent.name, x: intent.x, y: intent.y, size: intent.size ?? 1, hp: intent.hp, hpMax: intent.hp, ac: intent.ac, hidden: intent.hidden, conditions: [], memberId: intent.memberId, monsterId: intent.monsterId, color: "#8a3b3b", darkvision: intent.darkvision, light: intent.light };
      s.tokens = [...s.tokens, t];
      emit("map.changed", {});
      break;
    }
    case "token_update": {
      const { id, type: _t, ...patch } = intent;
      void _t;
      s.tokens = s.tokens.map((t) => (t.id === id ? { ...t, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } : t));
      emit("map.changed", {});
      break;
    }
    case "token_remove": s.tokens = s.tokens.filter((t) => t.id !== intent.id); emit("map.changed", {}); break;
    case "token_move": {
      const t = s.tokens.find((x) => x.id === intent.id);
      if (!t) throw new RuleError("That token isn't on the map.");
      if (!isDm && t.memberId !== actorId) throw new RuleError("That isn't your token.");
      if (intent.x >= s.map.width || intent.y >= s.map.height) throw new RuleError("That's off the map.");
      if (!isDm) {
        if (!lineOfSight(t, intent, s.map.walls)) throw new RuleError("A wall is in the way.");
        const seat = requireSeat(s, actorId);
        if (seat.session.conditions.some((c) => ["grappled", "restrained", "paralyzed", "petrified", "unconscious"].includes(c))) throw new RuleError("Your Speed is 0.");
      }
      s.tokens = s.tokens.map((x) => (x.id === t.id ? { ...x, x: intent.x, y: intent.y } : x));
      if (s.combat) {
        // Leaving an enemy's reach offers it an Opportunity Attack.
        const enemyOf = (a: Token, b: Token) => !!a.memberId !== !!b.memberId;
        for (const other of s.tokens.filter((o) => o.id !== t.id && enemyOf(o, t) && distanceFeet(o, t) <= 5 && distanceFeet(o, intent) > 5)) {
          const text = `${t.hidden ? "Something" : t.name} is leaving ${other.name}'s reach. Opportunity Attack?`;
          if (other.memberId) promptReaction(other.memberId, text);
          else for (const dm of s.members.filter((m) => m.role === "dm")) promptReaction(dm.id, text);
        }
      }
      emit("map.changed", {});
      break;
    }
    case "map_set": {
      const { type: _t, ...patch } = intent;
      void _t;
      s.map = { ...s.map, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
      emit("map.changed", {});
      break;
    }
    case "fog_reveal": {
      const keys = intent.cells.map((c) => `${c.x},${c.y}`);
      const set = new Set(s.map.revealed);
      for (const k of keys) { if (intent.hide) set.delete(k); else set.add(k); }
      s.map = { ...s.map, revealed: [...set] };
      emit("map.changed", {});
      break;
    }
    case "template_place": {
      s.map = { ...s.map, templates: [...s.map.templates, { id: ctx.newId(), template: intent.template, ownerId: actorId }] };
      emit("map.changed", {});
      break;
    }
    case "template_remove": {
      const t = s.map.templates.find((x) => x.id === intent.id);
      if (t && t.ownerId !== actorId && !isDm) throw new RuleError("That isn't your template.");
      s.map = { ...s.map, templates: s.map.templates.filter((x) => x.id !== intent.id) };
      emit("map.changed", {});
      break;
    }
    case "scene": {
      // A shared start time lets every device cross-fade together.
      const startAt = ctx.now + 800;
      s.scene = { ...s.scene, ...Object.fromEntries(Object.entries(intent).filter(([k, v]) => k !== "type" && v !== undefined)), startAt };
      emit("environment.changed", { environment: s.scene.environment, music: s.scene.music, startAt });
      break;
    }
    case "handout": {
      const h = { id: ctx.newId(), title: intent.title, body: intent.body, image: intent.image, shownAt: ctx.now };
      s.handouts = [...s.handouts, h];
      emit("handout.shown", { id: h.id, title: h.title });
      break;
    }
    case "give_item": {
      const seat = s.seats[intent.memberId];
      if (!seat) throw new RuleError("That player has no character.");
      const known = [...srd.items.values()].find((i) => i.name.toLowerCase() === intent.name.toLowerCase());
      const itemId = known?.id ?? `gift-${intent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const homebrew = known ? seat.character.homebrew : { ...seat.character.homebrew, items: [...(seat.character.homebrew?.items ?? []), { id: itemId, name: intent.name }] };
      s.seats = { ...s.seats, [intent.memberId]: { ...seat, character: { ...seat.character, homebrew, equipment: [...seat.character.equipment, { itemId, equipped: false }] } } };
      audit(intent.memberId, `item:${intent.name}`, null, "given by the DM");
      emit("character.changed", { memberId: intent.memberId });
      break;
    }
    case "ai_memory": {
      const { type: _t, ...patch } = intent;
      void _t;
      s.ai = { summary: "", npcs: [], quests: [], locations: [], ...s.ai, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
      break;
    }
    case "safety_signal": {
      // Anonymous on purpose: the DM learns the table needs a pause, not who asked.
      emit("safety.signal", { kind: intent.kind }, { kind: "dm" });
      break;
    }
  }

  out.state = s;
  return out;

  function promptReaction(memberId: string, text: string) {
    const seat = s.seats[memberId];
    if (seat && (seat.session.hp === 0 || seat.session.conditions.some((c) => ["incapacitated", "stunned", "paralyzed", "unconscious", "petrified"].includes(c)))) return;
    const p = { id: ctx.newId(), memberId, text, at: ctx.now };
    s.reactions = [...s.reactions.filter((r) => ctx.now - r.at < 60_000), p];
    emit("reaction.prompt", p, { kind: "members", ids: [memberId] });
  }
  function lookupRollOwner(rollId: string): string {
    const owner = (ctx as Ctx & { rollOwner?: (id: string) => string | undefined }).rollOwner?.(rollId);
    if (!owner) throw new RuleError("That roll isn't in this room's log.");
    return owner;
  }
  function dealDamage(target: Token, amount: number, type: string, critical: boolean, label: string) {
    if (target.memberId && s.seats[target.memberId]) {
      const seat = s.seats[target.memberId];
      const sheet = sheetFor(seat);
      const r = applyDamage(seat.session, sheet, { amount, type, critical });
      audit(target.memberId, "damage", snapshotOf(seat.session), snapshotOf(r.state));
      setSession(target.memberId, r.state);
      if (r.concentrationDc) emit("concentration.check", { memberId: target.memberId, dc: r.concentrationDc, spell: seat.session.concentration }, { kind: "members", ids: [target.memberId] });
      if (r.droppedToZero) emit("character.down", { memberId: target.memberId, instantDeath: r.instantDeath });
    } else {
      s.tokens = s.tokens.map((t) => (t.id === target.id ? { ...t, hp: t.hp === undefined ? undefined : Math.max(0, t.hp - amount) } : t));
    }
    emit("damage.applied", { target: target.hidden ? "a target" : target.name, amount, type, label }, target.hidden ? { kind: "dm" } : { kind: "all" });
  }
  function applyOrPropose(amount: number, type: string, critical: boolean, target: Token, label: string) {
    if (s.autoApplyDamage || s.dmMode === "ai") { dealDamage(target, amount, type, critical, label); return; }
    const p = { id: ctx.newId(), attackerId: actorId, targetTokenId: target.id, amount, type, critical, label };
    s.pendingDamage = [...s.pendingDamage, p];
    emit("damage.proposed", p, { kind: "dm" });
  }
  function offerOnHit(attack: Sheet["attacks"][number], seat: SeatedCharacter) {
    const sheet = sheetFor(seat);
    const onHit = [attack.mastery?.id ? `Mastery: ${attack.mastery.id}` : "", sheet.classTable.sneak_attack ? "Sneak Attack" : "", sheet.resources.some((r) => r.id === "tactical-dice") ? "Tactical Dice" : ""].filter(Boolean);
    if (onHit.length) emit("attack.on_hit", { options: onHit }, { kind: "members", ids: [actorId] });
  }
}

function addPlayerToken(s: RoomState, memberId: string, sheet: Sheet, ctx: Ctx) {
  const member = s.members.find((m) => m.id === memberId)!;
  const slot = s.tokens.filter((t) => t.memberId).length;
  s.tokens = [...s.tokens, { id: ctx.newId(), name: sheet.name, x: 1 + slot, y: 1, size: 1, hp: sheet.hpMax.value, hpMax: sheet.hpMax.value, ac: sheet.ac.value, conditions: [], memberId, color: member.color, darkvision: sheet.darkvision, image: s.seats[memberId]?.character.details?.portrait }];
}

const sortOrder = <T extends { initiative: number }>(list: T[]) => [...list].sort((a, b) => b.initiative - a.initiative);
const snapshotOf = (x: SeatedCharacter["session"]) => ({ hp: x.hp, tempHp: x.tempHp, conditions: x.conditions, resourcesUsed: x.resourcesUsed, slotsUsed: x.slotsUsed, pactUsed: x.pactUsed });
