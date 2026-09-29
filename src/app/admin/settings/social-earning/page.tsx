import { redirect } from "next/navigation";

/** Moved: Social earning is the first tab of Feed settings. */
export default function SocialEarningSettingsPage() {
  redirect("/admin/settings/feed");
}
