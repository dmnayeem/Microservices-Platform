import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BecomeTutorForm } from "./_components/BecomeTutorForm";
import { GraduationCap, ArrowLeft, Shield, Clock, XCircle } from "lucide-react";
import Link from "next/link";

export default async function BecomeTutorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, latest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, name: true, email: true },
    }),
    prisma.tutorApplication.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!user) redirect("/login");

  // Tutors and admins shouldn't apply
  if (user.role === "TUTOR") {
    redirect("/tutor/dashboard");
  }
  if (user.role !== "USER") {
    redirect("/profile");
  }

  const hasPending = latest?.status === "PENDING";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-xs text-(--app-ink-3) hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to profile
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2 inline-flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-(--app-accent-ink)" />
          Become a tutor
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Tell us what you&apos;d teach. Admins review applications before approving.
          Once approved, you can build and publish courses and earn from each
          enrollment.
        </p>
      </div>

      <div className="bg-(--app-cta)/5 border border-(--app-accent-edge)/30 rounded-xl p-4 text-sm text-(--app-accent-ink)/90 space-y-2">
        <p className="font-bold flex items-center gap-2">
          <Shield className="w-4 h-4 text-(--app-accent-ink)" />
          How it works
        </p>
        <ul className="list-disc list-inside text-xs space-y-1 text-(--app-accent-ink)/80">
          <li>Submit this short application — bio, expertise, a sample course outline.</li>
          <li>Admins review it (usually within a few business days).</li>
          <li>On approval your account becomes a Tutor and unlocks the tutor dashboard.</li>
          <li>You earn the platform commission split on every enrollment (defaults to 80% tutor / 20% platform).</li>
        </ul>
      </div>

      {hasPending ? (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-300 mt-0.5" />
            <div>
              <p className="text-white font-bold">Your application is pending</p>
              <p className="text-amber-100/80 text-sm mt-1">
                Submitted{" "}
                {new Date(latest!.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                . You&apos;ll get a notification when an admin reviews it. You
                can&apos;t submit a new one while this is pending.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {latest?.status === "REJECTED" && (
            <div className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-rose-300 mt-0.5" />
                <div>
                  <p className="text-white font-bold">Previous application was not approved</p>
                  {latest.adminNote && (
                    <p className="text-rose-100/80 text-sm mt-1">
                      Reviewer note: {latest.adminNote}
                    </p>
                  )}
                  <p className="text-rose-100/70 text-xs mt-1">
                    You can re-apply below — address the reviewer&apos;s feedback if any.
                  </p>
                </div>
              </div>
            </div>
          )}
          <BecomeTutorForm />
        </>
      )}
    </div>
  );
}
