// Solo rolls, outside a room. The result still comes from the server; in a room, rolls go through
// the room's intents route instead, where they're logged.
import { NextResponse } from "next/server";
import { z } from "zod";
import { NotationError, parseNotation, rollParsed } from "@/lib/dice/notation";
import { secureDie } from "@/lib/room/store";

const body = z.object({ notation: z.string().min(1).max(100) }).strict();

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request isn't allowed." }, { status: 400 });
  try {
    return NextResponse.json({ result: rollParsed(parseNotation(parsed.data.notation), secureDie) });
  } catch (e) {
    if (e instanceof NotationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
