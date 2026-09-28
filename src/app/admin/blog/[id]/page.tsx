import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BlogEditor } from "@/components/admin/blog/blog-editor";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "landing.edit"))) redirect("/admin/blog");
  const { id } = await params;
  const [post, cats] = await Promise.all([
    prisma.blogPost.findUnique({ where: { id } }),
    prisma.blogPost.findMany({ where: { category: { not: null } }, distinct: ["category"], select: { category: true } }),
  ]);
  if (!post) notFound();
  return <BlogEditor post={post} siteUrl={SITE_URL} categories={cats.map((c) => c.category!).filter(Boolean)} />;
}
