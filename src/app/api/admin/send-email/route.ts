import { NextResponse } from "next/server";
import { auth, isAllowedAdmin } from "@/lib/auth";
import { sendEmail } from "@/shared/lib/email";

interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
}

export async function POST(req: Request) {
  try {
    // 認証チェック
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!isAllowedAdmin(session.user.email)) {
      return NextResponse.json({ error: "not_allowed" }, { status: 403 });
    }

    const body: SendEmailRequest = await req.json();

    // バリデーション
    if (!body.to || !body.subject || !body.body) {
      return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
    }

    // メールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.to)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    try {
      console.log('=== 管理者メール送信開始 ===');
      console.log(`送信者: ${session.user.email}`);
      console.log(`宛先: ${body.to}`);
      console.log(`件名: ${body.subject}`);

      // 本文はそのまま送信（フォーマットはフロントエンドで編集済み）
      const result = await sendEmail(body.to, body.subject, body.body);

      console.log(`=== 管理者メール送信完了 ===`);
      console.log(`MessageId: ${result.messageId}`);

      return NextResponse.json({
        ok: true,
        message: "email_sent",
        messageId: result.messageId,
        dev: !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY
      });
    } catch (emailError) {
      console.error("メール送信エラー:", emailError);
      console.error("エラーの詳細:", {
        message: emailError instanceof Error ? emailError.message : 'Unknown error',
        stack: emailError instanceof Error ? emailError.stack : undefined
      });
      return NextResponse.json(
        { ok: false, error: "email_send_failed", details: emailError instanceof Error ? emailError.message : 'Unknown error' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("Admin send email API エラー:", error);
    return NextResponse.json(
      { ok: false, error: "internal_server_error" },
      { status: 500 }
    );
  }
}
