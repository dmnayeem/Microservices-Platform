"use client";

import { useState } from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  q: string;
  a: string;
}

interface Section {
  title: string;
  emoji: string;
  articles: Article[];
}

const SECTIONS: Section[] = [
  {
    title: "Getting Started",
    emoji: "📋",
    articles: [
      {
        id: "earn",
        q: "How do I earn points on EarnGPT?",
        a: "Complete tasks (manual, quiz, social, video, surveys), refer friends for 10/5/2% commissions, win in lottery, and unlock daily check-in bonuses.",
      },
      {
        id: "withdraw",
        q: "How do withdrawals work?",
        a: "Convert points to cash (1,000 pts = $1 USD) and request a withdrawal from /withdrawal. Min/max varies by tier — FREE tier withdrawals are locked.",
      },
      {
        id: "packages",
        q: "What are packages?",
        a: "Packages unlock higher withdrawal limits, earning multipliers, fee discounts, and priority support. Browse from /packages.",
      },
    ],
  },
  {
    title: "Earning & Tasks",
    emoji: "💰",
    articles: [
      {
        id: "task-types",
        q: "What task types exist?",
        a: "Manual, Quiz, Social Posts, Social Tasks (15 platforms), Proxy, Board Tasks, Offerwalls, and Courses.",
      },
      {
        id: "approval",
        q: "How long does approval take?",
        a: "Most tasks auto-approve instantly. Manual review tasks complete within 24 hours.",
      },
      {
        id: "rejected",
        q: "Why was my submission rejected?",
        a: "Common reasons: invalid proof, incomplete task, duplicate submission, fraud detection. The admin note explains the specific reason.",
      },
      {
        id: "cooldown",
        q: "What's a task cooldown?",
        a: "Some repeatable tasks require waiting between completions. Check the cooldown timer on the task card.",
      },
    ],
  },
  {
    title: "Withdrawals",
    emoji: "🏦",
    articles: [
      {
        id: "min",
        q: "What's the minimum withdrawal?",
        a: "STARTER: $5 · PRO: $10 · ELITE: $20 · VIP: $50. FREE tier withdrawals are locked.",
      },
      {
        id: "methods",
        q: "What payment methods are supported?",
        a: "bKash, Nagad, Binance Pay, PayPal, USDT (TRC-20). Add methods from Profile → Payment Methods.",
      },
      {
        id: "time",
        q: "How long do withdrawals take?",
        a: "Typically 24–72 hours. Higher tiers receive priority processing.",
      },
    ],
  },
  {
    title: "Security",
    emoji: "🔒",
    articles: [
      {
        id: "2fa",
        q: "How do I enable 2FA?",
        a: "Go to /2fa-setup and scan the QR code with an authenticator app (Google Authenticator, Authy).",
      },
      {
        id: "login",
        q: "I can't log in",
        a: "Try resetting your password at /forgot-password. If that fails, contact support@earngpt.com.",
      },
      {
        id: "delete",
        q: "How do I delete my account?",
        a: "Profile → Settings → Delete Account. Note: this is permanent and your balance will be forfeited.",
      },
    ],
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filtered = SECTIONS.map((s) => ({
    ...s,
    articles: s.articles.filter(
      (a) =>
        !query ||
        a.q.toLowerCase().includes(query.toLowerCase()) ||
        a.a.toLowerCase().includes(query.toLowerCase())
    ),
  })).filter((s) => s.articles.length > 0);

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white">❓ Help Center</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles..."
          className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-gray-500 py-8">
          No articles match your search.
        </p>
      )}

      {filtered.map((s) => (
        <div key={s.title} className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-sm font-bold text-white">
              <span className="mr-1.5">{s.emoji}</span>
              {s.title}
            </p>
          </div>
          <ul className="divide-y divide-gray-800">
            {s.articles.map((a) => {
              const isOpen = open.has(a.id);
              return (
                <li key={a.id}>
                  <button
                    onClick={() => toggle(a.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-gray-800/40"
                    )}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <span className="text-sm text-white flex-1">{a.q}</span>
                  </button>
                  {isOpen && (
                    <p className="px-9 pb-3 text-xs text-gray-300 leading-relaxed">
                      {a.a}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
