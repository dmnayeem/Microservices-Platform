import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
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
  // A draft says nothing about itself — its title would otherwise leak to
  // anyone (or any unfurler) holding the address before it is published.
  if (!offer || offer.status !== "PUBLISHED") {
    return { title: { absolute: "Offer not found · RevType" }, robots: { index: false, follow: false } };
  }
  return pageMeta({
    title: offer.title,
    description: offer.description ?? undefined,
    // Its own address — without it the page inherited no canonical at all.
    path: `/offer/${slug}`,
    image: offer.thumbnailUrl ?? null,
    imageAlt: offer.title,
    cardKicker: "Offer",
  });
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
        offer.bgGradient || "from-(--app-page) via-(--app-surface) to-(--app-surface-2)"
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
          Powered by RevType
        </Link>
      </footer>
    </main>
  );
}
