import { useState } from "react";
import { RiSendPlaneLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Textarea } from "@/components/base/textarea/textarea";
import { Code } from "@connectrpc/connect";
import { inquiryApi } from "@/shared/api/clients";
import { toApiError } from "@/shared/api/errors";
import { AdminNotice, AdminPanel } from "@/shared/ui/admin";

// 初期値と送信後の値は旧実装のまま（送信後の本文には「taramanji.com」の行がない）
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
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const sendEmail = async () => {
    if (!to || !subject || !body) {
      setResult({ ok: false, message: "全ての項目を入力してください" });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      await inquiryApi.sendAdminEmail({ to, subject, body });
      setResult({ ok: true, message: "メールを送信しました" });
      setTo("");
      setSubject("");
      setBody(RESET_BODY);
    } catch (err) {
      const e = toApiError(err);
      // サーバーが理由（x-error-code）を返したらその文言、通信できなかったときは旧実装と同じ文言
      const fromServer = e.code !== Code[e.status];
      setResult({ ok: false, message: fromServer ? e.message || "送信に失敗しました" : "エラーが発生しました" });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminPanel title="メール送信">
      {result && (
        <div className="mb-4">
          <AdminNotice ok={result.ok}>{result.message}</AdminNotice>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <Input label="宛先" type="email" value={to} onChange={setTo} placeholder="example@gmail.com" inputDir="ltr" />
        <Input label="件名" value={subject} onChange={setSubject} placeholder="件名を入力" />
        <Textarea label="本文" value={body} onChange={setBody} placeholder="メール本文を入力" rows={8} resize="vertical" />
        <Button variant="primary" className="w-full" leadingIcon={RiSendPlaneLine} onClick={sendEmail} disabled={sending || !to || !subject || !body}>
          {sending ? "送信中..." : "送信"}
        </Button>
      </div>
    </AdminPanel>
  );
}
