import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FileText } from "lucide-react";
import { BlogList } from "@/components/admin/blog/blog-list";
import { builtInArticles } from "@/lib/blog";

export default async function BlogAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "landing.view"))) redirect("/admin");
  const canEdit = await can(session.user.id, "landing.edit");

  const rows = await prisma.blogPost.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, slug: true, title: true, status: true, publishedAt: true, updatedAt: true, views: true, category: true, focusKeyword: true, coverImage: true },
  });
  const have = new Set(rows.map((r) => r.slug));
  const builtInsMissing = builtInArticles().filter((a) => !have.has(a.slug)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <FileText className="w-6 h-6 text-sky-400" />
          Blog
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Write, schedule and optimise articles for search. Published articles appear at /blog, in the sitemap and in llms.txt.
        </p>
      </div>
      <BlogList rows={rows} canEdit={canEdit} builtInsMissing={builtInsMissing} />
    </div>
  );
}
