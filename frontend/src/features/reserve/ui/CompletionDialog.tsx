import { useState } from "react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { useLocale, useT } from "@/shared/lib/i18n";
import { Dialog } from "@/shared/ui/dialog";
import type { CreatedInfo } from "../api/create-reservation";
import type { ContactMethod } from "../model/state";
import { Notice } from "./parts";
import { formatDate, formatTimeRange, methodLabel, purposeLabel, SummaryItem, Tag, type ReservationDetails } from "./summary";

function CopyField({ label, value, note }: { label: string; value: string; note: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-button-default bg-background-secondary-default p-3.5">
      <span className="text-caption-1-semibold text-text-secondary">{label}</span>
      <code className="break-all rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1.5 font-mono text-caption-1-regular text-text-primary">
        {value}
      </code>
      <Button
        variant="secondary"
        size="small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // コピーできない環境では何もしない
          }
        }}
      >
        {copied ? t({ ja: "コピー済み", en: "Copied" }) : t({ ja: "コピー", en: "Copy" })}
      </Button>
      <p className="text-caption-1-regular text-text-secondary">{note}</p>
    </div>
  );
}

/** detail が JSON なら整形して見せる（旧実装は JSON をインデントして表示していた） */
function prettyDetail(detail?: string) {
  if (!detail) return "";
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

/** 予約の結果（成功・失敗）。文言は旧 CompletionModal と同じ */
export function CompletionDialog({
  createdInfo,
  contactMethod,
  details,
  calendarLoading = false,
  onClose,
  onOpenCancelModal,
}: {
  createdInfo: CreatedInfo;
  contactMethod: ContactMethod;
  details: ReservationDetails;
  calendarLoading?: boolean;
  onClose: () => void;
  onOpenCancelModal?: (eventId: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [showDetail, setShowDetail] = useState(false);
  const loading = t({ ja: "読み込み中...", en: "Loading..." });
  const notEntered = t({ ja: "(未入力)", en: "(not entered)" });
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());
  const shouldShowToggle = !!details.meetingNote || !!details.offlinePlaceDetail;
  const detailText = prettyDetail(createdInfo?.detail);
  const toggle = (
    <div className="col-span-2">
      <Button variant="secondary" size="small" className="w-full" onClick={() => setShowDetail((v) => !v)}>
        {showDetail ? t({ ja: "ご相談詳細を隠す", en: "Hide details" }) : t({ ja: "ご相談詳細を表示", en: "Show details" })}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={!!createdInfo}
      onOpenChange={(o) => !o && onClose()}
      size="small"
      title={t({ ja: "予定を作成しました！", en: "Your meeting has been scheduled!" })}
      footer={
        <>
          {createdInfo?.ok && createdInfo.eventId && onOpenCancelModal && (
            <Button variant="secondary" className="text-text-destructive" onClick={() => onOpenCancelModal(createdInfo.eventId!)}>
              {t({ ja: "予定を取り消す", en: "Cancel the meeting" })}
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            {t({ ja: "閉じる", en: "Close" })}
          </Button>
        </>
      }
    >
      {createdInfo?.ok ? (
        <div className="flex flex-col gap-3">
          <Notice tone="success">
            {locale === "ja" ? (
              <>
                ご入力いただいたメールアドレスに
                <br />
                Googleカレンダーから予定の招待を送りました。
                <br />
                お打ち合わせ当日はどうぞよろしくお願いします。
              </>
            ) : (
              <>
                We sent a Google Calendar invitation to the email address you entered.
                <br />
                We look forward to meeting you.
              </>
            )}
          </Notice>
          {createdInfo.htmlLink && (
            <ButtonLink variant="primary" href={createdInfo.htmlLink} target="_blank" rel="noreferrer" className="w-full sm:w-fit">
              {t({ ja: "Googleカレンダーを開く", en: "Open Google Calendar" })}
            </ButtonLink>
          )}
          {createdInfo.eventId && <CopyField label="EventID" value={createdInfo.eventId} note={t({ ja: "お問い合わせの際はEventIDを記載の上お問い合わせください。", en: "Please include the EventID when you contact us." })} />}
          {contactMethod === "meet" && createdInfo.meetLink && (
            <CopyField label="Google Meet URL" value={createdInfo.meetLink} note={t({ ja: "当日はこちらのGoogle Meet URLからご参加ください。", en: "On the day, please join from this Google Meet URL." })} />
          )}
          <div className="mt-1">
            <h3 className="mb-2 text-caption-1-semibold text-text-tertiary">{t({ ja: "予約内容", en: "Reservation details" })}</h3>
            <dl className="grid grid-cols-2 gap-2">
              <SummaryItem label={t({ ja: "日付", en: "Date" })}>{calendarLoading ? loading : formatDate(details, locale)}</SummaryItem>
              <SummaryItem label={t({ ja: "時間", en: "Time" })}>{calendarLoading ? loading : formatTimeRange(details)}</SummaryItem>
              <SummaryItem label={t({ ja: "お名前(本名)", en: "Name (legal name)" })} wide>
                {details.name || notEntered}
              </SummaryItem>
              <SummaryItem label={t({ ja: "ご相談内容", en: "Topic" })} wide>
                {purposeLabel(details.purpose, locale)}
              </SummaryItem>
              <SummaryItem label={t({ ja: "ミーティング媒体", en: "Meeting method" })} wide>
                <span className="flex flex-wrap items-center gap-2">
                  {methodLabel(contactMethod, locale)}
                  {contactMethod === "discord" && <Tag>{t({ ja: "Discord名", en: "Discord name" })}: {details.discordName || notEntered}</Tag>}
                  {contactMethod === "slack" && <Tag>{t({ ja: "Slack名", en: "Slack name" })}: {details.slackName || notEntered}</Tag>}
                  {contactMethod === "other" && details.otherNote && <Tag>{t({ ja: "備考", en: "Note" })}: {details.otherNote}</Tag>}
                  {contactMethod === "offline" && <Tag>{t({ ja: "オフライン", en: "In person" })}</Tag>}
                </span>
              </SummaryItem>
              <SummaryItem label={t({ ja: "メール", en: "Email" })} wide>
                {details.email || t({ ja: "(メール未入力)", en: "(no email entered)" })}
              </SummaryItem>
              {shouldShowToggle && !hasPlaceName && toggle}
              {contactMethod === "offline" && (
                <>
                  <SummaryItem label={t({ ja: "場所の名称(自動入力)", en: "Place name (auto-filled)" })} wide>
                    {details.offlinePlaceName ?? t({ ja: "(取得できませんでした)", en: "(could not be retrieved)" })}
                  </SummaryItem>
                  {hasPlaceName && shouldShowToggle && toggle}
                  {showDetail && details.offlinePlaceDetail && (
                    <SummaryItem label={t({ ja: "場所の詳細", en: "Place details" })} wide>
                      <span className="whitespace-pre-wrap">{details.offlinePlaceDetail}</span>
                    </SummaryItem>
                  )}
                </>
              )}
              {showDetail && details.meetingNote && (
                <SummaryItem label={t({ ja: "ご相談詳細(任意)", en: "Details (optional)" })} wide>
                  <span className="block max-h-24 overflow-y-auto whitespace-pre-wrap">{details.meetingNote}</span>
                </SummaryItem>
              )}
            </dl>
          </div>
          {locale === "ja" ? (
            <>
              <Notice tone="warning">
                こちらの都合で取り消しさせていただく場合があります。
                <br />
                その際はメール・Discord・Slackなどでお知らせします。
              </Notice>
              <Notice tone="warning">
                予定の取り消しをご希望の場合は、
                <br />
                <a className="break-all underline underline-offset-2" href="/reserve">
                  Ask Meページ
                </a>
                から予定を取り消してください。
              </Notice>
              <Notice tone="warning">
                予定の変更をご希望の場合は、
                <br />
                <a className="break-all underline underline-offset-2" href="/contact">
                  Contact
                </a>
                ページまたは
                <br />
                Discord・Slackでご連絡ください。
              </Notice>
            </>
          ) : (
            <>
              <Notice tone="warning">
                We may need to cancel the meeting on our side.
                <br />
                If so, we will let you know by email, Discord, Slack, or similar.
              </Notice>
              <Notice tone="warning">
                To cancel the meeting, please do so from the{" "}
                <a className="break-all underline underline-offset-2" href="/reserve">
                  Ask Me page
                </a>
                .
              </Notice>
              <Notice tone="warning">
                To change the meeting, please contact us via the{" "}
                <a className="break-all underline underline-offset-2" href="/contact">
                  Contact
                </a>{" "}
                page, Discord, or Slack.
              </Notice>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 text-body-medium text-text-error-primary">
            {t({ ja: "作成に失敗しました。", en: "Failed to create the meeting." })}
          </p>
          {createdInfo?.message && <p className="text-body-2-regular text-text-secondary">{createdInfo.message}</p>}
          {createdInfo?.error && <p className="break-all font-mono text-caption-1-regular text-text-tertiary">error: {createdInfo.error}</p>}
          {detailText && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-background-secondary-default p-3 font-mono text-caption-1-regular text-text-secondary">
              {detailText}
            </pre>
          )}
        </div>
      )}
    </Dialog>
  );
}
