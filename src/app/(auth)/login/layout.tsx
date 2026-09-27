import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";

// The page is a client component, so its metadata lives here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Log In",
    description: "Log in to your RevType account to complete tasks, track your earnings and withdraw.",
    path: "/login",
  });
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
