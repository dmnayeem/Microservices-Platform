import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readDevice, recordDevice } from "@/lib/device";
import type { DeviceHints } from "@/lib/device-info";

function sanitizeHints(v: unknown): DeviceHints {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  return {
    mobile: typeof o.mobile === "boolean" ? o.mobile : null,
    platform: str(o.platform, 30),
    platformVersion: str(o.platformVersion, 30),
    model: str(o.model, 60),
  };
}
import { markActiveToday } from "@/lib/active-days";

export const runtime = "nodejs";

/** POST — the signed-in user was seen on this device today (DeviceBeacon, once a day per tab). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });
  // Client Hints (phone model etc.) — optional; older clients send no body.
  const body = (await request.json().catch(() => null)) as { hints?: unknown } | null;
  const seen = { ...(await readDevice()), hints: sanitizeHints(body?.hints) };
  await Promise.all([recordDevice(session.user.id, seen), markActiveToday(session.user.id)]);
  return NextResponse.json({ ok: true });
}
