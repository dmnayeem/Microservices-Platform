import type { ReactNode } from "react";
import { Check, Crown, Gem, Minus, Rocket, Shield, Sparkles, Star, Zap } from "lucide-react";
import type { CompareCell, CompareRowDef } from "@/lib/plan-compare";
import { usd } from "@/lib/utils";

/**
 * Plan card + comparison table, shared by /packages (the app theme) and the
 * landing page (the marketing theme). Server- and client-safe: no hooks.
 * The data comes from lib/plans-display.ts — real plan columns only.
 */

export interface PlanCardData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  isDefault: boolean;
  isPopular: boolean;
  icon: string | null;
  color: string | null;
  bullets: string[];
  canWithdraw: boolean;
  cells: Record<string, CompareCell>;
}

type Variant = "app" | "marketing";

const ICONS: Record<string, typeof Shield> = {
  shield: Shield,
  zap: Zap,
  sparkles: Sparkles,
  crown: Crown,
  rocket: Rocket,
  gem: Gem,
  star: Star,
};
/** Fallbacks by position when the admin has not chosen. */
const DEFAULT_ICON = ["shield", "zap", "crown", "gem", "rocket"];
const DEFAULT_COLOR = ["#64748b", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

const T = {
  app: {
    card: "bg-(--app-surface) border-(--app-line)",
    ink: "text-(--app-ink)",
    ink2: "text-(--app-ink-2)",
    ink3: "text-(--app-ink-3)",
    line: "border-(--app-line)",
    head: "bg-(--app-surface-2)",
  },
  marketing: {
    card: "mk-card border-(--mk-border)",
    ink: "text-(--mk-text)",
    ink2: "text-(--mk-muted)",
    ink3: "text-(--mk-subtle)",
    line: "border-(--mk-border)",
    head: "bg-(--mk-surface-2)",
  },
} as const;

export function planLook(plan: PlanCardData, index: number) {
  const iconKey = plan.icon && ICONS[plan.icon] ? plan.icon : DEFAULT_ICON[index % DEFAULT_ICON.length];
  const color = plan.color && /^#[0-9a-f]{6}$/i.test(plan.color) ? plan.color : DEFAULT_COLOR[index % DEFAULT_COLOR.length];
  return { Icon: ICONS[iconKey], color };
}

export function priceLabel(p: { priceMonthly: number }) {
  if (p.priceMonthly <= 0) return { amount: "$0", per: "forever" };
  const n = p.priceMonthly;
  return { amount: usd(n, { dp: n % 1 === 0 ? 0 : 2 }), per: "/ month" };
}

export function PlanCardView({
  plan,
  index,
  variant,
  current,
  selected,
  footer,
}: {
  plan: PlanCardData;
  index: number;
  variant: Variant;
  current?: boolean;
  selected?: boolean;
  footer?: ReactNode;
}) {
  const t = T[variant];
  const { Icon, color } = planLook(plan, index);
  const price = priceLabel(plan);
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-5 sm:p-6 transition-shadow ${t.card} ${
        plan.isPopular || selected ? "shadow-lg" : ""
      }`}
      style={plan.isPopular || selected ? { borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 18px 40px -18px ${color}66` } : undefined}
    >
      {plan.isPopular && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow"
          style={{ background: color }}
        >
          Most popular
        </span>
      )}
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className={`flex items-center gap-2 text-lg font-bold ${t.ink}`}>
            {plan.name}
            {current && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-500">
                Current
              </span>
            )}
          </p>
          {plan.description && <p className={`text-xs ${t.ink3}`}>{plan.description}</p>}
        </div>
      </div>

      <p className={`mt-5 flex items-baseline gap-1.5 ${t.ink}`}>
        <span className="text-4xl font-extrabold tracking-tight tabular-nums">{price.amount}</span>
        <span className={`text-sm ${t.ink3}`}>{price.per}</span>
      </p>

      <ul className="mt-5 flex-1 space-y-2.5">
        <li className={`flex items-start gap-2 text-sm ${t.ink2}`}>
          {plan.canWithdraw ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <Minus className={`mt-0.5 h-4 w-4 shrink-0 ${t.ink3}`} />
          )}
          <span className={plan.canWithdraw ? "" : t.ink3}>
            {plan.canWithdraw ? "Withdraw your earnings" : "Earn now, upgrade to withdraw"}
          </span>
        </li>
        {plan.bullets.map((b) => (
          <li key={b} className={`flex items-start gap-2 text-sm ${t.ink2}`}>
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}

function Cell({ v, variant }: { v: CompareCell | undefined; variant: Variant }) {
  const t = T[variant];
  if (v === true) return <Check className="mx-auto h-5 w-5 text-emerald-500" aria-label="Yes" />;
  if (v === false || v === undefined) return <Minus className={`mx-auto h-4 w-4 ${t.ink3}`} aria-label="No" />;
  return <span className={`text-sm font-semibold tabular-nums ${t.ink}`}>{v}</span>;
}

export function PlanCompareTable({
  plans,
  rows,
  variant,
}: {
  plans: PlanCardData[];
  rows: CompareRowDef[];
  variant: Variant;
}) {
  const t = T[variant];
  if (plans.length < 2 || rows.length === 0) return null;
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className={`overflow-x-auto rounded-2xl border ${t.line} ${t.card}`}>
      <table className="w-full min-w-[30rem] border-collapse text-left">
        <thead>
          <tr className={t.head}>
            <th className={`sticky left-0 z-10 px-4 py-3 text-xs font-bold uppercase tracking-wider ${t.ink3} ${t.head}`}>
              Compare plans
            </th>
            {plans.map((p, i) => (
              <th key={p.id} className="px-3 py-3 text-center">
                <span className={`block text-sm font-bold ${t.ink}`} style={{ color: planLook(p, i).color }}>
                  {p.name}
                </span>
                <span className={`block text-[11px] ${t.ink3}`}>
                  {priceLabel(p).amount} {priceLabel(p).per}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g} group={g} rows={rows.filter((r) => r.group === g)} plans={plans} variant={variant} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  rows,
  plans,
  variant,
}: {
  group: string;
  rows: CompareRowDef[];
  plans: PlanCardData[];
  variant: Variant;
}) {
  const t = T[variant];
  return (
    <>
      <tr>
        <td colSpan={plans.length + 1} className={`px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] ${t.ink3}`}>
          {group}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.key} className={`border-t ${t.line}`}>
          <td className={`sticky left-0 z-10 px-4 py-2.5 text-sm ${t.ink2} ${variant === "app" ? "bg-(--app-surface)" : "bg-(--mk-surface)"}`} title={r.hint}>
            {r.label}
          </td>
          {plans.map((p) => (
            <td key={p.id} className="px-3 py-2.5 text-center">
              <Cell v={p.cells[r.key]} variant={variant} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
