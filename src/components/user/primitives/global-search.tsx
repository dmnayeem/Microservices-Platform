"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Search, X, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartImage } from "./smart-image";
import { ScrollFadeRow } from "./scroll-fade-row";

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const TABS = ["All", "Tasks", "Users", "Courses", "Market"] as const;
type Tab = (typeof TABS)[number];

interface SearchResult {
  id: string;
  type: "TASK" | "USER" | "COURSE" | "LISTING";
  title: string;
  subtitle?: string;
  imageUrl?: string;
  href: string;
}

const RECENT_KEY = "user_search_recent";
const MAX_RECENT = 5;

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  if (!q.trim()) return;
  try {
    const cur = getRecent().filter((s) => s !== q);
    const next = [q, ...cur].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("All");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecent(getRecent());
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const runSearch = useCallback(
    async (q: string, t: Tab) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, scope: t.toLowerCase() });
        const res = await fetch(`/api/search?${params}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open || !query.trim()) return;
    const id = setTimeout(() => runSearch(query, tab), 280);
    return () => clearTimeout(id);
  }, [query, tab, open, runSearch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-90 bg-(--app-page) flex flex-col">
      <div className="sticky top-0 bg-(--app-surface)/95 backdrop-blur-lg border-b border-(--app-line) px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--app-ink-3)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") pushRecent(query);
              }}
              placeholder="Search tasks, users, courses, listings…"
              className="w-full pl-9 pr-9 py-2.5 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-(--app-ink-3) hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 text-(--app-ink-3) hover:text-white text-sm font-medium"
          >
            Cancel
          </button>
        </div>
        <ScrollFadeRow className="max-w-3xl mx-auto mt-3 -mb-1" innerClassName="flex items-center gap-1" ariaLabel="Search category">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap",
                tab === t
                  ? "bg-(--app-cta) text-(--app-on-cta)"
                  : "bg-(--app-surface-2) text-(--app-ink-3) hover:bg-(--app-surface-2)"
              )}
            >
              {t}
            </button>
          ))}
        </ScrollFadeRow>
      </div>

      <div className="flex-1 overflow-y-auto max-w-3xl mx-auto w-full px-4 py-4">
        {!query && recent.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3) mb-2">
              Recent
            </p>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r}>
                  <button
                    onClick={() => setQuery(r)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-(--app-surface-2) text-sm text-(--app-ink-2)"
                  >
                    <Clock className="w-3.5 h-3.5 text-(--app-ink-3)" />
                    {r}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-(--app-accent-ink)" />
          </div>
        )}

        {!loading && query && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-(--app-ink-3)">No results for &quot;{query}&quot;</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <Link
                  href={r.href}
                  onClick={() => {
                    pushRecent(query);
                    onClose();
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-(--app-surface-2)"
                >
                  {r.imageUrl ? (
                    <SmartImage
                      src={r.imageUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-lg object-cover bg-(--app-surface-2)"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-(--app-cta)/10 text-(--app-accent-ink) flex items-center justify-center text-xs font-bold uppercase">
                      {r.type[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.title}</p>
                    {r.subtitle && (
                      <p className="text-xs text-(--app-ink-3) truncate">
                        {r.subtitle}
                      </p>
                    )}
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-(--app-surface-2) text-(--app-ink-3)">
                    {r.type}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
