"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Send,
  Zap,
  ScanFace,
  AlertTriangle,
  Lightbulb,
  IdCard,
  Camera,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";

export interface KycDoc {
  id: string;
  documentType: string;
  images: string[];
  status: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface Props {
  kycStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
  document: KycDoc | null;
  autoEnabled?: boolean;
}

const DOC_TYPES = [
  "National ID (NID)",
  "Passport",
  "Driving License",
  "Other government ID",
];

export function KycSubmitView({ kycStatus, document, autoEnabled = true }: Props) {
  const router = useRouter();
  const [documentType, setDocumentType] = useState(DOC_TYPES[0]);
  const [documentNumber, setDocumentNumber] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [selfie, setSelfie] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">(autoEnabled ? "auto" : "manual");
  const [verifying, setVerifying] = useState(false);
  // Prominent inline error (e.g. "not a valid ID") — not just a toast.
  const [autoError, setAutoError] = useState<string | null>(null);

  const canSubmit = kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED";

  const submitAuto = async () => {
    setAutoError(null);
    if (!front.trim() || !selfie.trim()) {
      toast.error("Add your ID photo and a selfie to verify instantly");
      return;
    }
    setVerifying(true);
    try {
      const idImages = [front, back].map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/kyc/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, idImages, selfie: selfie.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d.error ?? `HTTP ${res.status}`;
        // A rejected (non-ID) image gets a persistent inline banner so it's clear.
        if (res.status === 422 || d.status === "REJECTED") setAutoError(msg);
        throw new Error(msg);
      }
      if (d.status === "APPROVED") {
        toast.success("Verified instantly", {
          description: "Your identity is confirmed — withdrawals unlocked.",
        });
      } else {
        toast.success("Submitted — a quick manual check is needed", {
          description: Array.isArray(d.reasons) && d.reasons.length ? d.reasons[0] : undefined,
        });
      }
      setFront("");
      setBack("");
      setSelfie("");
      router.refresh();
    } catch (err) {
      toast.error("Verification failed", {
        description: err instanceof Error ? err.message : "Try again or upload manually",
      });
    } finally {
      setVerifying(false);
    }
  };

  const submit = async () => {
    const images = [front, back, selfie].map((s) => s.trim()).filter(Boolean);
    if (images.length === 0) {
      toast.error("Upload at least your ID document photo");
      return;
    }
    // Required, and checked here only for the message — the route enforces it.
    // Manual used to carry no number at all, which made it the way around the
    // one-ID-one-account rule that the scanned path already applied.
    if (documentNumber.trim().length < 4) {
      toast.error("Enter the number printed on your document");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          images,
          documentNumber: documentNumber.trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("KYC submitted — we'll review it shortly");
      setDocumentNumber("");
      setFront("");
      setBack("");
      setSelfie("");
      router.refresh();
    } catch (err) {
      toast.error("Submission failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to profile
      </Link>

      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-indigo-400" />
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">
            Identity Verification (KYC)
          </h1>
          <p className="text-xs sm:text-sm text-gray-400">
            Verify your identity to unlock higher withdrawal limits and the blue
            verified badge.
          </p>
        </div>
      </div>

      {/* Status banners */}
      {kycStatus === "APPROVED" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">
              Your identity is verified
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              You have full withdrawal access and the verified badge.
            </p>
          </div>
        </div>
      )}

      {kycStatus === "PENDING" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-400">
              Submission under review
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              We&apos;re reviewing your documents. You&apos;ll be notified once a
              decision is made.
            </p>
          </div>
        </div>
      )}

      {kycStatus === "REJECTED" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">
                Your previous submission was rejected
              </p>
              {document?.rejectionReason && (
                <p className="text-xs text-gray-300 mt-0.5">
                  Reason: {document.rejectionReason}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                You can resubmit below, or{" "}
                <Link
                  href="/kyc/appeal"
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  appeal this decision
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Previously submitted images (pending/approved) */}
      {!canSubmit && document && document.images.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">
            Submitted documents · {document.documentType}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {document.images.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`KYC document ${i + 1}`}
                className="aspect-square w-full rounded-lg border border-gray-800 object-cover bg-gray-950"
              />
            ))}
          </div>
        </div>
      )}

      {/* Submission form */}
      {canSubmit && (
        <div className="space-y-4">
          {autoEnabled && (
            <div className="inline-flex w-full rounded-lg border border-gray-800 overflow-hidden text-xs">
              {([
                ["auto", "Instant verify"],
                ["manual", "Upload manually"],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 px-3 py-2 font-semibold inline-flex items-center justify-center gap-1",
                    mode === m ? "bg-indigo-500 text-white" : "bg-gray-900 text-gray-400"
                  )}
                >
                  {m === "auto" && <Zap className="w-3.5 h-3.5" />}
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Document type — shared */}
          <div className="card p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Document type
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Only the manual path asks for this — the scanned path reads the
                number off the ID itself. Both end up checked against every
                other account, so neither is a way around the other. */}
            {mode === "manual" && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Document number
                </label>
                <input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="As printed on the document"
                  inputMode="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Each document can verify one account only.
                </p>
              </div>
            )}

            {mode === "auto" && autoEnabled ? (
              <>
                <div className="flex items-start gap-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-3">
                  <Zap className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-300">
                    Scan your ID and take a selfie — our AI reads the ID and matches
                    your face to verify instantly. Anything unclear goes to a quick
                    manual check.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1.5">
                      <IdCard className="w-3.5 h-3.5 text-indigo-400" /> ID front{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <ProofImageUpload value={front} onChange={setFront} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1.5">
                      <IdCard className="w-3.5 h-3.5 text-gray-500" /> ID back
                      <span className="text-gray-600">(NID)</span>
                    </label>
                    <ProofImageUpload value={back} onChange={setBack} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-400" /> Selfie{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <ProofImageUpload value={selfie} onChange={setSelfie} />
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-gray-800/50 border border-gray-800 p-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Tips: capture the full ID with all four corners visible, avoid
                    glare and blur, and make sure the text is readable. For a National
                    ID, add the back too. Max 5&nbsp;MB per image.
                  </p>
                </div>

                {autoError && (
                  <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-400">
                        We couldn&apos;t verify this image
                      </p>
                      <p className="text-xs text-gray-300 mt-0.5">{autoError}</p>
                    </div>
                  </div>
                )}

                <button
                  onClick={submitAuto}
                  disabled={verifying}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verifying your ID…
                    </>
                  ) : (
                    <>
                      <ScanFace className="w-4 h-4" /> Verify instantly
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      ID front <span className="text-red-400">*</span>
                    </label>
                    <ProofImageUpload value={front} onChange={setFront} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      ID back
                    </label>
                    <ProofImageUpload value={back} onChange={setBack} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Selfie with ID
                    </label>
                    <ProofImageUpload value={selfie} onChange={setSelfie} />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">
                  Upload a clear photo of your government-issued ID (front required).
                  Adding the back and a selfie holding your ID speeds up approval.
                  Max 5&nbsp;MB per image.
                </p>
                <button
                  onClick={submit}
                  disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {kycStatus === "REJECTED" ? "Resubmit for review" : "Submit for review"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
