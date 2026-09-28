import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BLOG_TAG } from "@/lib/blog";

/** The blog is marketing content: the landing-page permissions cover it. */
export async function blogGuard(write: boolean): Promise<{ userId: string } | { status: 401 | 403 }> {
  const session = await auth();
  if (!session?.user?.id) return { status: 401 };
  if (!(await can(session.user.id, write ? "landing.edit" : "landing.view"))) return { status: 403 };
  return { userId: session.user.id };
}

/** After any change: the article list, the article, the sitemap and llms.txt. */
export function refreshBlog(slugs: string[] = []) {
  revalidateTag(BLOG_TAG, "max");
  revalidatePath("/blog");
  for (const s of slugs) revalidatePath(`/blog/${s}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}
