import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AutoPrint } from "./auto-print";

export default async function CertificatePrintPage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const cert = await prisma.courseCertificate.findUnique({
    where: { serial },
    include: {
      course: { select: { title: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!cert) notFound();

  // This page is paper, not app chrome: it forces a white ground so the print
  // output is right, and its greys are read against that white in both themes.
  // They are deliberately not on the theme tokens.
  return (
    <div className="fixed inset-0 z-100 bg-white text-(--app-on-bright) overflow-auto flex items-center justify-center p-6 print:p-0">
      <AutoPrint />
      <style>{`@media print { @page { margin: 0; size: landscape; } }`}</style>
      <div className="w-full max-w-3xl border-[10px] border-amber-500/70 rounded-2xl px-12 py-14 text-center">
        <p className="tracking-[0.3em] text-amber-700 font-bold text-sm uppercase">
          Certificate of Completion
        </p>
        <p className="text-[#475569] mt-7">This certifies that</p>
        <p className="text-4xl font-extrabold my-2">
          {cert.user.name ?? cert.user.email}
        </p>
        <p className="text-[#475569]">has successfully completed</p>
        <p className="text-2xl font-bold text-amber-700 my-2 mb-7">
          {cert.course.title}
        </p>
        <p className="text-[#64748b] text-sm">
          Issued{" "}
          {new Date(cert.issuedAt).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <p className="text-[#64748b] text-[11px] font-mono mt-2">Serial: {cert.serial}</p>
      </div>
    </div>
  );
}
