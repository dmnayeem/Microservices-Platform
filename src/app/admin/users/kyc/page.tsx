import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  FileCheck,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  FileImage,
  BadgeCheck,
  Activity,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ImageZoomGallery } from "@/components/admin/image-zoom-gallery";
import { KycReviewActions } from "@/components/admin/kyc/kyc-review-actions";
import { KycAppealsList } from "@/components/admin/users/kyc-appeals-list";
import { parseDocumentImages } from "@/lib/kyc";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    tab?: string;
  }>;
}

export default async function KYCQueuePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "kyc.view"))) redirect("/admin");

  const params = await searchParams;
  const tab = (params.tab === "appeals" ? "appeals" : "kyc") as
    | "kyc"
    | "appeals";
  const statusFilter = params.status || "PENDING";

  // Stats — always fetched
  const [
    pendingCount,
    approvedCount,
    rejectedCount,
    totalVerified,
    totalUsers,
  ] = await Promise.all([
    prisma.kYCDocument.count({ where: { status: "PENDING" } }),
    prisma.kYCDocument.count({ where: { status: "APPROVED" } }),
    prisma.kYCDocument.count({ where: { status: "REJECTED" } }),
    prisma.user.count({ where: { kycStatus: "APPROVED" } }),
    prisma.user.count(),
  ]);

  const reviewRate =
    pendingCount + approvedCount + rejectedCount > 0
      ? ((approvedCount + rejectedCount) /
          (pendingCount + approvedCount + rejectedCount)) *
        100
      : 0;

  // Fetch documents for the active tab
  const kycDocumentsRaw =
    tab === "kyc"
      ? await prisma.kYCDocument.findMany({
          where: {
            status: statusFilter as
              | "NOT_SUBMITTED"
              | "PENDING"
              | "APPROVED"
              | "REJECTED",
          },
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
                createdAt: true,
                kycStatus: true,
                package: { select: { slug: true, name: true } },
                level: true,
                country: true,
                nidNumber: true,
                dateOfBirth: true,
              },
            },
          },
          take: 50,
        })
      : [];

  type KYCDocWithUser = (typeof kycDocumentsRaw)[0] & {
    user: {
      id: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string;
      avatar: string | null;
      createdAt: Date;
      kycStatus: string;
      package: { slug: string; name: string } | null;
      level: number;
      country: string | null;
      nidNumber: string | null;
      dateOfBirth: Date | null;
    };
  };
  const kycDocuments = kycDocumentsRaw as KYCDocWithUser[];

  const tabs = [
    { id: "PENDING", label: "Pending", count: pendingCount, color: "amber" },
    {
      id: "APPROVED",
      label: "Approved",
      count: approvedCount,
      color: "emerald",
    },
    { id: "REJECTED", label: "Rejected", count: rejectedCount, color: "red" },
  ];

  const canApprove = await can(session.user.id, "kyc.approve");
  const canReject = await can(session.user.id, "kyc.reject");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">
            KYC / Blue Badge Verification
          </h1>
          <p className="text-slate-400 text-sm">
            Review user identity documents and verification appeals
          </p>
        </div>
      </div>

      {/* 3 Stats Cards per spec */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-blue-500/30 bg-linear-to-br from-blue-500/10 to-blue-600/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <BadgeCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {totalVerified.toLocaleString()}
              </p>
              <p className="text-xs text-blue-300/80">Total Verified</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            of {totalUsers.toLocaleString()} users
          </p>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-linear-to-br from-yellow-500/10 to-amber-500/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {pendingCount.toLocaleString()}
              </p>
              <p className="text-xs text-yellow-300/80">Pending Review</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">awaiting your decision</p>
        </div>
        <div className="rounded-xl border border-purple-500/30 bg-linear-to-br from-purple-500/10 to-pink-500/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">
                {reviewRate.toFixed(0)}%
              </p>
              <p className="text-xs text-purple-300/80">Review Rate</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {(approvedCount + rejectedCount).toLocaleString()} reviewed
          </p>
        </div>
      </div>

      {/* Top tabs: KYC / Appeals */}
      <div className="border-b border-slate-800 flex gap-1">
        <Link
          href="/admin/users/kyc?status=PENDING"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            tab === "kyc"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          KYC Requests ({pendingCount})
        </Link>
        <Link
          href="/admin/users/kyc?tab=appeals"
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
            tab === "appeals"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Verification Appeals
        </Link>
      </div>

      {/* APPEALS TAB */}
      {tab === "appeals" && (
        <KycAppealsList
          canReview={
            await can(session.user.id, "kyc.approve") ||
            await can(session.user.id, "kyc.reject")
          }
        />
      )}

      {/* KYC TAB */}
      {tab === "kyc" && (
        <>
          {/* Status sub-tabs */}
          <div className="flex gap-3 border-b border-slate-800">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={`/admin/users/kyc?status=${t.id}`}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  statusFilter === t.id
                    ? "border-blue-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
                <span
                  className={`ml-2 px-1.5 py-0.5 text-xs rounded ${
                    statusFilter === t.id
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {t.count}
                </span>
              </Link>
            ))}
          </div>

          {/* Document list */}
          {kycDocuments.length > 0 ? (
            <div className="space-y-4">
              {kycDocuments.map((doc) => {
                const fullName =
                  [doc.user.firstName, doc.user.lastName]
                    .filter(Boolean)
                    .join(" ") ||
                  doc.user.name ||
                  doc.user.email;

                return (
                  <div
                    key={doc.id}
                    className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden"
                  >
                    <div className="p-6">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <Link href={`/admin/users/${doc.user.id}`}>
                            <div className="w-12 h-12 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium">
                              {doc.user.name?.charAt(0) ||
                                doc.user.email?.charAt(0) ||
                                "U"}
                            </div>
                          </Link>
                          <div>
                            <Link
                              href={`/admin/users/${doc.user.id}`}
                              className="text-lg font-medium text-white hover:text-indigo-400 transition-colors"
                            >
                              {fullName}
                            </Link>
                            <p className="text-sm text-slate-500">
                              {doc.user.email}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-400">
                                Lv {doc.user.level}
                              </span>
                              <span className="text-slate-600">|</span>
                              <span className="text-xs text-indigo-400">
                                {doc.user.package?.name ?? "—"}
                              </span>
                              {doc.user.country && (
                                <>
                                  <span className="text-slate-600">|</span>
                                  <span className="text-xs text-slate-400">
                                    {doc.user.country}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-400">Submitted</p>
                          <p className="text-sm text-white">
                            {formatDistanceToNow(doc.createdAt, {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Submitted Info */}
                      <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div className="space-y-2">
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                            Submitted Info
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-slate-400">Document:</span>
                            <span className="text-white">{doc.documentType}</span>
                            {doc.user.nidNumber && (
                              <>
                                <span className="text-slate-400">ID #:</span>
                                <span className="text-white font-mono text-xs">
                                  {doc.user.nidNumber}
                                </span>
                              </>
                            )}
                            {doc.user.dateOfBirth && (
                              <>
                                <span className="text-slate-400">DOB:</span>
                                <span className="text-white">
                                  {format(doc.user.dateOfBirth, "yyyy-MM-dd")}
                                </span>
                              </>
                            )}
                            <span className="text-slate-400">Member since:</span>
                            <span className="text-white">
                              {format(doc.user.createdAt, "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>

                        {/* Documents — image lightbox */}
                        <div>
                          <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">
                            Documents
                          </p>
                          <ImageZoomGallery
                            images={parseDocumentImages(doc.documentUrl)}
                            size={96}
                          />
                          <p className="text-xs text-slate-500 mt-1.5">
                            <FileImage className="w-3 h-3 inline mr-1" />
                            Click to enlarge
                          </p>
                        </div>
                      </div>

                      {/* Auto (AI) verification results */}
                      {doc.method === "AUTO" && doc.extracted && (
                        <AutoKycPanel extracted={doc.extracted} />
                      )}

                      {/* Status banner for non-pending docs */}
                      {doc.status === "APPROVED" && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">
                              Approved
                            </span>
                          </div>
                          {doc.reviewedAt && (
                            <p className="text-sm text-slate-400 mt-1">
                              Reviewed{" "}
                              {format(doc.reviewedAt, "MMM d, yyyy HH:mm")}
                            </p>
                          )}
                        </div>
                      )}
                      {doc.status === "REJECTED" && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-400" />
                            <span className="text-red-400 font-medium">
                              Rejected
                            </span>
                          </div>
                          {doc.rejectionReason && (
                            <p className="text-sm text-slate-400 mt-1">
                              Reason: {doc.rejectionReason}
                            </p>
                          )}
                          {doc.reviewedAt && (
                            <p className="text-xs text-slate-500 mt-1">
                              Reviewed{" "}
                              {format(doc.reviewedAt, "MMM d, yyyy HH:mm")}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Actions for pending documents */}
                      {doc.status === "PENDING" && (
                        <div className="pt-4 border-t border-slate-800">
                          <KycReviewActions
                            documentId={doc.id}
                            userName={fullName}
                            canApprove={canApprove}
                            canReject={canReject}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-16 text-center">
              <FileCheck className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <h3 className="text-lg font-medium text-white mb-2">
                {statusFilter === "PENDING"
                  ? "No pending verifications"
                  : `No ${statusFilter.toLowerCase()} documents`}
              </h3>
              <p className="text-slate-400 text-sm">
                {statusFilter === "PENDING"
                  ? "All KYC submissions have been reviewed!"
                  : `There are no ${statusFilter.toLowerCase()} KYC documents to show.`}
              </p>
            </div>
          )}
        </>
      )}

      {/* Calendar import is unused — keep as decorative */}
      <Calendar className="hidden" />
    </div>
  );
}

/**
 * One extracted KYC field.
 *
 * Defined at module scope, not inside `AutoKycPanel`. A component declared in
 * another component's body gets a new function identity on every render, so
 * React tears down and rebuilds its whole subtree each time — seven of them on
 * this panel — losing DOM state and re-running effects for no reason. It closes
 * over nothing, so hoisting it is free.
 */
function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={"text-white truncate " + (mono ? "font-mono text-xs" : "text-sm")}>
        {value && value.trim() ? value : "—"}
      </p>
    </div>
  );
}

function AutoKycPanel({ extracted }: { extracted: unknown }) {
  const e = (extracted ?? {}) as {
    fullName?: string;
    fullNameEnglish?: string;
    dateOfBirth?: string;
    idNumber?: string;
    expiry?: string;
    fatherName?: string;
    motherName?: string;
    address?: string;
    bloodGroup?: string;
    ocrConfidence?: number;
    faceSimilarity?: number;
    faceMatched?: boolean;
    decision?: string;
    reasons?: string[];
  };
  const sim = typeof e.faceSimilarity === "number" ? e.faceSimilarity : null;
  const conf =
    typeof e.ocrConfidence === "number" ? Math.round(e.ocrConfidence * 100) : null;

  // Decision pill tone.
  const decision = (e.decision ?? "").toUpperCase();
  const pill =
    decision === "APPROVED"
      ? { label: "Auto-approved", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
      : decision === "REJECT" || decision === "REJECTED"
      ? { label: "Auto-rejected", cls: "bg-red-500/15 text-red-300 border-red-500/30" }
      : { label: "Needs review", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };

  const chip = (label: string, value: string, ok: boolean | null) => (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold " +
        (ok == null
          ? "border-slate-700 bg-slate-800/60 text-slate-400"
          : ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300")
      }
    >
      <span className="text-slate-500 font-normal">{label}</span> {value}
    </span>
  );

  return (
    <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
          <Sparkles className="w-3 h-3" /> Auto (AI)
        </span>
        <span className={"rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " + pill.cls}>
          {pill.label}
        </span>
        <span className="text-xs text-slate-400">
          AI-extracted — verify against the images before approving.
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Name</p>
          <p className="text-white truncate text-sm">
            {e.fullName && e.fullName.trim() ? e.fullName : "—"}
          </p>
          {e.fullNameEnglish && e.fullNameEnglish.trim() && (
            <p className="text-[11px] text-slate-400 truncate">{e.fullNameEnglish}</p>
          )}
        </div>
        <Field label="DOB" value={e.dateOfBirth} />
        <Field label="ID #" value={e.idNumber} mono />
        <Field label="Expiry" value={e.expiry} />
        <Field label="Father" value={e.fatherName} />
        <Field label="Mother" value={e.motherName} />
        <Field label="Blood" value={e.bloodGroup} />
        <Field label="Address" value={e.address} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chip("Face match:", sim != null ? `${sim}%` : "n/a", sim == null ? null : sim >= 88)}
        {chip("OCR confidence:", conf != null ? `${conf}%` : "n/a", conf == null ? null : conf >= 70)}
      </div>

      {Array.isArray(e.reasons) && e.reasons.length > 0 && (
        <ul className="space-y-1 pt-0.5">
          {e.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-400" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
