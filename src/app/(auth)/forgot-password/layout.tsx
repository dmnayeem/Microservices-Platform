import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";

// The page is a client component, so its metadata lives here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Forgot Password",
    description: "Reset your RevType password.",
    path: "/forgot-password",
    noindex: true,
  });
}

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
