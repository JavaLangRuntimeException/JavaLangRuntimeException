import { NextResponse } from "next/server";
import { fetchMultipleOgp } from "../../blogs/server";

export async function POST(req: Request) {
  try {
    // リクエストボディが空または無効なJSONの場合を処理
    let body;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch (parseError) {
      // JSON解析エラーの場合、空のオブジェクトを使用
      console.error("[OGP API] Failed to parse request body:", parseError);
      body = {};
    }

    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];
    const noCache: boolean = body?.noCache === true;
    const data = await fetchMultipleOgp(urls, noCache);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[OGP API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


