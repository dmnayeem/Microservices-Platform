import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Hash } from "lucide-react";
import { HashtagFeedClient } from "@/components/user/feed/hashtag-feed-client";

export default async function HashtagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { tag: raw } = await params;
  const tag = decodeURIComponent(raw).replace(/^#/, "").slice(0, 50);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/social"
          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          aria-label="Back to feed"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
          <Hash className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">#{tag}</h1>
          <p className="text-xs text-gray-500">Posts with this hashtag</p>
        </div>
      </div>

      <HashtagFeedClient tag={tag} />
    </div>
  );
}
