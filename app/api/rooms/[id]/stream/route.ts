// Live events for local play, without Supabase. Each event is filtered per viewer here.
import { authenticate, getStore, visibleEvents } from "@/lib/room/server";
import { hashToken, roomBus } from "@/lib/room/store";
import type { RoomEvent } from "@/lib/room/types";


export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  // EventSource can't send headers, so the token comes in the query string, on local play only.
  const token = new URL(req.url).searchParams.get("token");
  const memberId = token ? await store.memberByToken(id, hashToken(token)) : await authenticate(store, id, req);
  if (!memberId) return new Response("Not a member of this room.", { status: 401 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = async (events: RoomEvent[]) => {
        const state = await store.load(id);
        const me = state?.members.find((m) => m.id === memberId);
        if (!me) return;
        // Kicked players still get the event that tells them, then the stream ends.
        for (const e of me.kicked ? events.filter((x) => x.type === "member.kicked" && x.payload.memberId === memberId) : visibleEvents(events, me)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
        if (me.kicked) { cleanup(); controller.close(); }
      };
      roomBus.on(`room:${id}`, send);
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 20000);
      cleanup = () => { roomBus.off(`room:${id}`, send); clearInterval(ping); };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
