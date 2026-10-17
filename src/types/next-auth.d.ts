import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      /**
       * True only when the token explicitly says the user has never completed
       * the first-login handle picker. Sessions issued before that feature
       * shipped carry no claim at all, so this stays false for them and nobody
       * is redirected — the gate fails open by construction.
       */
      needsOnboarding?: boolean;
      /** When this session signed in (ms). Absent on tokens issued before 2026-10-17. */
      loginAt?: number;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role?: string;
    /** From `evaluateLogin` — mirrors `User.onboardedAt !== null`. */
    onboarded?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: string;
    /** Onboarding completed. Absent on pre-feature tokens — see above. */
    onb?: boolean;
    /** Sign-in time (ms) — set only when the token is issued at sign-in. */
    lat?: number;
  }
}
