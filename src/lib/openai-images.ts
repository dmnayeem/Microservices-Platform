/**
 * OpenAI image generation (ChatGPT's image model).
 *
 * A second and third generator next to Magnific exist for a plain reason: one
 * provider is one point of failure and one bill. When a Magnific key runs out
 * of credits the Stock Studio stops producing anything at all, and the admin
 * cannot tell an empty wallet from a broken pipeline.
 *
 * The key resolves per call — `OPENAI_API_KEY` first, then the admin
 * **Settings → Integrations → OpenAI API Key** row — so a key pasted into the
 * admin screen takes effect without a redeploy. Same contract as
 * `lib/gemini.ts` and `lib/magnific.ts`.
 */
import { getSecret } from "@/lib/system-settings";

const openaiKey = () => getSecret("OPENAI_API_KEY", "openai_api_key");

/**
 * `gpt-image-1` is the current image model. Overridable because OpenAI retires
 * model names on its own schedule and a rename must not need a deploy — the
 * same trap that left `gemini-1.5-flash` 404ing in lib/gemini.ts.
 */
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

export async function isOpenAIConfigured(): Promise<boolean> {
  return !!(await openaiKey());
}

/** The only sizes the image endpoint accepts. `auto` lets the model choose. */
export type OpenAIImageSize = "1024x1024" | "1536x1024" | "1024x1536" | "auto";

/**
 * Generate one image and return its raw bytes.
 *
 * `gpt-image-1` always answers with base64 rather than a URL, so there is no
 * expiring link to race — unlike Magnific, whose result URLs lapse within the
 * hour.
 */
export async function generateOpenAIImage(
  prompt: string,
  opts: { size?: OpenAIImageSize } = {}
): Promise<{ success: true; bytes: Buffer; mime: string } | { success: false; error: string }> {
  const key = await openaiKey();
  if (!key) return { success: false, error: "OPENAI_API_KEY is not set" };

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: opts.size ?? "1024x1024",
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // OpenAI's own message names the real problem (billing, content policy,
      // an unknown model) far better than the status code does.
      const msg =
        (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    const b64 = (json as { data?: { b64_json?: string; url?: string }[] })?.data?.[0]?.b64_json;
    if (b64) {
      return { success: true, bytes: Buffer.from(b64, "base64"), mime: "image/png" };
    }

    // Older models answer with a short-lived URL instead. Pull it immediately
    // rather than storing the link.
    const url = (json as { data?: { url?: string }[] })?.data?.[0]?.url;
    if (url) {
      const img = await fetch(url, { cache: "no-store" });
      if (!img.ok) {
        return { success: false, error: `Could not download the result (HTTP ${img.status})` };
      }
      return {
        success: true,
        bytes: Buffer.from(await img.arrayBuffer()),
        mime: img.headers.get("content-type") || "image/png",
      };
    }

    return { success: false, error: "The model returned no image" };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
