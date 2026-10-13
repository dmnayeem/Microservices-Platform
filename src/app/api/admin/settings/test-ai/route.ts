import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSecret } from "@/lib/system-settings";
import { geminiKeyStatus, maskKey } from "@/lib/gemini-keys";
import { z } from "zod";

/**
 * Check whether a saved AI key actually works.
 *
 * "Paste the key and save" is only true if the owner can see that it took. A
 * key with a typo, a key on a project with no billing and a key that was never
 * saved at all are three different problems that all present as "the AI does
 * nothing", and without this button the only way to tell them apart is to spend
 * credits generating an image and read the failure.
 *
 * Every provider is checked with its cheapest read-only call — listing models,
 * or the account endpoint — so pressing this never bills for generation.
 */
export const runtime = "nodejs";

const schema = z.object({ provider: z.enum(["GEMINI", "OPENAI", "MAGNIFIC"]) });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: "Pick a provider to test" }, { status: 400 });
  }

  const provider = v.data.provider;

  // Gemini: every key in the pool (main + backups), each with a read-only call,
  // plus whether it is benched for a used-up quota right now.
  if (provider === "GEMINI") {
    const keys = await geminiKeyStatus();
    if (!keys.length) {
      return NextResponse.json({ error: "No Gemini key saved. Paste one and press Save first." }, { status: 400 });
    }
    const lines = await Promise.all(
      keys.map(async ({ key, benched }, i) => {
        const name = `${i === 0 ? "Main" : `Backup ${i}`} (${maskKey(key)})`;
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
            { cache: "no-store" }
          );
          if (!res.ok) {
            const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
            return { ok: false, line: `${name}: rejected — ${b.error?.message ?? `HTTP ${res.status}`}` };
          }
          return { ok: true, line: `${name}: works${benched ? ` · ${benched}` : ""}` };
        } catch {
          return { ok: false, line: `${name}: could not reach Google` };
        }
      })
    );
    const good = lines.filter((l) => l.ok).length;
    const text = lines.map((l) => l.line).join(" | ");
    return good > 0
      ? NextResponse.json({ ok: true, message: `${good}/${lines.length} Gemini keys work. ${text}` })
      : NextResponse.json({ error: `No Gemini key works. ${text}` }, { status: 400 });
  }
  const envName = provider === "OPENAI" ? "OPENAI_API_KEY" : "MAGNIFIC_API_KEY";
  // getSecret prefers the env var. Say so, or a passing test reads as "the key
  // I just pasted works" while that key is not the one in use.
  const fromEnv = !!process.env[envName]?.trim();
  const source = fromEnv
    ? ` (tested the ${envName} environment variable, which is used instead of the key saved here)`
    : "";
  const key = await getSecret(envName, provider === "OPENAI" ? "openai_api_key" : "magnific_api_key");

  if (!key) {
    return NextResponse.json(
      { error: "No key saved for that provider. Paste one and press Save first." },
      { status: 400 }
    );
  }

  try {
    let res: Response;
    if (provider === "OPENAI") {
      res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
    } else {
      // Magnific's cheapest authenticated read. A bad key answers 401 here just
      // as it would on a generation call, without spending anything.
      res = await fetch("https://api.magnific.com/v1/resources?page=1&limit=1", {
        headers: { "x-magnific-api-key": key },
        cache: "no-store",
      });
    }

    if (res.ok) {
      return NextResponse.json({ ok: true, message: `${provider} key works.${source}` });
    }

    const body = await res.json().catch(() => ({}));
    const detail =
      (body as { error?: { message?: string }; message?: string })?.error?.message ??
      (body as { message?: string })?.message ??
      "";
    return NextResponse.json(
      {
        error:
          res.status === 401 || res.status === 403
            ? `${provider} rejected that key${detail ? ` — ${detail}` : ""}${source}`
            : `${provider} answered HTTP ${res.status}${detail ? ` — ${detail}` : ""}${source}`,
      },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reach the provider" },
      { status: 502 }
    );
  }
}
