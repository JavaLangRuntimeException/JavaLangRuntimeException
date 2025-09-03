import { NextResponse } from "next/server";
import { fetchMultipleOgp } from "../../blogs/server";

export async function POST(req: Request) {
  const body = await req.json();
  const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
  const data = await fetchMultipleOgp(urls);
  return NextResponse.json({ data });
}


