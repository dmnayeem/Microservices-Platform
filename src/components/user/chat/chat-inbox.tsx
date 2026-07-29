"use client";

import { useEffect, useState } from "react";
import { Search, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { Avatar } from "@/components/user/primitives/avatar";

interface Conversation {
  id: string;
  otherUser: {
    id: string;
    name: string | null;
    avatar: string | null;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  unread: number;
}

function formatTime(date: string) {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEE");
  return format(d, "MMM d");
}

interface ChatInboxProps {
  userId: string;
}

export function ChatInbox({ userId: _userId }: ChatInboxProps) {
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/chat/conversations")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setConversations(d.conversations ?? []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = conversations.filter(
    (c) =>
      !search ||
      c.otherUser.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <MessageSquare className="w-6 h-6 text-indigo-400" /> Messages
      </h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {loading && <ListSkeleton rows={4} />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Start from a user's profile to send your first message."
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-1">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700"
            >
              <Avatar
                src={c.otherUser.avatar}
                size={44}
                fallbackText={c.otherUser.name?.[0]?.toUpperCase() ?? "?"}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">
                    {c.otherUser.name ?? "Anonymous"}
                  </p>
                  {c.lastMessage && (
                    <span className="text-[11px] text-gray-500 shrink-0">
                      {formatTime(c.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                {c.lastMessage && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {c.lastMessage.content}
                  </p>
                )}
              </div>
              {c.unread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold tabular-nums shrink-0">
                  {c.unread > 9 ? "9+" : c.unread}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
