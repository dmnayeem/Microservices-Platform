import { getSetting } from "@/lib/system-settings";
import { ABUSE_DEFAULTS, ABUSE_SETTING_KEYS } from "./policy";

export interface AbuseSettings {
  email: string;
  autoHideOnCritical: boolean;
  autoSuspendOnCritical: boolean;
  notifyAdmins: boolean;
}

/** The Abuse Center settings, with the conservative defaults filled in. */
export async function getAbuseSettings(): Promise<AbuseSettings> {
  const [email, autoHide, autoSuspend, notify] = await Promise.all([
    getSetting<string>(ABUSE_SETTING_KEYS.email, ABUSE_DEFAULTS.email),
    getSetting<boolean>(ABUSE_SETTING_KEYS.autoHideOnCritical, ABUSE_DEFAULTS.autoHideOnCritical),
    getSetting<boolean>(ABUSE_SETTING_KEYS.autoSuspendOnCritical, ABUSE_DEFAULTS.autoSuspendOnCritical),
    getSetting<boolean>(ABUSE_SETTING_KEYS.notifyAdmins, ABUSE_DEFAULTS.notifyAdmins),
  ]);
  return {
    email: typeof email === "string" && email.includes("@") ? email : ABUSE_DEFAULTS.email,
    autoHideOnCritical: autoHide !== false,
    // Only an explicit `true` turns automatic suspension on.
    autoSuspendOnCritical: autoSuspend === true,
    notifyAdmins: notify !== false,
  };
}
