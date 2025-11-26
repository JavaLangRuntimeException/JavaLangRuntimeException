import { NextResponse } from "next/server";
import { fetchQiitaURLs, fetchQiitaItems } from "../../blogs/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const initial = searchParams.get("initial") === "1";
  const includeTags = searchParams.get("includeTags") === "1";
  const perPage = searchParams.get("perPage") ? Number(searchParams.get("perPage")) : undefined;

  if (includeTags) {
    const items = await fetchQiitaItems(page, initial, perPage);
    return NextResponse.json({
      items: items.map(item => ({
        url: item.url,
        title: item.title,
        body: item.body || "",
        tags: item.tags || []
      }))
    });
  }

  const urls = await fetchQiitaURLs(page, initial);
  return NextResponse.json({ urls });
}


