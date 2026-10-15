import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { Code } from "@connectrpc/connect";
import { inquiryApi } from "@/shared/api/clients";
import { toApiError } from "@/shared/api/errors";
import { useT, type L10n } from "@/shared/lib/i18n";
import { AdminNotice, AdminPanel } from "@/shared/ui/admin";

// 初期値と送信後の値は旧実装のまま（送信後の本文には「taramanji.com」の行がない）。
// 本文はお客さまに届くメールの中身なので、画面の言語を切り替えても日本語のまま
const INITIAL_BODY = `この度は、taramanji.comにお問い合わせいただき、ありがとうございます。

管理者からのメッセージです。



---
taramanji.com

※このメールは送信専用です。ご返信いただいても対応できない場合がございます。
お問い合わせは、Contactページ（https://taramanji.com/contact）からお願いいたします。`;

const RESET_BODY = `この度は、taramanji.comにお問い合わせいただき、ありがとうございます。

管理者からのメッセージです。



---
※このメールは送信専用です。ご返信いただいても対応できない場合がございます。
お問い合わせは、Contactページ（https://taramanji.com/contact）からお願いいたします。`;

/** 管理者からのメール送信 */
export function AdminEmailForm() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(INITIAL_BODY);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: L10n } | null>(null);
  const t = useT();

  const sendEmail = async () => {
    if (!to || !subject || !body) {
      setResult({ ok: false, message: { ja: "全ての項目を入力してください", en: "Please fill in all fields." } });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      await inquiryApi.sendAdminEmail({ to, subject, body });
      setResult({ ok: true, message: { ja: "メールを送信しました", en: "Email sent." } });
      setTo("");
      setSubject("");
      setBody(RESET_BODY);
    } catch (err) {
      const e = toApiError(err);
      // サーバーが理由（x-error-code）を返したらその文言、通信できなかったときは旧実装と同じ文言
      const fromServer = e.code !== Code[e.status];
      // サーバーの文言はそのまま（どちらの言語でも同じ）
      const message: L10n = fromServer
        ? e.message
          ? { ja: e.message, en: e.message }
          : { ja: "送信に失敗しました", en: "Failed to send." }
        : { ja: "エラーが発生しました", en: "An error occurred." };
      setResult({ ok: false, message });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminPanel title={t({ ja: "メール送信", en: "Send Email" })}>
      {result && (
        <div className="mb-4">
          <AdminNotice ok={result.ok}>{t(result.message)}</AdminNotice>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Input label={t({ ja: "宛先", en: "To" })} type="email" value={to} onChange={setTo} placeholder="example@gmail.com" inputDir="ltr" />
        <Input label={t({ ja: "件名", en: "Subject" })} value={subject} onChange={setSubject} placeholder={t({ ja: "件名を入力", en: "Enter a subject" })} />
        <Textarea label={t({ ja: "本文", en: "Body" })} value={body} onChange={setBody} placeholder={t({ ja: "メール本文を入力", en: "Enter the email body" })} rows={8} resize="vertical" />
        <Button variant="primary" className="w-full" onClick={sendEmail} disabled={sending || !to || !subject || !body}>
          {sending ? t({ ja: "送信中...", en: "Sending..." }) : t({ ja: "送信", en: "Send" })}
        </Button>
      </div>
    </AdminPanel>
  );
}
