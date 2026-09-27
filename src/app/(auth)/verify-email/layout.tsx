import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";

// The page is a client component, so its metadata lives here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Verify Your Email",
    description: "Confirm your email address to finish setting up your account.",
    path: "/verify-email",
    noindex: true,
  });
}

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
