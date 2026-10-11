import Link from "next/link";
import { ShieldOff } from "lucide-react";

export const metadata = { title: "Turn off your VPN" };

/** Where a VPN-locked page sends a member on a VPN / proxy (Fraud Control → VPN). */
export default async function VpnBlockedPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const back = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      <ShieldOff className="mx-auto h-12 w-12 text-amber-400" />
      <h1 className="t-title text-white">Turn off your VPN</h1>
      <p className="t-body text-(--app-ink-2)">
        This page can&apos;t be used through a VPN or proxy. Switch it off, then try again.
      </p>
      <Link href={back} className="app-accent inline-block rounded-xl px-5 py-3 text-sm font-black">
        I turned it off — try again
      </Link>
    </div>
  );
}
