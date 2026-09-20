import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ListTodo,
  PlayCircle,
  Wallet,
} from "lucide-react";

/**
 * The product, shown rather than described.
 *
 * The first viewport claimed "earn money online" and then proved it with four
 * number cards — the same thing every scam offerwall does. A visitor decides
 * in that viewport whether this is a real product, and the only evidence that
 * settles it is seeing the actual app.
 *
 * Built in markup rather than shipped as a screenshot: a PNG would be ~40kB on
 * the critical path, would be wrong the first time a screen changed, and would
 * be pinned to one theme. This themes with the page and weighs nothing.
 */
const ROWS = [
  { icon: PlayCircle, title: "Watch & verify a 30s clip", meta: "Video · 2 min", reward: "+$0.35" },
  { icon: ListTodo, title: "Try an app and send a screenshot", meta: "Install · 5 min", reward: "+$1.20" },
  { icon: CheckCircle2, title: "Short opinion survey", meta: "Survey · 4 min", reward: "+$0.80" },
];

export function HeroProduct() {
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[380px] lg:max-w-[420px]">
      {/* Brand glow behind the frame — gives the mock a place to sit rather
          than floating on the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-linear-to-br from-(--mk-grad-a)/20 via-(--mk-grad-b)/15 to-(--mk-info)/10 blur-2xl"
      />

      <div className="mk-panel overflow-hidden p-3 sm:p-4">
        {/* App header */}
        <div className="flex items-center gap-3 px-1 pb-3">
          <span className="w-9 h-9 shrink-0 rounded-full bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) text-white text-sm font-bold flex items-center justify-center">
            M
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-(--mk-subtle) leading-tight">
              Good evening
            </span>
            <span className="block text-sm font-semibold text-(--mk-text) truncate leading-tight">
              Michael R.
            </span>
          </span>
          <span className="relative w-9 h-9 shrink-0 rounded-xl border border-(--mk-border) flex items-center justify-center text-(--mk-muted)">
            <Bell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500" />
          </span>
        </div>

        {/* Balance — white on the brand fill measures 6.29:1. */}
        <div className="rounded-2xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) p-4 text-white shadow-lg shadow-indigo-600/25">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wider text-white/80">
                Available balance
              </div>
              <div className="mk-figure text-3xl mt-1">$248.60</div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[11px] font-semibold">
              <ArrowUpRight className="w-3 h-3" />
              12.4%
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-(--mk-accent)">
              <Wallet className="w-3.5 h-3.5" />
              Withdraw
            </span>
            <span className="flex-1 inline-flex items-center justify-center rounded-xl border border-white/30 px-3 py-2 text-xs font-semibold">
              History
            </span>
          </div>
        </div>

        {/* Daily goal */}
        <div className="mt-3 rounded-2xl bg-(--mk-surface-2) border border-(--mk-border) p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-(--mk-text)">Today&apos;s goal</span>
            <span className="mk-figure text-(--mk-success) text-xs">7 / 10 tasks</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-(--mk-border) overflow-hidden">
            <div className="mk-bar h-full w-[70%] rounded-full bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b)" />
          </div>
        </div>

        {/* Available work */}
        <div className="mt-3 space-y-2">
          {ROWS.map((r) => (
            <div
              key={r.title}
              className="flex items-center gap-3 rounded-2xl bg-(--mk-surface-2) border border-(--mk-border) p-3"
            >
              <span className="w-9 h-9 shrink-0 rounded-xl bg-(--mk-accent-soft) border border-(--mk-accent-soft-border) flex items-center justify-center text-(--mk-accent)">
                <r.icon className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-(--mk-text) truncate leading-snug">
                  {r.title}
                </span>
                <span className="block text-[11px] text-(--mk-subtle) leading-snug">
                  {r.meta}
                </span>
              </span>
              <span className="mk-figure shrink-0 rounded-lg bg-(--mk-success-soft) px-2 py-1 text-[11px] text-(--mk-success)">
                {r.reward}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Live approval — the one moving element, and the one that says the
          money is real. Gated by the admin animation switch. */}
      <div
        aria-hidden
        className="mk-ticker mk-card absolute -bottom-4 -left-2 sm:-left-6 rounded-2xl px-3 py-2 flex items-center gap-2"
      >
        <span className="w-7 h-7 rounded-full bg-(--mk-success-soft) flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-(--mk-success)" />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] font-bold text-(--mk-text)">
            Task approved
          </span>
          <span className="mk-figure block text-[11px] text-(--mk-success)">
            +$0.42
          </span>
        </span>
      </div>
    </div>
  );
}
