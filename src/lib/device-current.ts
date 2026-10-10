import "server-only";
import { cookies, headers } from "next/headers";
import { DEVICE_COOKIE_NAME, decodeDeviceCookie, parseDevice, type DeviceInfo } from "@/lib/device-info";

/**
 * The device of the person making THIS request, for tasks / banners / popups
 * device targeting. Prefers the `rt_dev` cookie the browser writes with Client
 * Hints (it knows the phone brand; the user-agent header no longer does on
 * Chrome for Android); falls back to parsing the user agent.
 *
 * Returns `undefined` outside a request (background jobs): device rules are
 * then not applied, rather than hiding everything.
 */
export async function currentDevice(): Promise<Pick<DeviceInfo, "type" | "os" | "brand" | "browser"> | undefined> {
  try {
    const [c, h] = await Promise.all([cookies(), headers()]);
    const fromCookie = decodeDeviceCookie(c.get(DEVICE_COOKIE_NAME)?.value);
    if (fromCookie) return fromCookie;
    const mobileHint = h.get("sec-ch-ua-mobile");
    const platformHint = h.get("sec-ch-ua-platform")?.replace(/"/g, "") ?? null;
    const d = parseDevice(h.get("user-agent"), {
      mobile: mobileHint === "?1" ? true : mobileHint === "?0" ? false : null,
      platform: platformHint,
    });
    return { type: d.type, os: d.os, brand: d.brand, browser: d.browser };
  } catch {
    return undefined;
  }
}
