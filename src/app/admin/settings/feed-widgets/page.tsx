import { redirect } from "next/navigation";

/** Moved: the sidebar widgets are a tab of Feed settings. */
export default function FeedWidgetsSettingsPage() {
  redirect("/admin/settings/feed?tab=widgets");
}
