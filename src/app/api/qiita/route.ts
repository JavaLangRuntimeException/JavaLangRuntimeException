import { NextResponse } from "next/server";
import { fetchQiitaURLs } from "../../blogs/server";

export const dynamic = "force-static";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const initial = searchParams.get("initial") === "1";
  const urls = await fetchQiitaURLs(page, initial);
  return NextResponse.json({ urls });
}


