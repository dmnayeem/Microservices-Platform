/**
 * Copy-to-clipboard with a fallback that actually works.
 *
 * `navigator.clipboard` only exists in a *secure context*. Plenty of this app's
 * users are on an in-app webview (opening a task from a Facebook or Telegram
 * link) or on a plain-HTTP LAN address during testing — there the modern API is
 * simply `undefined` and every copy button silently does nothing. Since the
 * whole social-recipe flow is "copy this, paste it into Pinterest", a silent
 * no-op is the difference between a task the user can finish and one they can't.
 *
 * So: try the modern API, and on any failure fall back to the legacy hidden
 * textarea + `execCommand("copy")`, which needs no permission and no secure
 * context. Returns whether it worked so callers can show a tick or a toast
 * instead of pretending.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied, insecure context, or no focus — fall through.
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
