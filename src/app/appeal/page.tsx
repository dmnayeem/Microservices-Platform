import Link from "next/link";
import type { Metadata } from "next";
import { ShieldAlert, Clock, XCircle, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAppealToken } from "@/lib/fraud-risk";
import { AppealForm } from "./appeal-form";

export const metadata: Metadata = { title: "Appeal a suspension", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a suspended user asks to be let back in. Reached from the login screen
 * (after a correct password) or the suspension email, both carrying a signed
 * link — a suspended account cannot sign in, so the link is the identity.
 */
export default async function AppealPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const userId = verifyAppealToken(t) ?? (await auth())?.user?.id ?? null;

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          status: true,
          fraudRisk: true,
          suspendedReason: true,
          suspendedAt: true,
          suspensionAppeals: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, adminNote: true, createdAt: true, reviewedAt: true },
          },
        },
      })
    : null;
  const last =
    (user as unknown as {
      suspensionAppeals?: Array<{ status: string; adminNote: string | null }>;
    } | null)?.suspensionAppeals?.[0] ?? null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-(--app-page)">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 ring-1 ring-red-500/25 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Account suspended</h1>
        </div>

        {!user ? (
          <Box>
            <p className="text-sm text-(--app-ink-2)">
              This appeal link has expired or is not valid. Sign in again with your email and password to get a new one.
            </p>
            <Back />
          </Box>
        ) : user.status !== "SUSPENDED" ? (
          <Box>
            <p className="text-sm text-(--app-ink-2) inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> This account is not suspended. You can sign in.
            </p>
            <Back />
          </Box>
        ) : (
          <>
            <Box>
              <p className="text-xs uppercase tracking-wider font-bold text-(--app-ink-3)">Reason</p>
              <p className="text-sm text-(--app-ink-2) mt-1">
                {user.suspendedReason ?? "Your account was suspended by an administrator."}
              </p>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-(--app-ink-3)">
                  <span>Fraud risk</span>
                  <span className="tabular-nums font-semibold text-red-300">{user.fraudRisk}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-(--app-line) overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${user.fraudRisk}%` }} />
                </div>
              </div>
            </Box>

            {last?.status === "PENDING" ? (
              <Box>
                <p className="text-sm text-(--app-ink-2) inline-flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  Your appeal is waiting for review. You will get an email when an admin decides.
                </p>
              </Box>
            ) : (
              <>
                {last?.status === "REJECTED" && (
                  <Box>
                    <p className="text-sm text-(--app-ink-2) inline-flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      Your last appeal was declined{last.adminNote ? `: ${last.adminNote}` : "."} You can appeal again
                      with more detail.
                    </p>
                  </Box>
                )}
                <AppealForm token={t ?? null} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-5">{children}</div>;
}

function Back() {
  return (
    <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-(--app-accent,#60a5fa) hover:underline">
      Back to sign in
    </Link>
  );
}
