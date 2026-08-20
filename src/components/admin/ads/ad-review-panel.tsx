"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  PencilLine,
  RotateCcw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
import { ModalShell } from "@/components/admin/ads/modal-shell";
import {
  PLACEMENT_LABELS,
  StatusPill,
  targetingChips,
  timeAgo,
} from "@/components/admin/ads/ad-ui";
import { AdRejectForm, type NegativeDecision } from "@/components/admin/ads/ad-reject-form";
import { SandboxedAdFrame } from "@/components/user/primitives/sandboxed-ad-frame";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { reasonLabel } from "@/lib/ad-review-reasons";
import type { AdTargeting } from "@/lib/ad-targeting";

interface ReviewAd {
  id: string;
  status: string;
  type: string;
  format: string;
  headline: string | null;
  brandName: string | null;
  brandLogo: string | null;
  ctaLabel: string | null;
  targetUrl: string | null;
  contentUrl: string | null;
  videoUrl: string | null;
  size: string | null;
  width: number | null;
  height: number | null;
  weight: number;
  rewardPoints: number;
  watchSeconds: number;
  impressions: number;
  clicks: number;
  targeting: AdTargeting | null;
  submittedAt: string | null;
  approvedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
  rejectionCodes: string[];
  reviewNote: string | null;
  creativeGroupId: string | null;
  placement: { name: string };
  campaign: {
    id: string;
    title: string;
    status: string;
    budget: number;
    spentTotal: number;
    isHouse: boolean;
    startAt: string | null;
    endAt: string | null;
  };
}

interface Person {
  id: string;
  name: string | null;
  username: string | null;
  email?: string | null;
  status?: string;
  createdAt?: string;
  adCreditBalance?: number;
}

interface ReviewPayload {
  ad: ReviewAd;
  siblings: { id: string; status: string; placement: { name: string } }[];
  submittedBy: Person | null;
  advertiser: Person | null;
  advertiserHistory: {
    approved: number;
    rejected: number;
    pending: number;
    changesRequested: number;
  };
  reviews: {
    id: string;
    action: string;
    reasonCodes: string[];
    message: string | null;
    internalNote: string | null;
    createdAt: string;
    actor: Person | null;
  }[];
  reach: { count: number; total: number } | null;
}

interface PreviewAd {
  id: string;
  type: string;
  format: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  brandLogo?: string;
  html?: string;
  allowSameOrigin?: boolean;
}

const EDITABLE = [
  { key: "targetUrl", label: "Destination URL" },
  { key: "headline", label: "Headline" },
  { key: "brandName", label: "Brand name" },
  { key: "ctaLabel", label: "CTA label" },
  { key: "contentUrl", label: "Image URL" },
  { key: "videoUrl", label: "Video URL" },
] as const;

/**
 * The reviewer's workspace: creative preview + every fact needed to decide, with
 * approve / approve-with-edits / request-changes / reject / reopen in one place.
 * Nothing here fires an impression — the preview endpoint renders the ad's own
 * fields rather than going through the live serve path.
 */
export function AdReviewPanel({
  adId,
  canManage,
  onClose,
  onDecided,
}: {
  adId: string;
  canManage: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [preview, setPreview] = useState<PreviewAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<NegativeDecision | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch(`/api/admin/ads/${adId}/review`),
        fetch(`/api/admin/ads/${adId}/preview`),
      ]);
      if (!rRes.ok) throw new Error("Failed to load the ad");
      const r = (await rRes.json()) as ReviewPayload;
      setData(r);
      const p = await pRes.json().catch(() => null);
      setPreview(p?.ad ?? null);
      setEdits(
        Object.fromEntries(
          EDITABLE.map(({ key }) => [key, (r.ad as unknown as Record<string, string | null>)[key] ?? ""])
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the ad");
    } finally {
      setLoading(false);
    }
  }, [adId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ads/${adId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Action failed");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    const changed: Record<string, string | null> = {};
    if (editing && data) {
      for (const { key } of EDITABLE) {
        const before = (data.ad as unknown as Record<string, string | null>)[key] ?? "";
        if (edits[key] !== before) changed[key] = edits[key] || null;
      }
    }
    const ok = await act("approve", Object.keys(changed).length ? { edits: changed } : {});
    if (ok) {
      toast.success(
        Object.keys(changed).length
          ? "Approved with your edits — the advertiser was notified"
          : "Approved — the ad is live and the advertiser was notified"
      );
      onDecided();
      onClose();
    }
  };

  const submitNegative = async (payload: {
    reasonCodes: string[];
    message: string;
    internalNote: string;
  }) => {
    const ok = await act(decision === "reject" ? "reject" : "request-changes", payload);
    if (ok) {
      toast.success(
        decision === "reject" ? "Rejected — the advertiser was notified" : "Sent back for changes"
      );
      onDecided();
      onClose();
    }
  };

  const reopen = async () => {
    const ok = await act("reopen");
    if (ok) {
      toast.success("Back in the review queue");
      onDecided();
      await load();
    }
  };

  const ad = data?.ad;
  const host = safeHost(ad?.targetUrl);
  const insecure = !!ad?.targetUrl && !ad.targetUrl.startsWith("https://");
  const brandMismatch =
    !!host && !!ad?.brandName && !host.toLowerCase().includes(ad.brandName.toLowerCase().split(" ")[0] ?? "");
  const campaignDead =
    !!ad &&
    (ad.campaign.status !== "ACTIVE" ||
      (!!ad.campaign.endAt && new Date(ad.campaign.endAt) < new Date()) ||
      (!ad.campaign.isHouse && ad.campaign.budget <= 0));

  return (
    <ModalShell
      title="Review ad"
      size="xl"
      onClose={onClose}
      footer={
        canManage && ad && !decision ? (
          <div className="flex flex-wrap gap-2 justify-end">
            {(ad.status === "REJECTED" ||
              ad.status === "ACTIVE" ||
              ad.status === "PAUSED" ||
              ad.status === "CHANGES_REQUESTED") && (
              <button
                onClick={reopen}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold"
              >
                <RotateCcw className="w-4 h-4" /> Reopen review
              </button>
            )}
            <button
              onClick={() => setEditing((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold",
                editing ? "bg-blue-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-200"
              )}
            >
              <PencilLine className="w-4 h-4" /> {editing ? "Editing" : "Edit before approving"}
            </button>
            <button
              onClick={() => setDecision("request-changes")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
            >
              <PencilLine className="w-4 h-4" /> Request changes
            </button>
            <button
              onClick={() => setDecision("reject")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
            >
              <ShieldAlert className="w-4 h-4" /> Reject
            </button>
            <button
              onClick={approve}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editing ? "Approve with edits" : "Approve"}
            </button>
          </div>
        ) : null
      }
    >
      {loading || !ad ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* ── Creative ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <Section title="Creative">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                {preview?.html ? (
                  <SandboxedAdFrame
                    html={preview.html}
                    height={260}
                    badge={false}
                    allowSameOrigin={preview.allowSameOrigin}
                  />
                ) : preview?.videoUrl ? (
                  <video
                    src={preview.videoUrl}
                    controls
                    muted
                    playsInline
                    className="w-full rounded-lg bg-black"
                  />
                ) : preview?.imageUrl ? (
                  <SmartImage
                    src={preview.imageUrl}
                    alt=""
                    width={640}
                    height={360}
                    className="w-full rounded-lg object-contain bg-slate-950"
                  />
                ) : (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    No image or video — text-only ad.
                  </p>
                )}
                <div className="mt-3 space-y-1.5">
                  {ad.brandName && (
                    <p className="text-sm font-semibold text-white">{ad.brandName}</p>
                  )}
                  {ad.headline && (
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{ad.headline}</p>
                  )}
                  {ad.ctaLabel && (
                    <span className="inline-block px-2 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold">
                      {ad.ctaLabel}
                    </span>
                  )}
                </div>
              </div>
            </Section>

            {/* The single most important thing to check, and the one the old
                queue never showed at all. */}
            <Section title="Destination">
              {ad.targetUrl ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-base font-bold text-white break-all">{host}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 break-all">{ad.targetUrl}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {insecure && <Flag tone="red">Not https</Flag>}
                    {brandMismatch && <Flag tone="amber">Host doesn&apos;t match brand name</Flag>}
                  </div>
                  <a
                    href={ad.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open landing page
                  </a>
                </div>
              ) : (
                <Flag tone="red">No destination URL</Flag>
              )}
            </Section>

            {editing && (
              <Section title="Fix before approving">
                <div className="space-y-2">
                  {EDITABLE.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        {label}
                      </label>
                      <input
                        value={edits[key] ?? ""}
                        onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500">
                    Only changed fields are saved, and the change is recorded in the review trail.
                  </p>
                </div>
              </Section>
            )}
          </div>

          {/* ── Facts ────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <Section title="Submission">
              <Facts
                rows={[
                  ["Status", <StatusPill key="s" status={ad.status} />],
                  ["Waiting", timeAgo(ad.submittedAt ?? ad.createdAt)],
                  ["Format", ad.format === "NATIVE" ? "Feed (native)" : "Banner"],
                  ["Type", ad.type],
                  [
                    "Ad spaces",
                    (data.siblings.length ? data.siblings : [{ placement: ad.placement, id: ad.id, status: ad.status }])
                      .map((s) => PLACEMENT_LABELS[s.placement.name] ?? s.placement.name)
                      .join(", "),
                  ],
                  ["Size", ad.size ?? "responsive"],
                  ["Weight", String(ad.weight)],
                  ...(ad.rewardPoints > 0
                    ? [["Reward", `${ad.rewardPoints} pts · ${ad.watchSeconds}s watch`] as [string, string]]
                    : []),
                ]}
              />
            </Section>

            <Section
              title="Audience"
              aside={
                data.reach ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                    <Users className="w-3.5 h-3.5" />
                    {data.reach.count.toLocaleString()} of {data.reach.total.toLocaleString()} users
                  </span>
                ) : null
              }
            >
              {targetingChips(ad.targeting).length === 0 ? (
                <p className="text-sm text-slate-400">Everyone (no targeting rules).</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {targetingChips(ad.targeting).map((c) => (
                    <span
                      key={c.label}
                      className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-200"
                    >
                      <span className="text-slate-400">{c.label}:</span> {c.value}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Advertiser">
              {data.advertiser ? (
                <>
                  <Facts
                    rows={[
                      ["Name", data.advertiser.name ?? data.advertiser.username ?? "—"],
                      ["Username", data.advertiser.username ?? "—"],
                      ["Account", data.advertiser.status ?? "—"],
                      ["Member since", fmtDate(data.advertiser.createdAt)],
                      ["Ad credit", `${usd((data.advertiser.adCreditBalance ?? 0))}`],
                      [
                        "Track record",
                        `${data.advertiserHistory.approved} approved · ${data.advertiserHistory.rejected} rejected`,
                      ],
                    ]}
                  />
                  {data.advertiserHistory.rejected >= 3 && (
                    <div className="mt-2">
                      <Flag tone="amber">
                        {data.advertiserHistory.rejected} previous rejections — look closely
                      </Flag>
                    </div>
                  )}
                  <a
                    href={`/admin/users/${data.advertiser.id}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300"
                  >
                    Open user <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              ) : (
                <p className="text-sm text-slate-400">House ad (no advertiser).</p>
              )}
            </Section>

            <Section title="Campaign">
              <Facts
                rows={[
                  ["Title", ad.campaign.title],
                  ["Status", ad.campaign.status],
                  ["Remaining budget", `${usd(ad.campaign.budget)}`],
                  ["Spent", `${usd(ad.campaign.spentTotal)}`],
                  ["Runs", `${fmtDate(ad.campaign.startAt)} → ${fmtDate(ad.campaign.endAt)}`],
                ]}
              />
              {campaignDead && (
                <div className="mt-2">
                  <Flag tone="amber">
                    This campaign is paused, ended or out of budget — approving won&apos;t make the
                    ad serve.
                  </Flag>
                </div>
              )}
            </Section>

            {ad.rejectionReason && (
              <Section title="Last decision">
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{ad.rejectionReason}</p>
                {ad.rejectionCodes.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {ad.rejectionCodes.map(reasonLabel).join(" · ")}
                  </p>
                )}
                {ad.reviewNote && (
                  <p className="mt-1 text-[11px] text-amber-300">Internal: {ad.reviewNote}</p>
                )}
              </Section>
            )}

            <Section title="History">
              {data.reviews.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {data.reviews.map((r) => (
                    <li key={r.id} className="text-[11px] text-slate-400">
                      <span className="text-slate-200 font-semibold">
                        {r.action.replaceAll("_", " ").toLowerCase()}
                      </span>{" "}
                      · {fmtDateTime(r.createdAt)}
                      {r.actor && <> · {r.actor.name ?? r.actor.username}</>}
                      {r.reasonCodes.length > 0 && (
                        <div className="text-slate-500">{r.reasonCodes.map(reasonLabel).join(" · ")}</div>
                      )}
                      {r.message && <div className="text-slate-400">{r.message}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {decision && (
              <AdRejectForm
                decision={decision}
                busy={busy}
                onCancel={() => setDecision(null)}
                onSubmit={submitNegative}
              />
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h4>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/70">
      {rows.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="flex items-start justify-between gap-3 px-3 py-1.5">
          <dt className="text-[11px] text-slate-500 shrink-0">{k}</dt>
          <dd className="text-xs text-slate-200 text-right break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Flag({ tone, children }: { tone: "red" | "amber"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold",
        tone === "red" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
      )}
    >
      <AlertTriangle className="w-3 h-3" />
      {children}
    </span>
  );
}

function safeHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
