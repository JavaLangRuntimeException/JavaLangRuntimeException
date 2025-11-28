import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: Request) {
  try {
    // 定員に達したため、予約を受け付けていません
    return NextResponse.json(
      {
        ok: false,
        error: "capacity_reached",
        message: "実験参加人数の定員に達しました。ご協力ありがとうございました！"
      },
      { status: 403 }
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
