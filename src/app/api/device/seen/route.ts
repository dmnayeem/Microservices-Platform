import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readDevice, recordDevice } from "@/lib/device";
import { markActiveToday } from "@/lib/active-days";

export const runtime = "nodejs";

/** POST — the signed-in user was seen on this device today (DeviceBeacon, once a day per tab). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });
  await Promise.all([recordDevice(session.user.id, await readDevice()), markActiveToday(session.user.id)]);
  return NextResponse.json({ ok: true });
}
