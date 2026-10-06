import { useCallback, useState } from "react";
import { RiAttachment2, RiMailLine, RiTimeLine } from "@remixicon/react";
import { ContactForm, ContactSubmittedDialog } from "@/features/contact";
import { Card, PageContainer, PageHeader } from "@/shared/ui/layout";

const alternateContacts = [
  { label: "NxTEND", email: "shuta.tanahashi@nxtend.or.jp" },
  { label: "JINEN・STECH", email: "s.tanahashi@jinnen.co.jp" },
  { label: "株式会社888", email: "shuta.tanahashi@888incs.com" },
  { label: "TSKaigi", email: "tanahashi@tskaigi.org" },
  { label: "RM2CLab", email: "tanahasi@rm2c.ise.ritsumei.ac.jp" },
  { label: "その他", email: "tanahashishuta@gmail.com" },
];

export default function ContactPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const close = useCallback(() => setIsSubmitted(false), []);

  return (
    <PageContainer width="narrow">
      <PageHeader title="お問い合わせ" description="ご質問やご相談がございましたら、お気軽にお問い合わせください。" />

      <div className="mb-10 grid gap-4 sm:grid-cols-2">
        <Card className="flex items-start gap-3">
          <RiTimeLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          <p className="text-body-2-regular text-text-secondary">
            お問い合わせ対応時間: <span className="text-body-2-semibold text-text-primary">9:00-21:00</span>
          </p>
        </Card>
        <Card className="flex items-start gap-3">
          <RiMailLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          <p className="text-body-2-semibold text-text-primary">お問い合わせいただいてから1週間以内にお返事いたします</p>
        </Card>

        <Card className="flex flex-col gap-3 sm:col-span-2">
          <p className="text-body-2-semibold text-text-primary">代替連絡先</p>
          <ul className="divide-y divide-separator-border">
            {alternateContacts.map((c) => (
              <li key={c.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-body-2-medium text-text-primary">{c.label}</span>
                <a
                  href={`mailto:${c.email}`}
                  dir="ltr"
                  className="break-all text-body-2-regular text-accent-300 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  {c.email}
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-2 sm:col-span-2">
          <p className="flex items-center gap-2 text-body-2-semibold text-text-primary">
            <RiAttachment2 className="size-4 text-foreground-icon-tertiary" aria-hidden />
            ファイル添付について
          </p>
          <ul className="flex list-disc flex-col gap-1 ps-9 text-caption-1-regular text-text-secondary marker:text-text-tertiary">
            <li>最大5個までファイルを添付できます</li>
            <li>1ファイルあたり3MB以下にしてください</li>
            <li>ファイル形式は問いません</li>
            <li>ファイルサイズが大きい場合は、GoogleDriveやOneDriveなどのクラウドストレージにアップロードして共有リンクを本文に記載してください</li>
          </ul>
        </Card>
      </div>

      {!isSubmitted && <ContactForm onSuccess={() => setIsSubmitted(true)} />}
      <ContactSubmittedDialog isOpen={isSubmitted} onClose={close} />
    </PageContainer>
  );
}
