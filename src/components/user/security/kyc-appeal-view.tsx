"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ShieldAlert,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Plus,
  X,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";

export interface RejectedDoc {
  id: string;
  documentType: string;
  documentUrl: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
}

interface AppealHistoryItem {
  id: string;
  kycDocument: {
    id: string;
    documentType: string;
    rejectionReason: string | null;
    status: string;
  } | null;
  reason: string;
  evidence: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface Props {
  rejectedDocs: RejectedDoc[];
  initialAppeals: AppealHistoryItem[];
}

export function KycAppealView({ rejectedDocs, initialAppeals }: Props) {
  const appealableDocs = rejectedDocs.filter(
    (d) =>
      !initialAppeals.some(
        (a) => a.kycDocument?.id === d.id && a.status === "PENDING"
      )
  );

  const [selectedDocId, setSelectedDocId] = useState<string>(
    appealableDocs[0]?.id ?? ""
  );
  const [reason, setReason] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [appeals, setAppeals] = useState<AppealHistoryItem[]>(initialAppeals);
  const [busy, setBusy] = useState(false);

  // If a new doc gets rejected later, ensure selected stays valid
  useEffect(() => {
    if (!selectedDocId && appealableDocs[0]) {
      setSelectedDocId(appealableDocs[0].id);
    }
  }, [appealableDocs, selectedDocId]);

  const addEvidence = () => {
    const v = evidenceInput.trim();
    if (!v) return;
    if (evidence.length >= 10) {
      toast.error("Up to 10 evidence URLs");
      return;
    }
    try {
      new URL(v);
    } catch {
      toast.error("Enter a valid URL");
      return;
    }
    setEvidence((prev) => [...prev, v]);
    setEvidenceInput("");
  };

  const submit = async () => {
    if (!selectedDocId) {
      toast.error("Pick a document to appeal");
      return;
    }
    if (reason.trim().length < 20) {
      toast.error("Reason must be at least 20 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/kyc/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycDocumentId: selectedDocId,
          reason: reason.trim(),
          evidence,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Appeal submitted", {
        description: "An admin will review it shortly.",
      });
      // Optimistic refresh — re-fetch appeals
      const histRes = await fetch("/api/kyc/appeals");
      const hist = await histRes.json();
      setAppeals(hist.appeals ?? []);
      setReason("");
      setEvidence([]);
    } catch (err) {
      toast.error("Couldn't submit appeal", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedDoc = appealableDocs.find((d) => d.id === selectedDocId);

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link
          href="/profile"
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
          aria-label="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-400" />
            Appeal KYC Decision
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Disagree with a rejection? Submit additional context for re-review.
          </p>
        </div>
      </header>

      {appealableDocs.length === 0 && appeals.length === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
          <p className="text-base font-bold text-white">
            Nothing to appeal
          </p>
          <p className="text-sm text-emerald-200/80 mt-1">
            You don&apos;t have a rejected KYC document right now.
          </p>
          <Link
            href="/profile"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold"
          >
            Back to Profile
          </Link>
        </div>
      )}

      {/* Submit new appeal */}
      {appealableDocs.length > 0 && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
          <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
            <Send className="w-4 h-4 text-indigo-400" />
            Submit a new appeal
          </p>

          {/* Doc picker (only if more than 1) */}
          {appealableDocs.length > 1 ? (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Which rejection do you want to appeal?
              </label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {appealableDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.documentType} ·{" "}
                    {d.reviewedAt
                      ? format(new Date(d.reviewedAt), "PP")
                      : "Recent"}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            selectedDoc && (
              <div className="rounded-lg bg-gray-950/60 border border-gray-800 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">
                  Document
                </p>
                <p className="text-sm font-bold text-white">
                  {selectedDoc.documentType}
                </p>
                {selectedDoc.rejectionReason && (
                  <p className="text-xs text-red-300 mt-1">
                    <strong>Rejected:</strong> {selectedDoc.rejectionReason}
                  </p>
                )}
              </div>
            )
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Why should this be re-reviewed?{" "}
              <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="Explain what was incorrect about the rejection — e.g. the document was clear, the address matches, the photo wasn't blurry…"
              maxLength={2000}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
            <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
              {reason.length}/2000 · minimum 20 characters
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Additional evidence (optional)
            </label>
            <p className="text-[11px] text-gray-500 mb-2">
              Upload screenshots that support your appeal, or paste a URL. Up to
              10 items.
            </p>
            {evidence.length < 10 && (
              <div className="mb-2">
                <ProofImageUpload
                  value=""
                  onChange={(url) => {
                    const v = url.trim();
                    if (!v) return;
                    setEvidence((prev) =>
                      prev.includes(v) || prev.length >= 10 ? prev : [...prev, v]
                    );
                  }}
                  placeholder="https://…"
                />
              </div>
            )}
            {evidence.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {evidence.map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-lg bg-gray-950 border border-gray-800 overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                    <button
                      onClick={() =>
                        setEvidence((prev) => prev.filter((_, j) => j !== i))
                      }
                      disabled={busy}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-red-500/80 text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="url"
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addEvidence())
                }
                disabled={busy || evidence.length >= 10}
                placeholder="https://…"
                className="flex-1 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={addEvidence}
                disabled={busy || !evidenceInput.trim() || evidence.length >= 10}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={
              busy ||
              !selectedDocId ||
              reason.trim().length < 20
            }
            className="w-full py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] transition-transform"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Submit Appeal
          </button>
        </section>
      )}

      {/* History */}
      {appeals.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
            Appeal History
          </p>
          <div className="space-y-2">
            {appeals.map((a) => (
              <AppealHistoryRow key={a.id} appeal={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AppealHistoryRow({ appeal }: { appeal: AppealHistoryItem }) {
  const tone =
    appeal.status === "PENDING"
      ? "border-amber-500/30 bg-amber-500/5"
      : appeal.status === "APPROVED"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-red-500/30 bg-red-500/5";
  const statusBadge =
    appeal.status === "PENDING"
      ? "bg-amber-500/20 text-amber-400"
      : appeal.status === "APPROVED"
        ? "bg-emerald-500/20 text-emerald-400"
        : "bg-red-500/20 text-red-400";
  const StatusIcon =
    appeal.status === "PENDING"
      ? Clock
      : appeal.status === "APPROVED"
        ? CheckCircle
        : XCircle;

  return (
    <div className={cn("rounded-xl border p-3", tone)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-bold text-white">
          {appeal.kycDocument?.documentType ?? "Appeal"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
            statusBadge
          )}
        >
          <StatusIcon className="w-3 h-3" />
          {appeal.status}
        </span>
      </div>
      <p className="text-xs text-gray-300 line-clamp-3 whitespace-pre-wrap">
        {appeal.reason}
      </p>
      {appeal.adminNote && appeal.status !== "PENDING" && (
        <div className="mt-2 rounded-lg bg-gray-950/60 border border-gray-800 p-2 flex items-start gap-2">
          {appeal.status === "REJECTED" && (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Admin response
            </p>
            <p className="text-xs text-gray-200 mt-0.5">{appeal.adminNote}</p>
          </div>
        </div>
      )}
      <p className="text-[10px] text-gray-500 mt-2">
        Submitted{" "}
        {formatDistanceToNow(new Date(appeal.createdAt), {
          addSuffix: true,
        })}
        {appeal.reviewedAt &&
          ` · Reviewed ${format(new Date(appeal.reviewedAt), "PP")}`}
      </p>
    </div>
  );
}
