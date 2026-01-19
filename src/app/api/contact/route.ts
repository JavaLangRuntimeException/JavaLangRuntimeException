import { NextResponse } from "next/server";
import { CONTACT_PURPOSES } from "@/shared/config/purposes";
import { sendEmail } from "@/shared/lib/email";

interface ContactFormData {
  email: string;
  name: string;
  organization?: string;
  subject: string;
  purpose: string;
  message: string;
  eventId?: string;
}

// 問い合わせ要件のvalueをlabelに変換
function getPurposeLabel(purposeValue: string): string {
  const purpose = CONTACT_PURPOSES.find(p => p.value === purposeValue);
  return purpose ? purpose.label : purposeValue;
}



// すべての管理者メールアドレスを取得
function getAllAdminEmails(): string[] {
  const allAdmins = [
    process.env.ADMIN_EMAIL || "",
  ];

  // 空文字列をフィルタリングして重複を除去して返す
  const emails = [...allAdmins].filter(email => email && email.trim() !== "");
  return [...new Set(emails)];
}

// 管理者向けメールの件名を生成
function getAdminSubject(purpose: string, name: string): string {
  const baseName = name || "ゲスト";
  switch (purpose) {
    case "taramanji":
      return `本ページに関するお問い合わせ_${baseName}様x棚橋(taramanji)`;
    case "Ask Me":
      return `面談予約の変更・取消について_${baseName}様x棚橋(taramanji)`;
    case "TechSelect+":
      return `TS+ご相談_${baseName}様x棚橋(taramanji)`;
    case "開発委託/相談":
      return `開発ご相談_${baseName}様x棚橋(taramanji)`;
    case "STECH":
      return `STECHご相談_${baseName}様x棚橋(taramanji)`;
    case "RM2C":
      return `RM2Cご相談_${baseName}様x棚橋(taramanji)`;
    case "JINEN":
      return `コミュニティご相談_${baseName}様x棚橋(taramanji)`;
    case "NxTEND_Event":
      return `NxTEND_Eventご相談_${baseName}様x棚橋(taramanji)`;
    case "NxTEND_Organize":
      return `NxTEND_Organizeご相談_${baseName}様x棚橋(taramanji)`;
    case "biwako.go":
      return `biwako.goご相談_${baseName}様x棚橋(taramanji)`;
    case "kyoto.go":
      return `kyoto.goご相談_${baseName}様x棚橋(taramanji)`;
    case "RCC":
      return `RCCご相談_${baseName}様x棚橋(taramanji)`;
    case "その他":
      return `ご相談_${baseName}様x棚橋(taramanji)`;
    default:
      return `ご相談_${baseName}様x棚橋(taramanji)`;
  }
}

// 管理者向けメール本文を生成
function getAdminMessage(data: ContactFormData, fileInfo: string[] = [], originalRecipient?: string): string {
  const purposeLabel = getPurposeLabel(data.purpose);
  const lines = [
    `お問い合わせ内容: ${purposeLabel}`,
    `件名: ${data.subject}`,
    "",
    "=== お問い合わせ内容 ===",
    data.message,
    "",
    "=== お客様情報 ===",
    `お名前: ${data.name}`,
    `メールアドレス: ${data.email}`,
  ];

  if (data.organization) {
    lines.push(`ご所属: ${data.organization}`);
  }

  if (data.eventId) {
    lines.push(`EventID: ${data.eventId}`);
  }

  if (fileInfo.length > 0) {
    lines.push("");
    lines.push("=== 添付ファイル ===");
    fileInfo.forEach(file => lines.push(`• ${file}`));
  }

  // 元の送信先情報を追加（tanahashishuta@gmail.com用）
  if (originalRecipient) {
    lines.push("");
    lines.push("=== 送信先情報 ===");
    lines.push(`元の送信先: ${originalRecipient}`);
  }

  return lines.join("\n");
}

// ユーザー向け確認メール本文を生成
function getUserMessage(data: ContactFormData, fileInfo: string[] = []): string {
  const purposeLabel = getPurposeLabel(data.purpose);
  let message = `お問い合わせありがとうございます。

taramanji.comの自動応答システムです。

以下の内容でお問い合わせを受け付けました。

=== お問い合わせ内容 ===
件名: ${data.subject}
お問い合わせ要件: ${purposeLabel}
お問い合わせ内容:
${data.message}

=== お客様情報 ===
お名前: ${data.name}
メールアドレス: ${data.email}${data.organization ? `\nご所属: ${data.organization}` : ""}${data.eventId ? `\nEventID: ${data.eventId}` : ""}`;

  if (fileInfo.length > 0) {
    message += `\n\n=== 添付ファイル ===\n`;
    fileInfo.forEach(file => message += `• ${file}\n`);
  }

  message += `\n※このメールは送信専用です。1週間以内にこちらから再度連絡いたします。

今後ともよろしくお願いいたします。`;

  return message;
}



export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // フォームデータを取得
    const data: ContactFormData = {
      email: formData.get('email') as string,
      name: formData.get('name') as string,
      organization: formData.get('organization') as string || undefined,
      subject: formData.get('subject') as string,
      purpose: formData.get('purpose') as string,
      message: formData.get('message') as string,
      eventId: formData.get('eventId') as string || undefined,
    };

    // バリデーション
    if (!data.email || !data.name || !data.subject || !data.purpose || !data.message) {
      return NextResponse.json(
        { ok: false, error: "missing_required_fields" },
        { status: 400 }
      );
    }

    // メールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return NextResponse.json(
        { ok: false, error: "invalid_email" },
        { status: 400 }
      );
    }

    // ファイル処理
    const files = formData.getAll('files') as File[];
    const fileInfo: string[] = [];
    const attachments: Array<{filename: string, content: Buffer, contentType: string}> = [];

    if (files.length > 0) {
      // ファイル数制限チェック
      if (files.length > 5) {
        return NextResponse.json(
          { ok: false, error: "too_many_files" },
          { status: 400 }
        );
      }

      // ファイルサイズチェック (3MB = 3 * 1024 * 1024 bytes)
      for (const file of files) {
        if (file.size > 3 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: "file_too_large" },
            { status: 400 }
          );
        }

        // ファイルをBufferに変換
        const buffer = Buffer.from(await file.arrayBuffer());
        const contentType = file.type || 'application/octet-stream';

        attachments.push({
          filename: file.name,
          content: buffer,
          contentType: contentType
        });

        fileInfo.push(`${file.name} (${Math.round(file.size / 1024)}KB)`);
      }
    }

    const adminEmails = getAllAdminEmails();
    const adminSubject = getAdminSubject(data.purpose, data.name);
    const adminMessage = getAdminMessage(data, fileInfo);
    const userMessage = getUserMessage(data, fileInfo);

    try {
      console.log('=== メール送信開始 ===');
      console.log('管理者メールアドレス:', adminEmails);
      console.log('ユーザーメールアドレス:', data.email);

      // 管理者メールアドレスが存在する場合のみ送信
      if (adminEmails.length > 0) {
        const adminPromises = adminEmails.map(async (adminEmail) => {
          console.log(`管理者メール送信中: ${adminEmail}`);
          return await sendEmail(adminEmail, adminSubject, adminMessage, attachments);
        });
        await Promise.all(adminPromises);
        console.log('管理者メール送信完了');
      } else {
        console.log('管理者メールアドレスが設定されていないため、管理者メールの送信をスキップします');
      }

      // ユーザー向け確認メール送信（添付ファイル付き）
      if (data.email && data.email.trim() !== "") {
        console.log(`ユーザー確認メール送信中: ${data.email}`);
        await sendEmail(data.email, `【お問い合わせ確認】${data.subject}`, userMessage, attachments);
        console.log('ユーザー確認メール送信完了');
      } else {
        console.log('ユーザーメールアドレスが無効なため、確認メールの送信をスキップします');
      }

      console.log('=== メール送信完了 ===');
      return NextResponse.json({ ok: true });
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
    console.error("Contact API エラー:", error);
    return NextResponse.json(
      { ok: false, error: "internal_server_error" },
      { status: 500 }
    );
  }
}
