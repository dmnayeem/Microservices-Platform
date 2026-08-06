import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
          <ShieldAlert className="h-7 w-7 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white">No access to this section</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your account doesn&apos;t have permission to view this area. If you
          believe this is a mistake, ask a super admin to grant you access.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
