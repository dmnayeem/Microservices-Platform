import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig, REFERRAL_COOKIE } from "@/lib/auth/config";
import { publicHost } from "@/lib/public-origin";
import { isNoindexPath } from "@/lib/seo/indexing-policy";

/**
 * Auth middleware, plus the two things `authorized()` cannot do by itself.
 *
 * `authorized()` in `lib/auth/config.ts` used to build a pass-through response
 * — `NextResponse.next({ request: { headers } })` carrying `x-pathname`, with a
 * referral cookie set on it — and return it. Auth.js only reads that return
 * value as an ALLOW / DENY / redirect decision: a plain `next()` response is
 * treated as "allowed" and then thrown away. Nothing it carried ever reached
 * the app.
 *
 * That was silently costing two things:
 *
 *   1. The admin layout's central route guard reads `x-pathname` to block a
 *      direct hit on a module the admin cannot access. The header was never
 *      delivered, so the guard read "" and did nothing — every page was relying
 *      on its own check.
 *   2. `?ref=CODE` was never persisted to a cookie. Referral links land on
 *      `/register?ref=CODE`, but a Google signup leaves the site and comes back
 *      on a different URL, so the query string is gone by the time the account
 *      is created. The cookie is the only thing that survives that round trip —
 *      which means every Google referral has been losing its attribution.
 *      Verified before this change: `/register?ref=…` returned no `Set-Cookie`
 *      at all.
 *
 * Both are fixed the same way: do it HERE, where the response we return is the
 * response the browser gets. Auth.js still owns the decision — if it wants to
 * redirect or block, that answer is passed straight through untouched, and the
 * additions below only ride on a request that was already allowed.
 */

const { auth: authMiddleware } = NextAuth(authConfig);

function isPassThrough(res: Response | undefined): boolean {
  // Auth.js signals "allowed, carry on" with a 200 that has no rewrite/redirect
  // target. A redirect (3xx) is a decision we must not touch.
  if (!res) return true;
  if (res.status >= 300 && res.status < 400) return false;
  return true;
}

export default async function middleware(
  request: NextRequest,
  event: NextFetchEvent
) {
  // One host. www and the bare domain both served the site, so a visitor (or
  // an installed app) on www started Google sign-in there while Auth.js sends
  // the callback to the bare domain — the sign-in cookies never matched. 308
  // keeps the method and body, so a postback that hits www still arrives.
  const host = publicHost(request);
  if (host.startsWith("www.")) {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      `https://${host.slice(4)}`
    );
    return NextResponse.redirect(target, 308);
  }

  // `auth` is overloaded (route handler / middleware / server action), so its
  // public type does not describe the (request, event) middleware call Next
  // makes. Cast at the boundary rather than reshaping the call.
  const authResult = (await (
    authMiddleware as unknown as (
      req: NextRequest,
      ev: NextFetchEvent
    ) => Promise<Response | undefined>
  )(request, event)) as Response | undefined;

  // Blocked, redirected, or otherwise decided — hand it back verbatim.
  if (!isPassThrough(authResult)) return authResult;

  // Allowed. Rebuild the pass-through so the pathname actually arrives, and
  // carry over anything Auth.js set on its own response (session cookie
  // refreshes come through here).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers } });

  if (authResult) {
    for (const [k, v] of authResult.headers.entries()) {
      if (k.toLowerCase() === "set-cookie") res.headers.append(k, v);
    }
  }

  // Signed-in app, admin, auth flows: never indexed. robots.txt already keeps
  // crawlers out and logged-out requests are redirected to /login, so this is
  // the backstop for anything that slips through (a page made public later, a
  // link a crawler reaches some other way). Same list as robots.txt.
  if (isNoindexPath(request.nextUrl.pathname)) {
    res.headers.set("X-Robots-Tag", "noindex, follow");
  }

  // Persist a referral code for the round trip through Google.
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref && /^[A-Za-z0-9_-]{4,32}$/.test(ref)) {
    res.cookies.set(REFERRAL_COOKIE, ref, {
      maxAge: 60 * 60 * 24 * 30, // 30 days — people don't sign up at once
      httpOnly: true,
      sameSite: "lax", // must survive the redirect back from Google
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files, and the metadata routes (robots.txt,
     *   sitemap.xml, llms.txt, ads.txt, manifest.json, sw.js). Only images
     *   used to be skipped, so a logged-out visitor — and Google, and the
     *   browser fetching the PWA manifest, which it does WITHOUT cookies —
     *   was sent to /login instead: the sitemap and robots.txt were never
     *   readable, and the app could not be installed.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|txt|xml|webmanifest|woff2?)$).*)",
  ],
};
