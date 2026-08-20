"use client";

import { useEffect, useRef, useState } from "react";
import { Send, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { Avatar } from "@/components/user/primitives/avatar";

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  read?: boolean;
}

interface OtherUser {
  id: string;
  name: string | null;
  avatar: string | null;
  isOnline?: boolean;
}

interface ChatWindowProps {
  conversationId: string;
  currentUserId: string;
}

function dateLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE MMM d");
}

export function ChatWindow({ conversationId, currentUserId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<OtherUser | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Id of the last incoming message we've already marked read — avoids a POST
  // /read write on every 8s poll when nothing new has arrived.
  const lastReadRef = useRef<string | null>(null);

  // `silent` polls (the 8s timer, post-send refresh) update the message list in
  // place WITHOUT flipping `loading` — otherwise the whole thread collapsed to a
  // spinner every 8s. Only the first load of a conversation shows the spinner.
  // Newest message timestamp we already have — drives the incremental poll.
  const lastAtRef = useRef<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Silent polls fetch ONLY messages newer than what we have (tiny payload);
      // the first load pulls the full thread.
      const inc = silent && lastAtRef.current;
      const url = inc
        ? `/api/chat/conversations/${conversationId}?since=${encodeURIComponent(lastAtRef.current!)}`
        : `/api/chat/conversations/${conversationId}`;
      const res = await fetch(url);
      const d = await res.json();
      const incoming: Message[] = d.messages ?? [];

      let latest: Message | undefined;
      if (inc) {
        if (incoming.length === 0) return; // nothing new — no state churn
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
          return merged;
        });
        latest = incoming[incoming.length - 1];
      } else {
        setMessages(incoming);
        setOther(d.otherUser ?? null);
        latest = incoming[incoming.length - 1];
      }
      if (latest) lastAtRef.current = latest.createdAt;

      // Mark read only when the newest message is incoming and unacked.
      if (
        latest &&
        latest.senderId !== currentUserId &&
        latest.id !== lastReadRef.current
      ) {
        lastReadRef.current = latest.id;
        await fetch(`/api/chat/conversations/${conversationId}/read`, {
          method: "POST",
        });
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Reset per-conversation state so switching threads shows a fresh spinner
    // instead of the previous thread's messages.
    lastReadRef.current = null;
    lastAtRef.current = null;
    setMessages([]);
    setLoading(true);
    load();
    const id = setInterval(() => {
      // Skip while the tab is hidden — a backgrounded tab polled forever,
      // which at scale is load nobody is even looking at.
      if (document.visibilityState !== "hidden") load(true);
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      content: input.trim(),
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: optimistic.content }),
        }
      );
      if (!res.ok) throw new Error();
      load(true);
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col -mx-4 -mt-4" style={{ height: "calc(100vh - 56px - 64px)" }}>
      {other && (
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/70 backdrop-blur sticky top-14 z-10 flex items-center gap-3">
          <Avatar
            src={other.avatar}
            size={36}
            fallbackText={other.name?.[0]?.toUpperCase() ?? "?"}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {other.name ?? "Anonymous"}
            </p>
            {other.isOnline && (
              <p className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Online
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        )}
        {!loading &&
          messages.map((m, i) => {
            const prev = i > 0 ? new Date(messages[i - 1].createdAt) : null;
            const cur = new Date(m.createdAt);
            const showDate = !prev || !isSameDay(prev, cur);
            const isOwn = m.senderId === currentUserId;
            return (
              <div key={m.id}>
                {showDate && (
                  <div className="text-center my-2">
                    <span className="px-2 py-0.5 rounded-full bg-gray-800 text-[10px] font-bold text-gray-400 uppercase">
                      {dateLabel(cur)}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm",
                      isOwn
                        ? "bg-indigo-500 text-white rounded-br-md"
                        : "bg-gray-800 text-white rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap wrap-break-word">{m.content}</p>
                    <div className="flex items-center justify-end gap-0.5 mt-0.5">
                      <span
                        className={cn(
                          "text-[10px]",
                          isOwn ? "text-indigo-100" : "text-gray-400"
                        )}
                      >
                        {format(cur, "HH:mm")}
                      </span>
                      {isOwn && (
                        <CheckCheck
                          className={cn(
                            "w-3 h-3",
                            m.read ? "text-indigo-100" : "text-indigo-300/50"
                          )}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 max-h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-2xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            disabled={!input.trim() || sending}
            onClick={send}
            className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center disabled:opacity-50"
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
