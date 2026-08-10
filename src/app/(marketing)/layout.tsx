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
    <main className="relative min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <div className="relative z-10">
        <Navbar {...content.navbar} />
        <div className="pt-16 lg:pt-20">{children}</div>
        <Footer {...content.footer} />
      </div>
    </main>
  );
}
