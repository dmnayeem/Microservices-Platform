import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Liveness + database reachability, for an external uptime checker.
 *
 * The point is to distinguish "the app is down" from "the app is up but the
 * database is slow" — which matters here because the Prisma retry extension and
 * `safeRead` are both designed to hide a struggling database, so pages keep
 * rendering while things degrade underneath.
 *
 * Deliberately unauthenticated (it leaks nothing) and deliberately NOT wrapped in
 * a retry: a health check must report the first failure, not paper over it.
 */
const TIMEOUT_MS = 3_000;

export async function GET() {
  const startedAt = Date.now();

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let error: string | null = null;

  try {
    const t0 = Date.now();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      ),
    ]);
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch (e) {
    error = e instanceof Error ? e.message : "unknown";
  }

  return NextResponse.json(
    {
      ok: dbOk,
      db: dbOk ? "up" : "down",
      dbLatencyMs,
      error,
      uptimeSec: Math.round(process.uptime()),
      tookMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    },
    {
      status: dbOk ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
