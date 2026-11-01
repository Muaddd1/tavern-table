// The DM's full roll log, as JSON, for reviewing after a session.
import { NextResponse } from "next/server";
import { authenticate, getStore } from "@/lib/room/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const memberId = await authenticate(store, id, req);
  const state = await store.load(id);
  if (!memberId || state?.members.find((m) => m.id === memberId)?.role !== "dm") return NextResponse.json({ error: "Only the DM can export the log." }, { status: 403 });
  return NextResponse.json({ room: state.name, rolls: await store.rolls(id), audits: await store.audits(id), flags: await store.flags(id) });
}
