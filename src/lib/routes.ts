/**
 * Well-known routes that more than one part of the app has to agree on.
 *
 * `USER_HOME` exists because the app had two answers to "where does a user land
 * when they come back to the app", and both were written out by hand in a dozen
 * files. The sidebar's Home entry and the login page said `/social`; the admin
 * and tutor "back to app" links, the admin guards and Google signup said
 * `/dashboard`. The middleware sent a non-admin hitting /admin to `/social`
 * while the admin page's own guard sent the same person to `/dashboard`.
 *
 * `/dashboard` is still a real page with its own nav entry — this is about which
 * page is *home*, not about retiring it.
 */
export const USER_HOME = "/social";
