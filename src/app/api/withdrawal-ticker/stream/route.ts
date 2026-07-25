import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { WithdrawalStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 8_000;
const MAX_LIFETIME_MS = 5 * 60_000;

interface TickerItem {
  id: string;
  username: string;
  amount: number;
  unit: "USD" | "pts";
  method: string | null;
  country: string | null;
  processedAt: string;
}

// Server-Sent Events stream of newly-approved withdrawals.
// Replaces the prior 30s server-side revalidate with a live push.
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let cursor = new Date(Date.now() - 60 * 60 * 1000); // start with last hour

  const send = (controller: ReadableStreamDefaultController, evt: string, data: unknown) => {
    const payload = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(payload));
  };

  const stream = new ReadableStream({
    async start(controller) {
      let aborted = false;
      const cleanup = () => {
        aborted = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", cleanup);

      // Initial heartbeat so the client knows the stream is open
      send(controller, "ready", { ok: true, since: cursor.toISOString() });

      const poll = async () => {
        if (aborted) return;
        try {
          const items = await prisma.withdrawal.findMany({
            where: {
              status: WithdrawalStatus.COMPLETED,
              processedAt: { gt: cursor },
            },
            orderBy: { processedAt: "asc" },
            take: 20,
            include: {
              user: {
                select: {
                  username: true,
                  name: true,
                  country: true,
                },
              },
            },
          });
          type WithUser = (typeof items)[number] & {
            user: { username: string | null; name: string | null; country: string | null };
          };
          const rows = items as WithUser[];

          for (const w of rows) {
            const item: TickerItem = {
              id: w.id,
              username:
                w.user.username ??
                w.user.name?.split(" ")[0]?.toLowerCase() ??
                "user",
              amount: toNum(w.netAmount),
              unit: "USD",
              method: w.method,
              country: w.user.country,
              processedAt:
                w.processedAt?.toISOString() ?? new Date().toISOString(),
            };
            send(controller, "withdrawal", item);
            if (w.processedAt && w.processedAt > cursor) cursor = w.processedAt;
          }

          // Heartbeat (keeps proxies from killing the connection)
          send(controller, "heartbeat", { ts: Date.now() });
        } catch (err) {
          send(controller, "error", {
            message: err instanceof Error ? err.message : "poll failed",
          });
        }
      };

      // Initial pull
      await poll();

      const interval = setInterval(poll, POLL_INTERVAL_MS);
      const lifetime = setTimeout(() => {
        send(controller, "expired", { message: "Re-open stream" });
        cleanup();
      }, MAX_LIFETIME_MS);

      // Stop loop when stream closes
      const stop = () => {
        clearInterval(interval);
        clearTimeout(lifetime);
      };
      req.signal.addEventListener("abort", stop);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
