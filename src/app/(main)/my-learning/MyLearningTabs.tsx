"use client";

import { useRouter } from "next/navigation";
import { FilterChips } from "@/components/user/primitives/filter-chips";

interface MyLearningTabsProps {
  active: string;
  options: { value: string; label: string }[];
}

/**
 * Client wrapper so the my-learning tab bar can use the shared FilterChips
 * primitive while still driving the server component via the `?tab=` URL param
 * (router.push re-runs the page's data loading for the selected tab).
 */
export function MyLearningTabs({ active, options }: MyLearningTabsProps) {
  const router = useRouter();
  return (
    <FilterChips
      variant="underline"
      value={active}
      options={options}
      onChange={(next) => router.push(`/my-learning?tab=${next}`)}
    />
  );
}
