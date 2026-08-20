"use client";
import { usd } from "@/lib/utils";

import {
  CheckCircle2,
  AlertCircle,
  Tag,
  Globe,
  Users,
  ListChecks,
  DollarSign,
} from "lucide-react";
import type { BuilderState, StepName } from "../types";
import { STEPS, countLessons, totalDuration } from "../types";
import { SectionHeader } from "../shared";

interface Props {
  state: BuilderState;
  blockers: Record<StepName, string[]>;
  role: "admin" | "tutor";
}

export function ReviewStep({ state, blockers, role }: Props) {
  const errs = STEPS.flatMap((s) =>
    blockers[s].map((m) => ({ step: s, msg: m }))
  );
  const ok = errs.length === 0;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Review & submit"
        subtitle={
          role === "admin"
            ? "Publish goes live immediately."
            : "Submit sends the course to an admin for approval. You can still keep editing until they review it."
        }
      />

      {ok ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-white font-bold">Everything looks good</p>
            <p className="text-xs text-emerald-100/80 mt-0.5">
              You can publish now, or keep tweaking and come back later.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-300 mt-0.5 shrink-0" />
            <div>
              <p className="text-white font-bold">{errs.length} item(s) to fix</p>
              <p className="text-xs text-rose-100/80 mt-0.5">
                Go back to the relevant step using the bar at the top.
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {errs.map((e, i) => (
              <li key={i} className="text-rose-100/90 flex items-center gap-2">
                <span className="text-rose-400 font-mono text-[10px] uppercase">
                  {e.step}
                </span>
                {e.msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard
          icon={<Tag className="w-4 h-4" />}
          label="Title"
          value={state.title || "—"}
        />
        <StatCard
          icon={<Globe className="w-4 h-4" />}
          label="Language"
          value={state.language.toUpperCase()}
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Skill level"
          value={state.skillLevel.replace("_", " ").toLowerCase()}
        />
        <StatCard
          icon={<ListChecks className="w-4 h-4" />}
          label="Curriculum"
          value={`${state.modules.length} modules · ${countLessons(state)} lessons · ${totalDuration(state)} min`}
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Pricing"
          value={
            state.isFree
              ? "Free"
              : state.discountPrice && state.discountPrice < state.price
              ? `${usd(state.discountPrice)} (was ${usd(state.price)})`
              : `${usd(state.price)}`
          }
        />
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Certificate"
          value={state.certificateEnabled ? "Issued on completion" : "Disabled"}
        />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wide font-bold">
        {icon}
        {label}
      </div>
      <p className="text-sm text-white mt-1 truncate" title={value}>
        {value}
      </p>
    </div>
  );
}
