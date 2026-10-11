import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readDevice } from "@/lib/device";
import { checkAndNoteVpn } from "@/lib/vpn";

/** GET — is the signed-in member on a VPN / proxy right now? (also recorded for the VPN users list) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ip } = await readDevice();
  const vpn = await checkAndNoteVpn(session.user.id, ip).catch(() => false);
  return NextResponse.json({ vpn });
}
