import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SendNotificationForm } from "../_components/SendNotificationForm";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";

export default async function SendNotificationPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await can(session.user.id, "notifications.send"))) {
    redirect("/admin/notifications");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/notifications"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800">
            <Send className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Send Notification</h1>
            <p className="text-gray-400">Send targeted or broadcast notifications</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <SendNotificationForm />
    </div>
  );
}
