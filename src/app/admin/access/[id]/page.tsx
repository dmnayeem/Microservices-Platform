import { redirect } from "next/navigation";

// Admin-role management was consolidated into the user-edit page (feature #8).
// This route now just forwards to that single place, preserving old bookmarks.
export default async function AdminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/users/${id}/edit`);
}
