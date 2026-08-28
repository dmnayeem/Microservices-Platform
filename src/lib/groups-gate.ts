import "server-only";
import { NextResponse } from "next/server";
import { getUiToggles } from "@/lib/ui-toggles-server";

/**
 * The Groups feature switch, enforced on the server.
 *
 * Hiding the tab is not turning a feature off. Groups reaches the database
 * through six API handlers across five route files, and every one of them is
 * reachable by anyone who has a group URL or a saved request — so a UI-only
 * hide leaves the feature fully working for exactly the people most likely to
 * poke at it.
 *
 * Shaped like `enforceDbRateLimit`, which these routes already use, so the call
 * site reads the same way:
 *
 *     const off = await groupsDisabled();
 *     if (off) return off;
 *
 * Returns a 403 when the feature is off, or `null` to continue.
 */
export async function groupsDisabled(): Promise<NextResponse | null> {
  const { groupsEnabled } = await getUiToggles();
  if (groupsEnabled) return null;
  return NextResponse.json(
    { error: "Groups are currently unavailable." },
    { status: 403 }
  );
}

/** The same check for pages and server components, which redirect instead. */
export async function isGroupsEnabled(): Promise<boolean> {
  const { groupsEnabled } = await getUiToggles();
  return groupsEnabled;
}
