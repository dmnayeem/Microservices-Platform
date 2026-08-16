import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, Calendar, Eye, ShoppingCart, DollarSign, Tag, FileText, Image as ImageIcon, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { Avatar } from "@/components/user/primitives/avatar";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { ListingActions } from "./_components/ListingActions";
import { SmartImage } from "@/components/user/primitives/smart-image";
import type { MediaMeta } from "@/lib/media-metadata";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "text-emerald-400 bg-emerald-500/10" },
  SOLD: { label: "Sold", color: "text-blue-400 bg-blue-500/10" },
  CANCELLED: { label: "Cancelled", color: "text-red-400 bg-red-500/10" },
  EXPIRED: { label: "Expired", color: "text-gray-400 bg-gray-500/10" },
  PENDING_REVIEW: { label: "Pending review", color: "text-amber-400 bg-amber-500/10" },
  REJECTED: { label: "Rejected", color: "text-rose-400 bg-rose-500/10" },
};

export default async function MarketplaceDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "marketplace.view")) {
    redirect("/admin");
  }

  const { id } = await params;

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          createdAt: true,
          kycStatus: true,
        },
      },
      purchases: {
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!listing) {
    notFound();
  }

  // Type assertion for Prisma Accelerate
  type ListingWithRelations = typeof listing & {
    isFeatured?: boolean;
    isPromoted?: boolean;
    auctionMode?: boolean;
    auctionEndsAt?: Date | null;
    seller: {
      id: string;
      name: string | null;
      email: string;
      avatar: string | null;
      createdAt: Date;
      kycStatus: string;
    };
    purchases: Array<{
      id: string;
      amount: number;
      fee: number;
      sellerAmount: number;
      status: string;
      createdAt: Date;
      buyer: { id: string; name: string | null; email: string; avatar: string | null };
    }>;
  };
  const typedListing = listing as ListingWithRelations;

  const statusConfig = STATUS_CONFIG[typedListing.status] || STATUS_CONFIG.ACTIVE;
  const canManage = hasPermission(adminRole, "marketplace.manage");

  // Calculate earnings
  const totalEarnings = typedListing.purchases.reduce((sum, p) => sum + p.amount, 0);
  const totalFees = typedListing.purchases.reduce((sum, p) => sum + p.fee, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/marketplace"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{typedListing.title}</h1>
          <p className="text-gray-400">Listing ID: {typedListing.id}</p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Description</h2>
            <p className="text-gray-400 whitespace-pre-wrap">{typedListing.description}</p>
          </div>

          {/* Images */}
          {typedListing.images.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Images ({typedListing.images.length})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {typedListing.images.map((image, index) => (
                  <div
                    key={index}
                    className="relative aspect-square bg-gray-800 rounded-lg overflow-hidden"
                  >
                    <SmartImage
                      src={image}
                      alt={`Image ${index + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {typedListing.files.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Files ({typedListing.files.length})
              </h2>
              <div className="space-y-2">
                {typedListing.files.map((file, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-800/50 rounded-lg flex items-center gap-3"
                  >
                    <FileText className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-300 truncate flex-1">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded-file micro-data (stock media) — helps judge original vs
              downloaded/edited. */}
          {typedListing.fileMeta ? (
            <FileMetaPanel
              meta={typedListing.fileMeta as unknown as MediaMeta}
              downloadUrl={typedListing.files[0]}
            />
          ) : null}

          {/* Purchase History */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Purchase History ({typedListing.purchases.length})
            </h2>
            {typedListing.purchases.length > 0 ? (
              <div className="space-y-3">
                {typedListing.purchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="p-4 bg-gray-800/50 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={purchase.buyer.avatar}
                        name={purchase.buyer.name || purchase.buyer.email}
                        size={40}
                      />
                      <div>
                        <Link
                          href={`/admin/users/${purchase.buyer.id}`}
                          className="font-medium text-white hover:text-indigo-400"
                        >
                          {purchase.buyer.name || purchase.buyer.email}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(purchase.createdAt))} ago
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">${purchase.amount.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">Fee: ${purchase.fee.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No purchases yet</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Listing Info */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Listing Details</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Price</p>
                  <p className="font-semibold text-white">${typedListing.price.toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Tag className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Category</p>
                  <p className="text-white">{typedListing.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Eye className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Views</p>
                  <p className="text-white">{typedListing.views.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <ShoppingCart className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sales</p>
                  <p className="text-white">{typedListing.purchases.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Calendar className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-white text-sm">
                    {format(new Date(typedListing.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            </div>

            {/* Revenue Summary */}
            {typedListing.purchases.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-800">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Revenue</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Sales</span>
                    <span className="text-white">${totalEarnings.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Platform Fees</span>
                    <span className="text-white">${totalFees.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-800">
                    <span className="text-gray-400">Seller Earnings</span>
                    <span className="text-emerald-400">${(totalEarnings - totalFees).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Seller Info */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Seller</h2>
            <div className="flex items-center gap-3 mb-4">
              <Avatar
                src={typedListing.seller.avatar}
                name={typedListing.seller.name || typedListing.seller.email}
                size={48}
              />
              <div>
                <Link
                  href={`/admin/users/${typedListing.seller.id}`}
                  className="font-medium text-white hover:text-indigo-400"
                >
                  {typedListing.seller.name || "Unnamed"}
                </Link>
                <p className="text-xs text-gray-500">{typedListing.seller.email}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Member Since</span>
                <span className="text-white">
                  {format(new Date(typedListing.seller.createdAt), "MMM yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">KYC Status</span>
                <span
                  className={`${
                    typedListing.seller.kycStatus === "APPROVED"
                      ? "text-emerald-400"
                      : typedListing.seller.kycStatus === "PENDING"
                      ? "text-amber-400"
                      : "text-gray-400"
                  }`}
                >
                  {typedListing.seller.kycStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {canManage && (
            <ListingActions
              listingId={typedListing.id}
              listingTitle={typedListing.title}
              isFeatured={typedListing.isFeatured ?? false}
              isPromoted={typedListing.isPromoted ?? false}
              isAuction={typedListing.auctionMode ?? false}
              isActive={typedListing.status === "ACTIVE"}
              status={typedListing.status}
              auctionEndsAt={typedListing.auctionEndsAt ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-white text-right break-all">{value}</span>
    </div>
  );
}

/** Admin-only panel showing the extracted micro-data + originality hints for a
 *  stock-media deliverable, with a download link to inspect the actual file. */
function FileMetaPanel({
  meta,
  downloadUrl,
}: {
  meta: MediaMeta;
  downloadUrl?: string;
}) {
  const suspicious =
    (meta.kind === "image" && !meta.hints?.hasCameraExif) ||
    meta.hints?.hasEditorSoftwareTag ||
    meta.hints?.reEncoded ||
    !!meta.hints?.duplicateOf;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          {suspicious ? (
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          )}
          Uploaded file — micro-data
        </h2>
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        )}
      </div>

      {/* Originality hints */}
      <div
        className={`mb-4 p-3 rounded-lg border text-sm ${
          suspicious
            ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
        }`}
      >
        <ul className="space-y-1">
          {meta.kind === "image" && (
            <li>
              {meta.hints?.hasCameraExif ? "✓" : "⚠"} Camera EXIF{" "}
              {meta.hints?.hasCameraExif ? "present (likely an original capture)" : "missing (screenshot/export/download?)"}
            </li>
          )}
          {meta.hints?.hasEditorSoftwareTag && (
            <li>⚠ Edited in image software (editor tag in metadata)</li>
          )}
          {meta.hints?.reEncoded && (
            <li>⚠ Re-encoded (encoder looks like ffmpeg/HandBrake)</li>
          )}
          {meta.hints?.duplicateOf && (
            <li>
              ⚠ Perceptual near-duplicate of another listing (
              <Link
                href={`/admin/marketplace/${meta.hints.duplicateOf}`}
                className="underline"
              >
                view
              </Link>
              )
            </li>
          )}
          {meta.hints?.note && <li className="text-gray-300">{meta.hints.note}</li>}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Row label="File size" value={`${(meta.sizeBytes / 1024 / 1024).toFixed(2)} MB`} />
        <Row label="SHA-256" value={meta.sha256?.slice(0, 24) + "…"} />
        {meta.image && (
          <>
            <Row label="Dimensions" value={meta.image.width && meta.image.height ? `${meta.image.width}×${meta.image.height}` : undefined} />
            <Row label="Camera" value={[meta.image.exif?.make, meta.image.exif?.model].filter(Boolean).join(" ") || undefined} />
            <Row label="Lens" value={meta.image.exif?.lens} />
            <Row label="Software" value={meta.image.exif?.software} />
            <Row label="Captured" value={meta.image.exif?.dateTaken} />
            <Row label="Perceptual hash" value={meta.image.pHash ? meta.image.pHash.slice(0, 20) + "…" : undefined} />
          </>
        )}
        {meta.audio && (
          <>
            <Row label="Container" value={meta.audio.container} />
            <Row label="Codec" value={meta.audio.codec} />
            <Row label="Duration" value={meta.audio.durationSec ? `${Math.round(meta.audio.durationSec)}s` : undefined} />
            <Row label="Bitrate" value={meta.audio.bitrate ? `${Math.round(meta.audio.bitrate / 1000)} kbps` : undefined} />
            <Row label="Sample rate" value={meta.audio.sampleRate ? `${meta.audio.sampleRate} Hz` : undefined} />
            <Row label="Encoder" value={meta.audio.encoder} />
            <Row label="Title tag" value={meta.audio.title} />
            <Row label="Artist tag" value={meta.audio.artist} />
          </>
        )}
        {meta.video && (
          <>
            <Row label="Container" value={meta.video.container} />
            <Row label="Codec" value={meta.video.codec} />
            <Row label="Duration" value={meta.video.durationSec ? `${Math.round(meta.video.durationSec)}s` : undefined} />
            <Row label="Encoder" value={meta.video.encoder} />
          </>
        )}
        {meta.document && (
          <>
            <Row label="Format" value={meta.document.format} />
            <Row label="Pages" value={meta.document.pageCount} />
            <Row label="Producer" value={meta.document.producer} />
            <Row label="Creator" value={meta.document.creator} />
            <Row label="Created" value={meta.document.createdDate} />
          </>
        )}
      </div>
    </div>
  );
}
