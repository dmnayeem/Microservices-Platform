import Link from "next/link";
import { Lock, Home } from "lucide-react";

export default function NoAccessPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 grid place-items-center mb-4">
        <Lock className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-white">Page not available</h1>
      <p className="text-gray-400 text-sm mt-2 max-w-sm">
        This page isn&apos;t available on your account. If you think this is a
        mistake, contact support.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
      >
        <Home className="w-4 h-4" /> Back to Dashboard
      </Link>
    </div>
  );
}
