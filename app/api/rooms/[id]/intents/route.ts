import { NextResponse } from "next/server";
import { authenticate, getStore } from "@/lib/room/server";
import { handleIntent } from "@/lib/room/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const memberId = await authenticate(store, id, req);
  if (!memberId) return NextResponse.json({ error: "Not a member of this room." }, { status: 401 });
  const result = await handleIntent(store, id, memberId, await req.json().catch(() => null));
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
