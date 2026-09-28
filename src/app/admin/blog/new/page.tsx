import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BlogEditor } from "@/components/admin/blog/blog-editor";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

export default async function NewBlogPostPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "landing.edit"))) redirect("/admin/blog");
  const cats = await prisma.blogPost.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true } });
  return <BlogEditor post={null} siteUrl={SITE_URL} categories={cats.map((c) => c.category!).filter(Boolean)} />;
}
