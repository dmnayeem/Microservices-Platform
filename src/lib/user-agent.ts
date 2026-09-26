/**
 * "Chrome 128 · Android 14" from a user-agent string — enough for an admin
 * reading a device list. Deliberately small; not a full UA database.
 */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "";
  const pick = (re: RegExp) => ua.match(re)?.[1];
  const browser =
    (pick(/EdgA?\/(\d+)/) && `Edge ${pick(/EdgA?\/(\d+)/)}`) ||
    (pick(/OPR\/(\d+)/) && `Opera ${pick(/OPR\/(\d+)/)}`) ||
    (pick(/SamsungBrowser\/(\d+)/) && `Samsung Internet ${pick(/SamsungBrowser\/(\d+)/)}`) ||
    (/FBAN|FBAV/.test(ua) && "Facebook in-app") ||
    (pick(/Firefox\/(\d+)/) && `Firefox ${pick(/Firefox\/(\d+)/)}`) ||
    (pick(/Chrome\/(\d+)/) && `Chrome ${pick(/Chrome\/(\d+)/)}`) ||
    (/Safari\//.test(ua) && pick(/Version\/(\d+)/) && `Safari ${pick(/Version\/(\d+)/)}`) ||
    "Other browser";
  const os =
    (pick(/Android (\d+(?:\.\d+)?)/) && `Android ${pick(/Android (\d+(?:\.\d+)?)/)}`) ||
    (pick(/iPhone OS (\d+)/) && `iOS ${pick(/iPhone OS (\d+)/)}`) ||
    (pick(/iPad; CPU OS (\d+)/) && `iPadOS ${pick(/iPad; CPU OS (\d+)/)}`) ||
    (/Windows NT 10/.test(ua) && "Windows 10/11") ||
    (/Windows/.test(ua) && "Windows") ||
    (/Mac OS X/.test(ua) && "macOS") ||
    (/Linux/.test(ua) && "Linux") ||
    "Other OS";
  return `${browser} · ${os}`;
}
