import { RiMailLine, RiUserLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
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
  return (
    <FieldCard>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="inline-flex items-center gap-2 text-body-semibold text-text-primary">
            <RiUserLine className="size-4 text-foreground-icon-secondary" aria-hidden />
            お名前
          </h2>
          <Input aria-label="お名前" placeholder="お名前(本名)" value={name} onChange={setName} autoComplete="name" />
          {/* 旧実装と同じく、未入力のときだけ出す */}
          <FieldError>{errors.name && name.trim().length === 0 ? errors.name : undefined}</FieldError>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="inline-flex items-center gap-2 text-body-semibold text-text-primary">
            <RiMailLine className="size-4 text-foreground-icon-secondary" aria-hidden />
            メールアドレス
          </h2>
          <Input aria-label="メールアドレス" type="email" inputDir="ltr" placeholder="your.name@example.com" value={email} onChange={setEmail} autoComplete="email" />
          <FieldError>{errors.email}</FieldError>
        </div>
      </div>
      <p className="text-caption-1-regular text-text-secondary">
        入力いただいたメールアドレスに Google カレンダーから招待が届きます。お手数ですが必ずご確認ください。
        <br />
        こちらの都合で予定のキャンセルや変更のお願いを差し上げる場合も、上記のメールアドレス宛にご連絡いたします。
      </p>
    </FieldCard>
  );
}
