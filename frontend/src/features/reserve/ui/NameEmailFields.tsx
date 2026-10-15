import { Input } from "@/components/base/input/input";
import { useT } from "@/shared/lib/i18n";
import { FieldCard, FieldError } from "./parts";

export function NameEmailFields({
  name,
  setName,
  email,
  setEmail,
  errors,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  errors: Record<string, string>;
}) {
  const t = useT();
  const nameLabel = t({ ja: "お名前", en: "Name" });
  const emailLabel = t({ ja: "メールアドレス", en: "Email address" });
  return (
    <FieldCard>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="inline-flex items-center gap-2 text-body-semibold text-text-primary">
            {nameLabel}
          </h2>
          <Input aria-label={nameLabel} placeholder={t({ ja: "お名前(本名)", en: "Your name (legal name)" })} value={name} onChange={setName} autoComplete="name" />
          {/* 旧実装と同じく、未入力のときだけ出す */}
          <FieldError>{errors.name && name.trim().length === 0 ? errors.name : undefined}</FieldError>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="inline-flex items-center gap-2 text-body-semibold text-text-primary">
            {emailLabel}
          </h2>
          <Input aria-label={emailLabel} type="email" inputDir="ltr" placeholder="your.name@example.com" value={email} onChange={setEmail} autoComplete="email" />
          <FieldError>{errors.email}</FieldError>
        </div>
      </div>
      <p className="text-caption-1-regular text-text-secondary">
        {t({
          ja: "入力いただいたメールアドレスに Google カレンダーから招待が届きます。お手数ですが必ずご確認ください。",
          en: "A Google Calendar invitation will be sent to the email address you enter. Please be sure to check it.",
        })}
        <br />
        {t({
          ja: "こちらの都合で予定のキャンセルや変更のお願いを差し上げる場合も、上記のメールアドレス宛にご連絡いたします。",
          en: "If we need to ask you to cancel or reschedule, we will also contact you at this email address.",
        })}
      </p>
    </FieldCard>
  );
}
