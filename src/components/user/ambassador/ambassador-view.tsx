"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Medal, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { pts } from "@/lib/utils";
import { validateAnswers, type ApplicationQuestion } from "@/lib/application-requirements";
import { ApplicationQuestionFields } from "@/components/shared/application-questions";

interface Data {
  terms: {
    enabled: boolean;
    minLevelToApply: number;
    minReferralsToApply: number;
    requireKyc: boolean;
    qualifyTasks: number;
    pointsPerReferral: number;
    monthlyTarget: number;
    targetBonus: number;
    monthlyCap: number;
  };
  cannotApply: string | null;
  application: { status: string; adminNote: string | null; createdAt: string } | null;
  thisMonth: { month: string; qualified: number; projected: number } | null;
  payouts: { month: string; qualified: number; points: number }[];
  questions?: ApplicationQuestion[];
}

export function AmbassadorView() {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/ambassador", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const apply = async () => {
    const qa = validateAnswers(data?.questions ?? [], answers);
    if (!qa.ok) {
      toast.error(qa.error);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/ambassador", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, answers }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't apply");
      toast.success("Application sent — we'll let you know");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-(--app-accent-ink)" />;
  const t = data.terms;
  const app = data.application;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="t-title text-white inline-flex items-center gap-2">
          <Medal className="h-6 w-6 text-amber-300" /> Ambassador Program
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Represent RevType, bring in people who really use it, and earn a monthly ambassador bonus — on top of your
          normal referral commission, which stays exactly the same.
        </p>
      </div>

      {!t.enabled ? (
        <div className="app-card text-center text-sm text-(--app-ink-3)">The ambassador program isn&apos;t open right now.</div>
      ) : (
        <>
          <div className="app-card space-y-2">
            <h2 className="t-section text-white">How it works</h2>
            <ul className="space-y-1.5 text-sm text-(--app-ink-2)">
              <li>• <b className="text-white">{pts(t.pointsPerReferral)} pts</b> for every new member you bring in who completes {t.qualifyTasks} approved task{t.qualifyTasks === 1 ? "" : "s"}.</li>
              {t.monthlyTarget > 0 && t.targetBonus > 0 && (
                <li>• Reach <b className="text-white">{t.monthlyTarget}</b> such members in a month: <b className="text-white">+{pts(t.targetBonus)} pts</b> extra.</li>
              )}
              {t.monthlyCap > 0 && <li>• Up to {pts(t.monthlyCap)} pts a month.</li>}
              <li>• Each month is paid at the start of the month after next — so members you bring in late in a month have time to get going.</li>
              <li>
                • To apply: level {t.minLevelToApply}+
                {t.requireKyc ? ", verified identity (KYC)" : ""}
                {t.minReferralsToApply > 0 ? `, ${t.minReferralsToApply} active referrals` : ""}.
              </li>
            </ul>
          </div>

          {app?.status === "APPROVED" ? (
            <div className="app-card space-y-3">
              <p className="inline-flex items-center gap-2 font-bold text-emerald-300">
                <BadgeCheck className="h-5 w-5" /> You&apos;re an ambassador
              </p>
              {data.thisMonth && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-(--app-surface-2) p-3">
                    <p className="t-meta text-(--app-ink-3)">Active new members ({data.thisMonth.month})</p>
                    <p className="text-2xl font-black text-white inline-flex items-center gap-1.5"><Users className="h-5 w-5" /> {data.thisMonth.qualified}</p>
                    {t.monthlyTarget > 0 && <p className="text-xs text-(--app-ink-3)">target {t.monthlyTarget}</p>}
                  </div>
                  <div className="rounded-xl bg-(--app-surface-2) p-3">
                    <p className="t-meta text-(--app-ink-3)">Bonus so far</p>
                    <p className="text-2xl font-black text-amber-300">{pts(data.thisMonth.projected)} pts</p>
                    <p className="text-xs text-(--app-ink-3)">counted until paid</p>
                  </div>
                </div>
              )}
              <Link href="/referrals" className="inline-block text-sm font-bold text-(--app-accent-ink)">Get your invite link →</Link>
            </div>
          ) : app?.status === "PENDING" ? (
            <div className="app-card text-sm text-amber-300">Your application is being reviewed.</div>
          ) : app?.status === "REMOVED" ? (
            <div className="app-card text-sm text-(--app-ink-3)">You&apos;re no longer in the program.{app.adminNote ? ` ${app.adminNote}` : ""}</div>
          ) : (
            <div className="app-card space-y-3">
              <h2 className="t-section text-white">Apply</h2>
              {app?.status === "REJECTED" && <p className="text-xs text-red-300">Last application wasn&apos;t approved{app.adminNote ? `: ${app.adminNote}` : "."} You can apply again.</p>}
              {data.cannotApply ? (
                <p className="text-sm text-(--app-ink-3)">{data.cannotApply}</p>
              ) : (
                <>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={1000}
                    placeholder="How will you share RevType? (your page, group, channel…)"
                    className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2 text-sm text-(--app-ink)"
                  />
                  <ApplicationQuestionFields
                    questions={data.questions ?? []}
                    values={answers}
                    onChange={setAnswers}
                    inputClassName="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2 text-sm text-(--app-ink)"
                  />
                  <button type="button" onClick={apply} disabled={busy} className="app-accent inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply
                  </button>
                </>
              )}
            </div>
          )}

          {data.payouts.length > 0 && (
            <div className="app-card space-y-2">
              <h2 className="t-section text-white">Your bonuses</h2>
              {data.payouts.map((p) => (
                <p key={p.month} className="flex justify-between text-sm text-(--app-ink-2)">
                  <span>{p.month} · {p.qualified} active new member{p.qualified === 1 ? "" : "s"}</span>
                  <b className="text-amber-300">{pts(p.points)} pts</b>
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
