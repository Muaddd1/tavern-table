// "Ask the rules": answers from the character's real numbers, which the rules engine supplies.
import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AI_OFF, aiConfigured, anthropic, callerKey, MODEL, spend } from "@/lib/ai/client";
import { sheetAsText } from "@/lib/rules/levelup";
import { deriveSheet, type Character } from "@/lib/rules";

const body = z.object({ question: z.string().trim().min(3).max(1000), character: z.custom<Character>().optional() }).strict();
const SYSTEM = `You answer rules questions for a fifth edition game using the 2024 rules in the System Reference Document 5.2.1. Be brief and plain: answer first, then the reason, using the character's real numbers if given (for example "No: your long jump is 18 feet with a running start, since your Strength is 18"). If the SRD doesn't cover something, say so, and that the DM decides. Don't quote or use non-SRD books. Reply in the language of the question.`;

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: AI_OFF }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  const check = spend(callerKey(req));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 429 });
  let facts = "";
  if (parsed.data.character) {
    try {
      const sheet = deriveSheet(parsed.data.character);
      facts = `\n\nThe player's character:\n${sheetAsText(parsed.data.character, sheet)}\nLong jump ${sheet.longJump.running} ft. with a run, ${sheet.longJump.standing} ft. standing. High jump ${sheet.highJump.running} ft. Carry ${sheet.carry.carry} lb. Shove and grapple DC ${sheet.shoveDc.value}.`;
    } catch { /* Answer without the character. */ }
  }
  try {
    const r = await anthropic().messages.create({ model: MODEL(), max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: `${parsed.data.question}${facts}` }] });
    const answer = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    return NextResponse.json({ answer, used: check.used, limit: check.limit });
  } catch {
    return NextResponse.json({ error: "The AI couldn't be reached. Try again." }, { status: 502 });
  }
}
