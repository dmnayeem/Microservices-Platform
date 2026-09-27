"use client";

import { PostsTab } from "./public-profile-view";

/**
 * Your own posts on /profile — the same square grid as a public profile.
 * This used to stack every post full-width with its image up to 384px tall,
 * so a handful of posts filled several screens.
 */
export function PostsListTab({ userId }: { userId: string }) {
  return <PostsTab userId={userId} emptyText="Your published posts will appear here." />;
}
