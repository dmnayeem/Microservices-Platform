import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { realCountry, realIp, viaCloudflare } from "@/lib/client-ip";

// Reads the request edge headers Vercel/CloudFlare set so the client can
// suggest a country (and timezone) on first profile load when those fields
// are still empty. The user always confirms before we save it.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const h = req.headers;
  // Vercel: x-vercel-ip-country / -country-region / -timezone / -latitude / -longitude
  // Cloudflare: cf-ipcountry / cf-timezone
  // Through Cloudflare, Vercel's x-vercel-ip-* headers describe the
  // Cloudflare data centre, not the member — use Cloudflare's own (region /
  // city / timezone need its "visitor location headers" transform).
  const cf = viaCloudflare(h);
  const country = realCountry(h);
  const region = cf ? h.get("cf-region-code") ?? h.get("cf-region") ?? null : h.get("x-vercel-ip-country-region") ?? null;
  const city = cf ? h.get("cf-ipcity") ?? null : h.get("x-vercel-ip-city") ?? null;
  const timezone = cf ? h.get("cf-timezone") ?? null : h.get("x-vercel-ip-timezone") ?? null;
  const ip = realIp(h);

  return NextResponse.json({
    country,
    region,
    city,
    timezone,
    ip: ip ? maskIp(ip) : null,
    detected: !!(country || timezone),
  });
}

function maskIp(ip: string): string {
  // Mask last octet for privacy (IPv4) or last group (IPv6)
  if (ip.includes(":")) {
    return ip.split(":").slice(0, -1).concat(["xxxx"]).join(":");
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    parts[3] = "xxx";
    return parts.join(".");
  }
  return ip;
}
