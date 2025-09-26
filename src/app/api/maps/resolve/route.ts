import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    let { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Prepend https:// if scheme is missing
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    // Fetch with redirects allowed, server-side (circumvents browser CORS limits)
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
    });

    // Best-effort: try final URL first
    const finalUrl = res.url || url;
    let placeName = extractNameFromUrl(finalUrl);

    // If not found from URL, parse HTML for <title> or og:title
    if (!placeName) {
      const html = await res.text().catch(() => "");
      if (html) {
        // og:title
        const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        if (ogMatch?.[1]) {
          placeName = cleanupTitle(ogMatch[1]);
        }
        if (!placeName) {
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch?.[1]) {
            placeName = cleanupTitle(titleMatch[1]);
          }
        }
      }
    }

    // Treat known error pages as unresolved
    if (placeName && /dynamic\s+link\s+not\s+found/i.test(placeName)) {
      placeName = null;
    }

    return NextResponse.json({ name: placeName || null, finalUrl });
  } catch {
    return NextResponse.json({ error: "failed to resolve" }, { status: 500 });
  }
}

function extractNameFromUrl(u: string): string | null {
  try {
    const url = new URL(u);
    // /maps/place/<PlaceName>/...
    const placeIdx = url.pathname.indexOf("/place/");
    if (placeIdx >= 0) {
      const seg = url.pathname.substring(placeIdx + 7);
      const first = seg.split("/")[0];
      if (first) return decodeURIComponent(first.replace(/\+/g, " "));
    }
    // query parameter q
    const q = url.searchParams.get("q");
    if (q) return decodeURIComponent(q.replace(/\+/g, " "));
  } catch {}
  return null;
}

function cleanupTitle(t: string): string {
  // Remove trailing " - Google マップ" or " - Google Maps"
  return t.replace(/\s*-\s*Google\s*マップ\s*$/i, "").replace(/\s*-\s*Google\s*Maps\s*$/i, "").trim();
}


