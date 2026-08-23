import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MediaLibrary } from "@/components/media/MediaLibrary";

export default async function MediaPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "media.view"))) {
    redirect("/admin");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Media Library</h1>
        <p className="text-sm mt-1 text-gray-400">
          Upload, organize, and manage all your media files
        </p>
      </div>

      {/* Media Library Component */}
      <MediaLibrary />
    </div>
  );
}
