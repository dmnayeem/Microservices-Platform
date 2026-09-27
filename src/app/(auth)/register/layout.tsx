import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";

// The page is a client component, so its metadata lives here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Create a Free Account — Start Earning Online",
    description: "Join RevType free: complete simple online tasks, invite friends and cash out. Sign up with email or Google in under a minute.",
    path: "/register",
  });
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
