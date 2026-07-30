import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Award, ArrowLeft } from "lucide-react";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const cert = await prisma.courseCertificate.findUnique({
    where: { serial },
    include: {
      course: { select: { id: true, slug: true, title: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!cert) notFound();

  return (
    <div className="max-w-2xl mx-auto py-12 space-y-6">
      <Link
        href="/my-learning?tab=certificates"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to my learning
      </Link>

      <div className="rounded-3xl border-4 border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-emerald-500/5 to-indigo-500/10 p-10 text-center space-y-4">
        <Award className="w-16 h-16 text-amber-300 mx-auto" />
        <p className="text-sm font-bold text-amber-300 uppercase tracking-widest">
          Certificate of Completion
        </p>
        <p className="text-base text-gray-300">This certifies that</p>
        <p className="text-3xl font-extrabold text-white">
          {cert.user.name ?? cert.user.email}
        </p>
        <p className="text-base text-gray-300">has successfully completed</p>
        <p className="text-2xl font-bold text-amber-200">
          {cert.course.title}
        </p>
        <p className="text-sm text-gray-400 pt-4">
          Issued{" "}
          {new Date(cert.issuedAt).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <p className="text-[10px] text-gray-500 font-mono pt-2">
          Serial: {cert.serial}
        </p>
      </div>

      <div className="text-center">
        <a
          href={cert.pdfUrl ?? `/cert-print/${cert.serial}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold"
        >
          <Award className="w-4 h-4" />
          Download PDF
        </a>
      </div>
    </div>
  );
}
