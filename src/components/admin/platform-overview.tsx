import { usd } from "@/lib/utils";
import { ShoppingCart, GraduationCap, Trophy, type LucideIcon } from "lucide-react";

interface OverviewSection {
  icon: LucideIcon;
  label: string;
  primary: { value: string; label: string };
  secondary: Array<{ value: string; label: string }>;
}

interface PlatformOverviewProps {
  marketplace: { listings: number; orders: number; pending: number };
  courses: { active: number; enrollments: number };
  /** Finance only — omit it and the money row is not rendered at all. */
  financials?: { totalWithdrawn: number };
  title?: string;
}

export function PlatformOverview({
  marketplace,
  courses,
  financials,
  title = "Platform Overview",
}: PlatformOverviewProps) {
  const sections: OverviewSection[] = [
    {
      icon: ShoppingCart,
      label: "Marketplace Activity",
      primary: { value: marketplace.listings.toLocaleString(), label: "Listings" },
      secondary: [
        { value: marketplace.orders.toLocaleString(), label: "Orders" },
        { value: marketplace.pending.toLocaleString(), label: "Pending" },
      ],
    },
    {
      icon: GraduationCap,
      label: "Course Statistics",
      primary: { value: courses.active.toLocaleString(), label: "Active Courses" },
      secondary: [
        {
          value: courses.enrollments.toLocaleString(),
          label: "Total Enrollments",
        },
      ],
    },
  ];
  if (financials) {
    sections.push({
      icon: Trophy,
      label: "Platform Financials",
      primary: {
        value: usd(financials.totalWithdrawn, { dp: 0 }),
        label: "Total Withdrawn",
      },
      secondary: [],
    });
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-slate-300">
                  {s.label}
                </span>
              </div>
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <p className="text-xl font-bold text-white tabular-nums">
                    {s.primary.value}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                    {s.primary.label}
                  </p>
                </div>
                {s.secondary.map((sec) => (
                  <div key={sec.label}>
                    <p className="text-base font-semibold text-slate-300 tabular-nums">
                      {sec.value}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {sec.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
