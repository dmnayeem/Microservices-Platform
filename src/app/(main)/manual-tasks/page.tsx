import { redirect } from "next/navigation";

// There is no MANUAL task type (the enum has CUSTOM), so this page asked the
// API for `type=MANUAL` and always showed an empty list. Custom tasks — the
// hand-reviewed kind — live at /custom-tasks.
export default function ManualTasksPage() {
  redirect("/custom-tasks");
}
