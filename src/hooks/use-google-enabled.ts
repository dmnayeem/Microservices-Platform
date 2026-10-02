"use client";

import { useEffect, useState } from "react";
import { getProviders } from "next-auth/react";

/**
 * Whether the server actually has Google sign-in configured. The provider is
 * only registered when GOOGLE_CLIENT_ID/SECRET are set, and a Google button
 * shown without it fails on every click — in the browser and the installed
 * app alike. Null while unknown, so the button never flashes in and out.
 */
export function useGoogleEnabled(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    getProviders()
      .then((p) => live && setOn(!!p?.google))
      .catch(() => live && setOn(false));
    return () => {
      live = false;
    };
  }, []);
  return on;
}
