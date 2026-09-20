import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { parseBlocks } from "@/lib/offers";
import { OfferRenderer } from "@/components/offers/offer-renderer";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

async function loadOffer(slug: string) {
  return prisma.offer.findUnique({ where: { slug } });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const offer = await loadOffer(slug);
  if (!offer) return { title: "Offer not found" };
  return {
    title: offer.title,
    description: offer.description ?? undefined,
    openGraph: {
      title: offer.title,
      description: offer.description ?? undefined,
      images: offer.thumbnailUrl ? [{ url: offer.thumbnailUrl }] : undefined,
    },
  };
}

export default async function OfferPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const offer = await loadOffer(slug);
  if (!offer) notFound();

  // Public sees PUBLISHED only. Drafts are viewable via ?preview=1 to an admin.
  if (offer.status !== "PUBLISHED") {
    if (preview !== "1") notFound();
    const session = await getSession();
    const role = session?.user?.role as UserRole | undefined;
    if (!hasPermission(role, "offers.view")) notFound();
  }

  const blocks = parseBlocks(offer.blocks);

  return (
    <main
      className={cn(
        "min-h-screen text-(--app-ink) bg-linear-to-br",
        offer.bgGradient || "from-slate-950 via-slate-900 to-indigo-950"
      )}
    >
      {offer.status !== "PUBLISHED" && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs text-center py-1.5">
          Draft preview — not visible to the public until published.
        </div>
      )}

      <OfferRenderer blocks={blocks} />

      <footer className="py-8 text-center">
        <Link
          href="/"
          className="text-xs text-(--app-ink-3) hover:text-(--app-ink-2)"
        >
          Powered by EarnGPT
        </Link>
      </footer>
    </main>
  );
}
