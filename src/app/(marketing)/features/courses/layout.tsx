import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd } from "@/lib/seo/breadcrumbs";

// Breadcrumb structured data only — the page owns its content and metadata.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Courses feature", path: "/features/courses" }])} />
      {children}
    </>
  );
}
