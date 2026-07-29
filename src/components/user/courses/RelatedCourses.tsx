"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, Users, GraduationCap } from "lucide-react";

interface Related {
  id: string;
  slug: string | null;
  title: string;
  thumbnail: string | null;
  isFree: boolean;
  price: number;
  discountPrice: number | null;
  avgRating: number;
  enrollmentCount: number;
}

export function RelatedCourses({ related }: { related: Related[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-white">Students also bought</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {related.map((r) => {
          const href = `/courses/${r.slug ?? r.id}`;
          const live = r.discountPrice ?? r.price;
          return (
            <Link
              key={r.id}
              href={href}
              className="card card-interactive overflow-hidden group"
            >
              <div className="aspect-video bg-gray-950 relative">
                {r.thumbnail ? (
                  <Image
                    src={r.thumbnail}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700">
                    <GraduationCap className="w-10 h-10" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-white line-clamp-2 group-hover:text-indigo-200">
                  {r.title}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                  {r.avgRating > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                      {r.avgRating.toFixed(1)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3" /> {r.enrollmentCount}
                  </span>
                  <span className="ml-auto text-sm font-bold text-white">
                    {r.isFree ? "Free" : `$${live.toFixed(2)}`}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
