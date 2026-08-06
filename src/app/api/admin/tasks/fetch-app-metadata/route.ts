import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { detectStore } from "@/lib/app-install-tasks";

// POST /api/admin/tasks/fetch-app-metadata { url }
// Best-effort auto-fill of app name / description / logo from a store link.
// App Store → iTunes Lookup API (JSON). Play Store → OG meta tags in the HTML.
// Any failure returns { error } so the admin form can fall back to manual entry.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "tasks.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "A store URL is required." }, { status: 400 });
  }
  const store = detectStore(url);
  if (!store) {
    return NextResponse.json(
      { error: "Not a recognized Play Store or App Store link." },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    if (store === "apple") {
      const idMatch = url.match(/id(\d+)/);
      if (!idMatch) throw new Error("Could not read the App Store id.");
      const res = await fetch(
        `https://itunes.apple.com/lookup?id=${idMatch[1]}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      const data = (await res.json()) as {
        results?: Array<{
          trackName?: string;
          description?: string;
          artworkUrl512?: string;
          artworkUrl100?: string;
        }>;
      };
      const app = data.results?.[0];
      if (!app) throw new Error("App not found in the App Store.");
      return NextResponse.json({
        name: app.trackName ?? "",
        description: app.description ?? "",
        logo: app.artworkUrl512 ?? app.artworkUrl100 ?? "",
        appStoreUrl: url,
      });
    }

    // Play Store — parse Open Graph tags out of the initial HTML.
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);
    const html = await res.text();
    const og = (prop: string) => {
      const m =
        html.match(
          new RegExp(
            `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
            "i"
          )
        ) ??
        html.match(
          new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`,
            "i"
          )
        );
      return m ? decodeHtml(m[1]) : "";
    };
    let name = og("title");
    // Play titles are often "App Name - Apps on Google Play"
    name = name.replace(/\s*[-–|]\s*(Apps on Google Play|Google Play).*$/i, "").trim();
    return NextResponse.json({
      name,
      description: og("description"),
      logo: og("image"),
      playStoreUrl: url,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.name === "AbortError"
            ? "The store timed out — fill the fields manually."
            : "Couldn't fetch app details — fill the fields manually.",
      },
      { status: 502 }
    );
  }
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
