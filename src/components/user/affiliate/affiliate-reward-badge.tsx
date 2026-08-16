import { Handshake } from "lucide-react";

/**
 * Affiliate-only commission badge. The `reward` string is populated by the
 * server ONLY when the viewer is an approved affiliate (the figure never
 * reaches non-affiliates), so this simply renders when a reward is present.
 */
export function AffiliateRewardBadge({
  reward,
  className = "",
}: {
  reward?: string | null;
  className?: string;
}) {
  if (!reward) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-[11px] font-bold ${className}`}
      title="Your affiliate commission on this item"
    >
      <Handshake className="w-3 h-3" /> Earn {reward}
    </span>
  );
}
