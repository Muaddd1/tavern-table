// A viewer's redacted snapshot: state plus the rolls and chat they may see.
import { NextResponse } from "next/server";
import { authenticate, channelsFor, getStore, transport, visibleChat, visibleRoll } from "@/lib/room/server";
import { redactFor } from "@/lib/room/redact";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const memberId = await authenticate(store, id, req);
  if (!memberId) return NextResponse.json({ error: "Not a member of this room." }, { status: 401 });
  const state = await store.load(id);
  if (!state) return NextResponse.json({ error: "That room doesn't exist." }, { status: 404 });
  const view = redactFor(state, memberId);
  if (!view) return NextResponse.json({ error: "You're no longer in this room." }, { status: 403 });
  const rolls = (await store.rolls(id)).filter((r) => visibleRoll(r, view.me));
  const chat = (await store.chat(id)).filter((c) => visibleChat(c, view.me));
  const isDm = view.me.role === "dm";
  return NextResponse.json({
    view, rolls: rolls.slice(-200), chat: chat.slice(-200), transport: transport(), channels: channelsFor(state, view.me),
    audits: isDm ? (await store.audits(id)).slice(-200) : undefined, flags: isDm ? (await store.flags(id)).slice(-200) : undefined,
  });
}
