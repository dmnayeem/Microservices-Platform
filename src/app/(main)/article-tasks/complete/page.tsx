import { Suspense } from "react";
import ArticleTaskCompleteClient from "./_components/ArticleTaskCompleteClient";

/**
 * /article-tasks/complete?task=...&key=...&eg=...
 *
 * Landing page that the article-task embed redirects to from the final
 * article page. Reads the key + token from the URL and auto-submits to
 * /api/tasks/:id/submit. Shows a success / error state and a link back to
 * the dashboard.
 */
export default function ArticleTaskCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-sm text-(--app-ink-3)">Loading…</div>
      }
    >
      <ArticleTaskCompleteClient />
    </Suspense>
  );
}
