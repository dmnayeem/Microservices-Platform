"use client";

import { useState } from "react";
import { Mail, MessageSquare, Clock, Globe2, Loader2, CheckCircle2, LifeBuoy } from "lucide-react";
import { toast } from "@/lib/toast";
import { SUPPORT_EMAIL, COMPANY_NAME } from "@/config/company";

const inp = "w-full rounded-xl bg-(--mk-surface) border border-(--mk-border) px-4 py-3 text-(--mk-text) placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/40";
const CATEGORIES = ["General question", "Payments & withdrawals", "Account & login", "Report a problem", "Partnership / press", "Other"];

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", category: CATEGORIES[0], message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || form.message.trim().length < 10) {
      toast.error("Please fill in all fields (message ≥ 10 characters).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setSent(true);
    } catch (err) {
      toast.error("Couldn't send", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 sm:pt-24">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-blue-500 to-purple-600"><MessageSquare className="h-7 w-7 text-white" /></div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-(--mk-text) tracking-tight">Get in touch</h1>
        <p className="mt-4 text-(--mk-muted) max-w-xl mx-auto">Questions, feedback, or need a hand? Our team is here 24/7 and typically replies within a few hours.</p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Info */}
        <div className="space-y-4">
          {[
            { icon: Mail, title: "Email us", body: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
            { icon: Clock, title: "Response time", body: "Under a few hours, 24/7" },
            { icon: Globe2, title: "Where we are", body: "Remote-first, worldwide" },
            { icon: LifeBuoy, title: "Help Center", body: "Browse guides & FAQs", href: "/help" },
          ].map((c) => (
            <a key={c.title} href={c.href ?? "#"} className={`flex items-start gap-3 rounded-2xl bg-(--mk-surface) border border-(--mk-border) p-4 ${c.href ? "hover:border-blue-500/30 transition-all" : ""}`}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-blue-500 to-purple-600"><c.icon className="h-5 w-5 text-white" /></div>
              <div><p className="text-sm font-bold text-(--mk-text)">{c.title}</p><p className="text-sm text-(--mk-muted)">{c.body}</p></div>
            </a>
          ))}
        </div>

        {/* Form / success */}
        <div className="rounded-2xl bg-(--mk-surface) border border-(--mk-border) backdrop-blur-xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center py-8">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
              <h2 className="mt-4 text-2xl font-extrabold text-(--mk-text)">Message sent</h2>
              <p className="mt-2 text-(--mk-muted)">Thanks for reaching out — the {COMPANY_NAME} team will get back to you at {form.email}.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="block text-xs text-(--mk-muted) mb-1.5">Your name</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} placeholder="Jane Doe" /></div>
                <div><label className="block text-xs text-(--mk-muted) mb-1.5">Email</label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} placeholder="you@example.com" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="block text-xs text-(--mk-muted) mb-1.5">Subject</label><input value={form.subject} onChange={(e) => set("subject", e.target.value)} className={inp} placeholder="How can we help?" /></div>
                <div><label className="block text-xs text-(--mk-muted) mb-1.5">Category</label>
                  <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inp}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="block text-xs text-(--mk-muted) mb-1.5">Message</label><textarea rows={5} value={form.message} onChange={(e) => set("message", e.target.value)} className={`${inp} resize-none`} placeholder="Tell us what's going on…" /></div>
              {/* Honeypot */}
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden />
              <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-6 py-3.5 text-sm font-bold text-white hover:scale-[1.02] transition-transform disabled:opacity-50">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send message"}
              </button>
              <p className="text-center text-[11px] text-(--mk-subtle)">We&apos;ll only use your email to reply. See our Privacy Policy.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
