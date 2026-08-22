"use client";

import { PenSquare } from "lucide-react";
import { SocialTasksView } from "@/components/user/tasks/social-tasks-view";

/**
 * Post-creation social tasks — write a pin, a post, a tweet, a review.
 *
 * This page used to fetch `type=SOCIAL_POST`, which is not a value in the
 * `TaskType` enum, so it rendered an empty list no matter what the admin
 * created. Post-creation tasks are ordinary SOCIAL tasks; what separates them is
 * the *action* (CREATE_PIN, CREATE_POST, POST_TWEET…), which lives inside the
 * task's socialConfig. `kind=create` filters on exactly that, and the run page
 * at /social-tasks/[id] owns the actual submission flow.
 */
export function SocialPostsView() {
  return (
    <SocialTasksView
      kind="create"
      heading="Social Posts"
      subheading="Create a post with a ready-made recipe — copy each field, publish, earn."
      icon={<PenSquare className="w-6 h-6 text-pink-400" />}
    />
  );
}
