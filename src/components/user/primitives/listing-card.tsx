import { cn } from "@/lib/utils";
import { Star, Coins } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SmartImage } from "./smart-image";
import { Avatar } from "./avatar";

interface ListingCardProps {
  id?: string;
  href?: string;
  image?: string;
  title: string;
  sellerName?: string;
  sellerAvatar?: string;
  price: number;
  unit?: "pts" | "USD";
  rating?: number;
  reviewCount?: number;
  category?: string;
  badge?: string;
  className?: string;
}

export function ListingCard({
  href,
  image,
  title,
  sellerName,
  sellerAvatar,
  price,
  unit = "pts",
  rating,
  reviewCount,
  category,
  badge,
  className,
}: ListingCardProps) {
  const cls = cn(
    "block group rounded-xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-gray-700 transition-colors",
    className
  );

  const inner: ReactNode = (
    <>
      <div className="relative aspect-square bg-gray-800">
        {image ? (
          <SmartImage
            src={image}
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-gray-800 to-gray-900 flex items-center justify-center text-gray-600 text-sm">
            No image
          </div>
        )}
        {badge && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold uppercase">
            {badge}
          </span>
        )}
        {category && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-white text-[10px] font-medium">
            {category}
          </span>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug min-h-[2.5em]">
          {title}
        </h3>
        {sellerName && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Avatar
              src={sellerAvatar}
              alt={sellerName}
              size={16}
              fallbackStyle="solid-gray"
            />
            <span className="truncate">{sellerName}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-0.5 text-amber-400 font-bold text-sm tabular-nums">
            {unit === "pts" ? (
              <>
                <Coins className="w-3.5 h-3.5" />
                {price.toLocaleString()}
              </>
            ) : (
              <>${price.toFixed(2)}</>
            )}
          </span>
          {rating !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)}
              {reviewCount !== undefined && (
                <span className="text-gray-500">({reviewCount})</span>
              )}
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
