"use client";

import Image from "next/image";
import { Star, Users, Globe } from "lucide-react";
import { Avatar } from "@/components/user/primitives/avatar";

interface Props {
  course: {
    title: string;
    subtitle: string | null;
    bannerUrl: string | null;
    thumbnail: string | null;
    category: string;
    skillLevel: string;
    language: string;
    avgRating: number;
    totalReviews: number;
    enrollmentCount: number;
  };
  tutor: {
    id: string;
    name: string | null;
    avatar: string | null;
  } | null;
  livePrice: number;
}

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export function CourseLandingHero({ course, tutor }: Props) {
  const bg = course.bannerUrl || course.thumbnail;
  return (
    <section className="card relative overflow-hidden">
      {bg && (
        <div className="absolute inset-0">
          <Image
            src={bg}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-30 blur-sm"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/40 via-gray-950/60 to-gray-950/95" />
        </div>
      )}
      <div className="relative p-6 md:p-10 max-w-3xl">
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 font-bold">
            {course.category}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-bold">
            {LEVEL_LABEL[course.skillLevel] ?? course.skillLevel}
          </span>
        </div>
        <h1 className="text-2xl md:text-4xl font-extrabold text-white mt-3 leading-tight">
          {course.title}
        </h1>
        {course.subtitle && (
          <p className="text-base md:text-lg text-gray-300 mt-2">
            {course.subtitle}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-300">
          {course.avgRating > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
              <span className="font-bold text-amber-300 tabular-nums">
                {course.avgRating.toFixed(2)}
              </span>
              <span className="text-gray-500">({course.totalReviews})</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="w-4 h-4 text-emerald-300" />
            {course.enrollmentCount.toLocaleString()} students
          </span>
          <span className="inline-flex items-center gap-1">
            <Globe className="w-4 h-4 text-fuchsia-300" />
            {course.language.toUpperCase()}
          </span>
          {tutor && (
            <span className="inline-flex items-center gap-2">
              {tutor.avatar ? (
                <Avatar src={tutor.avatar} size={20} className="inline-block" />
              ) : null}
              <span className="text-gray-400">
                by <span className="text-white font-bold">{tutor.name}</span>
              </span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
