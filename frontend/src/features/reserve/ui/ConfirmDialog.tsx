import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { useLocale, useT } from "@/shared/lib/i18n";
import { Dialog } from "@/shared/ui/dialog";
import type { ContactMethod } from "../model/state";
import { formatDate, formatTimeRange, methodLabel, purposeLabel, SummaryItem, Tag, type ReservationDetails } from "./summary";

/** 送信前の最終確認（項目・文言は旧 ConfirmModal と同じ） */
export function ConfirmDialog({
  isOpen,
  onClose,
  onSubmit,
  submitting = false,
  calendarLoading = false,
  details,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  calendarLoading?: boolean;
  details: ReservationDetails & { contactMethod: ContactMethod };
}) {
  const t = useT();
  const locale = useLocale();
  const [showDetail, setShowDetail] = useState(false);
  const loading = t({ ja: "読み込み中...", en: "Loading..." });
  const hasMeetingNote = !!details.meetingNote;
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());
  const shouldShowToggle = hasMeetingNote || !!details.offlinePlaceDetail;
  const toggle = (
    <div className="col-span-2">
      <Button variant="secondary" size="small" className="w-full" onClick={() => setShowDetail((v) => !v)}>
        {showDetail ? t({ ja: "ご相談詳細を隠す", en: "Hide details" }) : t({ ja: "ご相談詳細を表示", en: "Show details" })}
      </Button>
    </div>
  );
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t({ ja: "最終確認", en: "Final confirmation" })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t({ ja: "キャンセル", en: "Cancel" })}
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={submitting}>
            {t({ ja: "送信する", en: "Submit" })}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-2.5">
        <SummaryItem label={t({ ja: "日付", en: "Date" })}>{calendarLoading ? loading : formatDate(details, locale)}</SummaryItem>
        <SummaryItem label={t({ ja: "時間", en: "Time" })}>{calendarLoading ? loading : formatTimeRange(details)}</SummaryItem>
        <SummaryItem label={t({ ja: "お名前(本名)", en: "Name (legal name)" })}>{details.name || t({ ja: "(未入力)", en: "(not entered)" })}</SummaryItem>
        <SummaryItem label={t({ ja: "ご相談内容", en: "Topic" })} wide>
          {purposeLabel(details.purpose, locale)}
        </SummaryItem>
        <SummaryItem label={t({ ja: "ミーティング媒体", en: "Meeting method" })} wide>
          <span className="flex flex-wrap items-center gap-2">
            {methodLabel(details.contactMethod, locale)}
            {details.contactMethod === "discord" && <Tag>{t({ ja: "Discord名", en: "Discord name" })}: {details.discordName || t({ ja: "(必須)", en: "(required)" })}</Tag>}
            {details.contactMethod === "slack" && <Tag>{t({ ja: "Slack名", en: "Slack name" })}: {details.slackName || t({ ja: "(必須)", en: "(required)" })}</Tag>}
            {details.contactMethod === "other" && details.otherNote && <Tag>{t({ ja: "備考", en: "Note" })}: {details.otherNote}</Tag>}
          </span>
        </SummaryItem>
        <SummaryItem label={t({ ja: "メール", en: "Email" })} wide>
          {details.email || t({ ja: "(メール未入力)", en: "(no email entered)" })}
        </SummaryItem>
        {details.contactMethod !== "offline" && hasMeetingNote && toggle}
        {details.contactMethod === "offline" && (
          <>
            <SummaryItem label={t({ ja: "場所の名称(自動入力)", en: "Place name (auto-filled)" })} wide>
              {details.offlinePlaceName || t({ ja: "(取得できませんでした)", en: "(could not be retrieved)" })}
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
          <SummaryItem label={t({ ja: "ご相談詳細", en: "Details" })} wide>
            <span className="block max-h-24 overflow-y-auto whitespace-pre-wrap">{details.meetingNote}</span>
          </SummaryItem>
        )}
      </dl>
    </Dialog>
  );
}
