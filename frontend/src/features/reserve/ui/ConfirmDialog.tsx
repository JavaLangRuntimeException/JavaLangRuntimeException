import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
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
  const [showDetail, setShowDetail] = useState(false);
  const hasMeetingNote = !!details.meetingNote;
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());
  const shouldShowToggle = hasMeetingNote || !!details.offlinePlaceDetail;
  const toggle = (
    <div className="col-span-2">
      <Button variant="secondary" size="small" className="w-full" onClick={() => setShowDetail((v) => !v)}>
        {showDetail ? "ご相談詳細を隠す" : "ご相談詳細を表示"}
      </Button>
    </div>
  );
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title="最終確認"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={submitting}>
            送信する
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-2.5">
        <SummaryItem label="日付">{calendarLoading ? "読み込み中..." : formatDate(details)}</SummaryItem>
        <SummaryItem label="時間">{calendarLoading ? "読み込み中..." : formatTimeRange(details)}</SummaryItem>
        <SummaryItem label="お名前(本名)">{details.name || "(未入力)"}</SummaryItem>
        <SummaryItem label="ご相談内容" wide>
          {purposeLabel(details.purpose)}
        </SummaryItem>
        <SummaryItem label="ミーティング媒体" wide>
          <span className="flex flex-wrap items-center gap-2">
            {methodLabel(details.contactMethod)}
            {details.contactMethod === "discord" && <Tag>Discord名: {details.discordName || "(必須)"}</Tag>}
            {details.contactMethod === "slack" && <Tag>Slack名: {details.slackName || "(必須)"}</Tag>}
            {details.contactMethod === "other" && details.otherNote && <Tag>備考: {details.otherNote}</Tag>}
          </span>
        </SummaryItem>
        <SummaryItem label="メール" wide>
          {details.email || "(メール未入力)"}
        </SummaryItem>
        {details.contactMethod !== "offline" && hasMeetingNote && toggle}
        {details.contactMethod === "offline" && (
          <>
            <SummaryItem label="場所の名称(自動入力)" wide>
              {details.offlinePlaceName || "(取得できませんでした)"}
            </SummaryItem>
            {hasPlaceName && shouldShowToggle && toggle}
            {showDetail && details.offlinePlaceDetail && (
              <SummaryItem label="場所の詳細" wide>
                <span className="whitespace-pre-wrap">{details.offlinePlaceDetail}</span>
              </SummaryItem>
            )}
          </>
        )}
        {showDetail && details.meetingNote && (
          <SummaryItem label="ご相談詳細" wide>
            <span className="block max-h-24 overflow-y-auto whitespace-pre-wrap">{details.meetingNote}</span>
          </SummaryItem>
        )}
      </dl>
    </Dialog>
  );
}
