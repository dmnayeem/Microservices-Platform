"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Hourglass,
  Loader2,
  Megaphone,
  Play,
  RotateCcw,
  Send,
  Star,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";
import { EmptyState, Skeleton } from "@/components/user/primitives";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import {
  CpaStatusChip,
  DifficultyChip,
  OfferLogo,
  PointsLabel,
  cpaErrorMessage,
  fmtDate,
  releaseIn,
  tryAgainText,
  type CpaMine,
  type CpaOffer,
} from "./cpa-shared";

interface Detail {
  offer: CpaOffer;
  available: boolean;
  reason: string | null;
  message: string | null;
  /** RETRY_LATER: when this rejected offer may be tried again. */
  retryAt: string | null;
  my: CpaMine | null;
  /** Started THIS attempt (after a rejection: started again since). */
  hasStarted: boolean;
}

const MAX_PROOFS = 5;

export function CpaOfferDetail({
  id,
  pointsPerUsd,
  errorCode,
}: {
  id: string;
  pointsPerUsd: number;
  errorCode: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<Detail | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [banner] = useState(() => cpaErrorMessage(errorCode));
  const [newTab, setNewTab] = useState(false);
  const [startedHere, setStartedHere] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cpa/offers/${encodeURIComponent(id)}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setMissing(d.error ?? "This offer isn't available.");
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "Couldn't load the offer");
      setData(d as Detail);
    } catch (e) {
      toast.error("Couldn't load the offer", {
        description: e instanceof Error ? e.message : "Try again",
      });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // A Start refused by /go/cpa comes back as ?error=CODE: say it once, then
  // drop the code so a refresh doesn't repeat it.
  const toasted = useRef(false);
  useEffect(() => {
    if (!banner || toasted.current) return;
    toasted.current = true;
    toast.error(banner.title, { description: banner.body });
    router.replace(pathname, { scroll: false });
  }, [banner, pathname, router]);

  // Desktop opens the network in a new tab so this page stays put for the
  // proof; phones go in the same tab (popups get lost there) and come back.
  useEffect(() => {
    try {
      setNewTab(window.matchMedia("(min-width: 768px) and (pointer: fine)").matches);
    } catch {
      /* default: same tab */
    }
  }, []);

  // Coming back from the network — refresh so "Start" turns into the proof form.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink />
        {banner && <ErrorBanner title={banner.title} body={banner.body} />}
        <div className="app-card">
          <EmptyState
            icon={Megaphone}
            title="Offer not available"
            description={missing}
            action={{ label: "Browse offers", href: "/cpa" }}
          />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink />
        <div className="app-card space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const { offer, my } = data;
  const started = data.hasStarted || startedHere;
  const goHref = `/go/cpa/${encodeURIComponent(offer.id)}`;
  // A rejected offer may be started again once the retry wait is over (the
  // server says so with `available`); every other status is final.
  const canRetry = !!my && my.status === "REJECTED" && data.available;
  const canStart = data.available && (!my || canRetry);
  const canAttachProof =
    !!my && my.status === "PENDING" && my.proofImages.length === 0 && !my.proofText;
  const showForm = (canStart && started) || canAttachProof;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink />
      {banner && <ErrorBanner title={banner.title} body={banner.body} />}

      {/* Header */}
      <section className="app-card relative overflow-hidden">
        {offer.featured && (
          <span className="app-accent absolute right-0 top-0 inline-flex items-center gap-1 rounded-bl-xl px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            <Star className="h-3 w-3" /> Featured
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          <OfferLogo src={offer.logoUrl} alt={offer.title} size={80} className="rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="t-title wrap-break-word text-white">{offer.title}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="app-chip max-w-full truncate">{offer.network}</span>
              {offer.category && <span className="app-chip max-w-full truncate">{offer.category}</span>}
              <DifficultyChip difficulty={offer.difficulty} />
              {offer.estMinutes != null && offer.estMinutes > 0 && (
                <span className="app-chip whitespace-nowrap">
                  <Clock className="h-3 w-3" /> ~{offer.estMinutes} min
                </span>
              )}
            </div>
            <PointsLabel points={offer.points} pointsPerUsd={pointsPerUsd} size="lg" />
          </div>
        </div>
        {offer.description && (
          <p className="t-body mt-4 whitespace-pre-line wrap-break-word text-(--app-ink-2)">
            {offer.description}
          </p>
        )}
      </section>

      {/* Status of the user's conversion */}
      {my && (
        <StatusCard
          my={my}
          holdHours={offer.holdHours}
          retryLine={my.status === "REJECTED" ? tryAgainText(data.retryAt, canRetry) : null}
        />
      )}

      {/* Can't start (daily cap) and nothing submitted */}
      {!my && !data.available && data.message && (
        <div className="app-card flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 t-warn" />
          <p className="t-body text-(--app-ink-2)">{data.message}</p>
        </div>
      )}

      {/* Start */}
      {canStart && (
        <section className="app-card space-y-3">
          {!started ? (
            <>
              <a
                href={goHref}
                target={newTab ? "_blank" : undefined}
                rel={newTab ? "noopener" : undefined}
                onClick={() => {
                  if (newTab) setStartedHere(true);
                }}
                className="app-accent app-accent-glow app-press flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-base font-bold"
              >
                {canRetry ? (
                  <>
                    <RotateCcw className="h-5 w-5" /> Try again
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" /> Start offer
                  </>
                )}
              </a>
              <p className="t-meta text-center text-(--app-ink-3)">
                {newTab
                  ? "The offer opens in a new tab. Finish it there, then come back to this page to send your proof."
                  : "You'll go to the partner's site. Finish the offer there, then come back to this page to send your proof."}
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="t-body text-(--app-ink-2)">
                <CheckCircle2 className="mr-1.5 inline h-4 w-4 t-in" />
                You started this offer. Finished it? Send your proof below.
              </p>
              <a
                href={goHref}
                target={newTab ? "_blank" : undefined}
                rel={newTab ? "noopener" : undefined}
                className="app-press inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-(--app-line) bg-(--app-surface-2) px-4 text-sm font-semibold text-white"
              >
                Open offer again <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}
        </section>
      )}

      {showForm && (
        <ProofForm
          offer={offer}
          onDone={() => {
            load();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {/* Steps */}
      {offer.steps.length > 0 && (
        <section className="app-card">
          <h2 className="t-section mb-3 text-white">Steps</h2>
          <ol className="space-y-3">
            {offer.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="app-icon-accent grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums">
                  {i + 1}
                </span>
                <p className="t-body min-w-0 flex-1 wrap-break-word pt-0.5 text-(--app-ink-2)">{s}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* How it works */}
      <section className="app-card">
        <h2 className="t-section mb-3 text-white">How it works</h2>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { icon: Play, title: "Start", body: "Tap Start offer." },
            { icon: ExternalLink, title: "Complete", body: `Finish it on ${offer.network}.` },
            { icon: Send, title: "Send proof", body: "Come back and upload a screenshot." },
            { icon: Hourglass, title: "Review", body: "Our team checks it." },
            {
              icon: CheckCircle2,
              title: "Get points",
              body:
                offer.holdHours > 0
                  ? `${pts(offer.points)} pts, released ${offer.holdHours}h after approval.`
                  : `${pts(offer.points)} pts once approved.`,
            },
          ].map((s, i) => (
            <li key={s.title} className="app-tile flex min-w-0 items-start gap-3 lg:flex-col lg:gap-2">
              <span className="app-icon h-8 w-8 shrink-0">
                <s.icon className="h-4 w-4 text-(--app-accent-ink)" />
              </span>
              <div className="min-w-0">
                <p className="t-label text-white">
                  <span className="text-(--app-ink-3) tabular-nums">{i + 1}.</span> {s.title}
                </p>
                <p className="t-meta wrap-break-word text-(--app-ink-3)">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/cpa"
      className="app-press inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap text-sm text-(--app-ink-3) hover:text-(--app-ink)"
    >
      <ArrowLeft className="h-4 w-4" /> All offers
    </Link>
  );
}

function ErrorBanner({ title, body }: { title: string; body: string }) {
  return (
    <div role="alert" className="app-card flex items-start gap-3 border-(--app-out-line) bg-(--app-out-soft)">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 t-out" />
      <div className="min-w-0">
        <p className="t-label t-out">{title}</p>
        <p className="t-meta wrap-break-word text-(--app-ink-2)">{body}</p>
      </div>
    </div>
  );
}

function StatusCard({
  my,
  holdHours,
  retryLine,
}: {
  my: CpaMine;
  holdHours: number;
  retryLine: string | null;
}) {
  const s = my.status;
  const tone =
    s === "APPROVED"
      ? { icon: CheckCircle2, cls: "t-in", title: "Approved — points credited" }
      : s === "HELD"
        ? { icon: Hourglass, cls: "t-info", title: `Approved — releasing ${releaseIn(my.heldUntil)}` }
        : s === "PENDING"
          ? { icon: Clock, cls: "t-warn", title: "Proof received — waiting for review" }
          : s === "REVERSED"
            ? { icon: XCircle, cls: "t-out", title: "Reversed" }
            : { icon: XCircle, cls: "t-out", title: "Rejected" };
  const Icon = tone.icon;
  const body =
    s === "APPROVED"
      ? `${pts(my.points)} pts were added to your balance${my.creditedAt ? ` on ${fmtDate(my.creditedAt)}` : ""}.`
      : s === "HELD"
        ? `${pts(my.points)} pts will be added to your balance when the ${holdHours > 0 ? `${holdHours}h ` : ""}hold ends.`
        : s === "PENDING"
          ? `We'll check your proof and add ${pts(my.points)} pts once it's approved. This usually takes a day or two.`
          : s === "REVERSED"
            ? "The partner reversed this conversion, so its points were taken back."
            : "This submission wasn't approved.";

  return (
    <section className="app-card space-y-3">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={cn("mt-0.5 h-6 w-6 shrink-0", tone.cls)} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("t-section", tone.cls)}>{tone.title}</p>
          </div>
          <p className="t-body wrap-break-word text-(--app-ink-2)">{body}</p>
          {(s === "REJECTED" || s === "REVERSED") && my.rejectionReason && (
            <p className="t-body wrap-break-word">
              <span className="t-label t-out">Reason: </span>
              <span className="text-(--app-ink-2)">{my.rejectionReason}</span>
            </p>
          )}
          {retryLine && (
            <p className="t-body wrap-break-word">
              <RotateCcw className="mr-1.5 inline h-4 w-4 t-info" />
              <span className="text-(--app-ink-2)">{retryLine}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CpaStatusChip status={s} heldUntil={my.heldUntil} />
            <span className="t-meta text-(--app-ink-3)">Submitted {fmtDate(my.createdAt)}</span>
          </div>
        </div>
      </div>
      {(my.proofImages.length > 0 || my.proofText) && (
        <div className="app-tile space-y-2">
          <p className="t-label-sm text-(--app-ink-3)">Your proof</p>
          {my.proofImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {my.proofImages.map((src) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="Proof screenshot"
                    className="h-16 w-16 rounded-lg border border-(--app-line) object-cover"
                  />
                </a>
              ))}
            </div>
          )}
          {my.proofText && (
            <p className="t-meta whitespace-pre-line wrap-break-word text-(--app-ink-2)">{my.proofText}</p>
          )}
        </div>
      )}
    </section>
  );
}

function ProofForm({ offer, onDone }: { offer: CpaOffer; onDone: () => void }) {
  const [images, setImages] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const filled = images.filter(Boolean);
  // One upload slot per screenshot so far, plus an empty one, up to the cap.
  const slots = Math.min(MAX_PROOFS, filled.length + 1);
  const ready = offer.proofRequired ? filled.length > 0 : filled.length > 0 || text.trim().length > 0;

  const setSlot = (i: number, url: string) =>
    setImages((prev) => {
      const next = prev.filter(Boolean);
      if (url) next[i] = url;
      else next.splice(i, 1);
      return next;
    });

  const submit = async () => {
    if (!ready) {
      toast.error(offer.proofRequired ? "Add at least one screenshot" : "Add a screenshot or a note");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/cpa/offers/${encodeURIComponent(offer.id)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofImages: filled, proofText: text.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // RETRY_LATER: the server sentence already says "try again in Xh";
        // PROFILE_INCOMPLETE: the profile gate's sentence and checklist.
        throw new Error(d.error ?? "Couldn't send your proof");
      }
      toast.success("Proof sent", { description: "We'll review it and credit your points once approved." });
      onDone();
    } catch (e) {
      toast.error("Couldn't send your proof", {
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="app-card space-y-4">
      <div>
        <h2 className="t-section text-white">Send your proof</h2>
        <p className="t-meta mt-1 text-(--app-ink-3)">
          {offer.completionMode === "POSTBACK"
            ? "This offer can also be confirmed by the partner automatically. Sending a screenshot helps if it isn't."
            : "Upload screenshots that show you completed the offer."}
        </p>
      </div>

      {offer.proofInstructions && (
        <div className="app-tile">
          <p className="t-label-sm mb-1 text-(--app-ink-3)">What to show</p>
          <p className="t-body whitespace-pre-line wrap-break-word text-(--app-ink-2)">{offer.proofInstructions}</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="t-label text-white">
          Screenshots{" "}
          <span className="t-meta text-(--app-ink-3)">
            {offer.proofRequired ? "(required" : "(optional"}, up to {MAX_PROOFS})
          </span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: slots }, (_, i) => (
            <ProofImageUpload key={i} value={filled[i] ?? ""} onChange={(url) => setSlot(i, url)} />
          ))}
        </div>
      </div>

      <label className="block space-y-2">
        <span className="t-label text-white">
          Note <span className="t-meta text-(--app-ink-3)">(optional)</span>
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="e.g. the email or username you signed up with"
          className="app-field resize-y"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={busy || !ready}
        className="app-accent app-press flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-base font-bold disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        Submit proof
      </button>
    </section>
  );
}
