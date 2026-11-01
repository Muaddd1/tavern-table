import { NextResponse } from "next/server";
import { z } from "zod";
import { RuleError } from "@/lib/rules";
import { addMember } from "@/lib/room/reducer";
import { getStore, roomsAvailable } from "@/lib/room/server";
import { hashToken, newId, newToken } from "@/lib/room/store";

const body = z.object({ code: z.string().trim().toUpperCase().length(6), name: z.string().trim().min(1).max(40), role: z.enum(["player", "spectator"]).default("player") }).strict();

export async function POST(req: Request) {
  if (!roomsAvailable()) return NextResponse.json({ error: "Multiplayer isn't set up on this deployment yet: it needs its database." }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-letter code and your name." }, { status: 400 });
  const store = getStore();
  const roomId = await store.findByCode(parsed.data.code);
  if (!roomId) return NextResponse.json({ error: "No room has that code." }, { status: 404 });
  const memberId = newId(), token = newToken();
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = (await store.load(roomId))!;
    let next;
    try {
      next = addMember(state, { id: memberId, name: parsed.data.name, role: parsed.data.role, now: Date.now() });
    } catch (e) {
      if (e instanceof RuleError) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }
    const seq = state.seq + 1;
    const event = { seq, type: "member.joined", audience: { kind: "all" as const }, payload: { memberId, name: parsed.data.name }, at: Date.now() };
    const stored = { ...next, version: state.version + 1, seq };
    if (await store.commit(roomId, { expectedVersion: state.version, next: stored, events: [event], rolls: [], audits: [], flags: [], chat: [] })) {
      await store.saveMember(roomId, memberId, hashToken(token));
      await store.publish(stored, [event]);
      return NextResponse.json({ roomId, memberId, token, code: parsed.data.code });
    }
  }
  return NextResponse.json({ error: "The room is busy. Try again." }, { status: 503 });
}
