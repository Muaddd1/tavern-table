import { NextResponse } from "next/server";
import { z } from "zod";
import { createRoom } from "@/lib/room/reducer";
import { getStore, roomsAvailable } from "@/lib/room/server";
import { hashToken, newId, newInviteCode, newToken } from "@/lib/room/store";

const body = z.object({ roomName: z.string().trim().min(1).max(80), yourName: z.string().trim().min(1).max(40), dmMode: z.enum(["human", "ai", "assist"]).default("human") }).strict();

export async function POST(req: Request) {
  if (!roomsAvailable()) return NextResponse.json({ error: "Multiplayer isn't set up on this deployment yet: it needs its database." }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a room name and your name." }, { status: 400 });
  const store = getStore();
  const id = newId(), memberId = newId(), token = newToken(), code = newInviteCode();
  await store.create(createRoom(id, parsed.data.roomName, code, parsed.data.yourName, memberId, Date.now(), parsed.data.dmMode));
  await store.saveMember(id, memberId, hashToken(token));
  return NextResponse.json({ roomId: id, memberId, token, code });
}
