import { redirect } from "next/navigation";

/**
 * The commission-level editor now lives on the Referrals page as a tab.
 * Kept so old links and bookmarks still land in the right place.
 */
export default function ReferralSettingsPage() {
  redirect("/admin/referrals?tab=commission");
}
