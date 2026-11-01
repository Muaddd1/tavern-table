// Server only. Every AI feature goes through here: key check, model choice and spending limits.
import Anthropic from "@anthropic-ai/sdk";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
export const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const anthropic = () => new Anthropic();
export const AI_OFF = "AI features aren't turned on for this site yet.";

// ponytail: counters live per server instance, so serverless limits are approximate. Move them
// to the ai_usage table before opening AI to strangers.
const counters = new Map<string, { day: string; n: number }>();
const DAILY_PER_USER = Number(process.env.AI_DAILY_PER_USER || 50);
const DAILY_TOTAL = Number(process.env.AI_DAILY_TOTAL || 500);

export function spend(user: string): { ok: true; used: number; limit: number } | { ok: false; error: string; used: number; limit: number } {
  const day = new Date().toISOString().slice(0, 10);
  const bump = (key: string, limit: number) => {
    const c = counters.get(key);
    const n = c?.day === day ? c.n : 0;
    if (n >= limit) return false;
    counters.set(key, { day, n: n + 1 });
    return true;
  };
  const used = counters.get(`u:${user}`)?.day === day ? counters.get(`u:${user}`)!.n : 0;
  if (used >= DAILY_PER_USER) return { ok: false, error: "You've used today's AI messages. They reset tomorrow.", used, limit: DAILY_PER_USER };
  if (!bump("total", DAILY_TOTAL)) return { ok: false, error: "The site has used today's AI budget. Try again tomorrow.", used, limit: DAILY_PER_USER };
  bump(`u:${user}`, DAILY_PER_USER);
  return { ok: true, used: used + 1, limit: DAILY_PER_USER };
}

export const callerKey = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
