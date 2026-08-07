import { Navbar, Footer } from "@/components/landing";
import { getLandingContent } from "@/lib/landing-content-server";

// Shared chrome for public marketing pages (About, Careers, Blog, Press, Help,
// Contact, Status) — the exact landing gradient shell + content-driven Navbar
// and Footer, so every page reads as one consistent, premium brand. Content is
// pushed below the fixed navbar with top padding.
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = await getLandingContent();
  return (
    <main className="relative min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-indigo-950 overflow-x-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full bg-blue-500/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 rounded-full bg-purple-500/20 blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl animate-pulse [animation-delay:0.5s]" />
      </div>
      <div className="relative z-10">
        <Navbar {...content.navbar} />
        <div className="pt-16 lg:pt-20">{children}</div>
        <Footer {...content.footer} />
      </div>
    </main>
  );
}
