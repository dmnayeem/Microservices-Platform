import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { BroadcastsClient } from "./_components/BroadcastsClient";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "notifications.send"))) redirect("/admin");

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/notifications" className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Send className="w-6 h-6 text-indigo-400" />
            Broadcasts
          </h1>
          <p className="text-gray-400 text-sm">
            Every send, and how far it has actually got. A large send drains in the
            background a batch at a time, so it keeps going after you close this page.
          </p>
        </div>
        <Link
          href="/admin/notifications/send"
          className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm shrink-0"
        >
          <Send className="w-4 h-4" />
          New
        </Link>
      </div>

      <BroadcastsClient />
    </div>
  );
}
