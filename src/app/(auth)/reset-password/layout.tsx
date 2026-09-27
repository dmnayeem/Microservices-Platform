import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";

// The page is a client component, so its metadata lives here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Reset Password",
    description: "Choose a new password for your EarnGPT account.",
    path: "/reset-password",
    noindex: true,
  });
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
