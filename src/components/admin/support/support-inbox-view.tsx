"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  Mail,
  Search,
  Loader2,
  CheckCircle2,
  Eye,
  Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Support inbox for messages users submit through the public contact form.
 *
 * These rows existed in the database but had no reader anywhere in the app —
 * `/api/contact` stored them and sent an email that silently does nothing when
 * SMTP is unconfigured, so user complaints were invisible.
 */

type Status = "NEW" | "READ" | "RESOLVED";

interface Message {
  id: string;
  name: string;
  email: string;
  subject: string;
  category: string | null;
  message: string;
  status: Status;
  createdAt: string;
}

const TABS: Array<{ value: Status | "ALL"; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "READ", label: "Read" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ALL", label: "All" },
];

const STATUS_STYLE: Record<Status, string> = {
  NEW: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
  READ: "bg-slate-700/40 text-slate-300 border-slate-600",
  RESOLVED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

export function SupportInboxView() {
  const [tab, setTab] = useState<Status | "ALL">("NEW");
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "ALL") params.set("status", tab);
      if (q.trim()) params.set("q", q.trim());
      const r = await fetch(`/api/admin/support?${params}`, {
        cache: "no-store",
      });
      const d = await r.json();
      setMessages(d.messages ?? []);
      setCounts(d.counts ?? {});
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const setStatus = async (id: string, status: Status) => {
    setBusyId(id);
    // Optimistic — the row moves out of the current tab immediately.
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status } : m))
    );
    try {
      const r = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!r.ok) throw new Error(await r.text());
      void load();
    } catch {
      toast.error("Couldn't update the message");
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const open = (m: Message) => {
    const next = openId === m.id ? null : m.id;
    setOpenId(next);
    // Reading it is the natural moment to stop counting it as new.
    if (next && m.status === "NEW") void setStatus(m.id, "READ");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-indigo-400" />
          Support Inbox
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Messages users sent through the contact form.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors inline-flex items-center gap-1.5",
              tab === t.value
                ? "bg-white text-slate-900"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            )}
          >
            {t.label}
            {t.value !== "ALL" && (counts[t.value] ?? 0) > 0 && (
              <span
                className={cn(
                  "px-1.5 rounded-full text-[10px]",
                  tab === t.value ? "bg-slate-900/10" : "bg-slate-900/60"
                )}
              >
                {counts[t.value]}
              </span>
            )}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, name or email…"
            className="w-64 pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : messages.length === 0 ? (
        <div className="py-16 text-center">
          <Inbox className="w-10 h-10 mx-auto text-slate-700 mb-3" />
          <p className="text-sm text-slate-400">
            {tab === "NEW"
              ? "No new messages — you're all caught up."
              : "Nothing here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => {
            const isOpen = openId === m.id;
            return (
              <div
                key={m.id}
                className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden"
              >
                <button
                  onClick={() => open(m)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide",
                            STATUS_STYLE[m.status]
                          )}
                        >
                          {m.status}
                        </span>
                        {m.category && (
                          <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">
                            {m.category}
                          </span>
                        )}
                        <p className="text-sm font-bold text-white truncate">
                          {m.subject}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {m.name} · {m.email}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {formatDistanceToNow(new Date(m.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
                    <p className="text-sm text-slate-200 whitespace-pre-wrap wrap-break-word">
                      {m.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${m.email}?subject=${encodeURIComponent(
                          `Re: ${m.subject}`
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
                      >
                        <Mail className="w-3.5 h-3.5" /> Reply by email
                      </a>
                      {m.status !== "RESOLVED" ? (
                        <button
                          onClick={() => setStatus(m.id, "RESOLVED")}
                          disabled={busyId === m.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(m.id, "READ")}
                          disabled={busyId === m.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" /> Reopen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
