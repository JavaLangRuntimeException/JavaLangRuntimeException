import { useCallback, useState } from "react";
import { ContactForm, ContactSubmittedDialog } from "@/features/contact";
import { useT } from "@/shared/lib/i18n";
import { PageContainer, PageHeader } from "@/shared/ui/layout";

const alternateContacts = [
  { label: { ja: "NxTEND", en: "NxTEND" }, email: "shuta.tanahashi@nxtend.or.jp" },
  { label: { ja: "JINEN・STECH", en: "JINEN / STECH" }, email: "s.tanahashi@jinnen.co.jp" },
  { label: { ja: "株式会社888", en: "888 Inc." }, email: "shuta.tanahashi@888incs.com" },
  { label: { ja: "TSKaigi", en: "TSKaigi" }, email: "tanahashi@tskaigi.org" },
  { label: { ja: "RM2CLab", en: "RM2CLab" }, email: "tanahasi@rm2c.ise.ritsumei.ac.jp" },
  { label: { ja: "その他", en: "Other" }, email: "tanahashishuta@gmail.com" },
];

export default function ContactPage() {
  const t = useT();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const close = useCallback(() => setIsSubmitted(false), []);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={t({ ja: "お問い合わせ", en: "Contact" })}
        description={t({ ja: "ご質問やご相談がございましたら、お気軽にお問い合わせください。", en: "If you have any questions or would like to talk, feel free to get in touch." })}
      />

      {/* 案内は箱で囲まず、項目と値の一覧（dl）で見せる */}
      <dl className="mb-12 grid gap-x-8 border-y border-separator-border sm:grid-cols-[11rem_1fr]">
        <dt className="pt-5 text-body-2-medium text-text-tertiary sm:pb-5">{t({ ja: "お問い合わせ対応時間", en: "Response hours" })}</dt>
        <dd className="pb-5 pt-1 text-body-regular text-text-primary sm:pt-5">
          <span className="sr-only">{t({ ja: "お問い合わせ対応時間: ", en: "Response hours: " })}</span>
          <span className="font-mono">9:00-21:00</span>
        </dd>
        <dt className="sr-only">{t({ ja: "お返事", en: "Reply" })}</dt>
        <dd className="border-t border-separator-border py-5 text-body-regular text-text-primary sm:col-span-2">{t({ ja: "お問い合わせいただいてから1週間以内にお返事いたします", en: "We will reply within a week of receiving your inquiry" })}</dd>
      </dl>

      <section className="mb-12" aria-labelledby="alt-contacts">
        <h2 id="alt-contacts" className="mb-3 text-headline-semibold text-text-primary">{t({ ja: "代替連絡先", en: "Other contacts" })}</h2>
        <dl className="grid gap-x-8 sm:grid-cols-[11rem_1fr]">
          {alternateContacts.map((c) => (
            <div key={c.email} className="contents">
              <dt className="border-t border-separator-border pt-3 text-body-2-medium text-text-secondary sm:pb-3">{t(c.label)}</dt>
              <dd className="pb-3 pt-0.5 sm:border-t sm:border-separator-border sm:pt-3">
                <a
                  href={`mailto:${c.email}`}
                  dir="ltr"
                  className="break-all font-mono text-[0.875rem] text-accent-300 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  {c.email}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-12" aria-labelledby="attach-notes">
        <h2 id="attach-notes" className="mb-3 text-headline-semibold text-text-primary">{t({ ja: "ファイル添付について", en: "About attachments" })}</h2>
        <ul className="flex list-disc flex-col gap-1.5 ps-5 text-body-2-regular text-text-secondary marker:text-text-tertiary">
          <li>{t({ ja: "最大5個までファイルを添付できます", en: "You can attach up to 5 files" })}</li>
          <li>{t({ ja: "1ファイルあたり3MB以下にしてください", en: "Each file must be 3 MB or smaller" })}</li>
          <li>{t({ ja: "ファイル形式は問いません", en: "Any file format is accepted" })}</li>
          <li>
            {t({
              ja: "ファイルサイズが大きい場合は、GoogleDriveやOneDriveなどのクラウドストレージにアップロードして共有リンクを本文に記載してください",
              en: "For larger files, upload them to cloud storage such as Google Drive or OneDrive and include the share link in your message",
            })}
          </li>
        </ul>
      </section>

      {!isSubmitted && <ContactForm onSuccess={() => setIsSubmitted(true)} />}
      <ContactSubmittedDialog isOpen={isSubmitted} onClose={close} />
    </PageContainer>
  );
}
