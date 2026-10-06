import { useState } from "react";
import { RiCheckboxCircleLine, RiCheckLine, RiErrorWarningLine, RiFileCopyLine, RiExternalLinkLine } from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { Dialog } from "@/shared/ui/dialog";
import type { CreatedInfo } from "../api/create-reservation";
import type { ContactMethod } from "../model/state";
import { Notice } from "./parts";
import { formatDate, formatTimeRange, methodLabel, purposeLabel, SummaryItem, Tag, type ReservationDetails } from "./summary";

function CopyField({ label, value, note }: { label: string; value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default p-3.5">
      <span className="text-caption-1-semibold text-text-secondary">{label}</span>
      <code className="break-all rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1.5 font-mono text-caption-1-regular text-text-primary">
        {value}
      </code>
      <Button
        variant="secondary"
        size="small"
        leadingIcon={copied ? RiCheckLine : RiFileCopyLine}
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
        {copied ? "コピー済み" : "コピー"}
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
  const [showDetail, setShowDetail] = useState(false);
  const hasPlaceName = !!(details.offlinePlaceName && details.offlinePlaceName.trim());
  const shouldShowToggle = !!details.meetingNote || !!details.offlinePlaceDetail;
  const detailText = prettyDetail(createdInfo?.detail);
  const toggle = (
    <div className="col-span-2">
      <Button variant="secondary" size="small" className="w-full" onClick={() => setShowDetail((v) => !v)}>
        {showDetail ? "ご相談詳細を隠す" : "ご相談詳細を表示"}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={!!createdInfo}
      onOpenChange={(o) => !o && onClose()}
      size="small"
      title={
        <span className="inline-flex items-center gap-2">
          <RiCheckboxCircleLine className="size-5 text-state-success-text" aria-hidden />
          予定を作成しました！
        </span>
      }
      footer={
        <>
          {createdInfo?.ok && createdInfo.eventId && onOpenCancelModal && (
            <Button variant="secondary" className="text-text-destructive" onClick={() => onOpenCancelModal(createdInfo.eventId!)}>
              予定を取り消す
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            閉じる
          </Button>
        </>
      }
    >
      {createdInfo?.ok ? (
        <div className="flex flex-col gap-3">
          <Notice tone="success">
            ご入力いただいたメールアドレスに
            <br />
            Googleカレンダーから予定の招待を送りました。
            <br />
            お打ち合わせ当日はどうぞよろしくお願いします。
          </Notice>
          {createdInfo.htmlLink && (
            <ButtonLink variant="primary" href={createdInfo.htmlLink} target="_blank" rel="noreferrer" trailingIcon={RiExternalLinkLine} className="w-full sm:w-fit">
              Googleカレンダーを開く
            </ButtonLink>
          )}
          {createdInfo.eventId && <CopyField label="EventID" value={createdInfo.eventId} note="お問い合わせの際はEventIDを記載の上お問い合わせください。" />}
          {contactMethod === "meet" && createdInfo.meetLink && (
            <CopyField label="Google Meet URL" value={createdInfo.meetLink} note="当日はこちらのGoogle Meet URLからご参加ください。" />
          )}
          <div className="mt-1">
            <h3 className="mb-2 text-caption-1-semibold text-text-tertiary">予約内容</h3>
            <dl className="grid grid-cols-2 gap-2">
              <SummaryItem label="日付">{calendarLoading ? "読み込み中..." : formatDate(details)}</SummaryItem>
              <SummaryItem label="時間">{calendarLoading ? "読み込み中..." : formatTimeRange(details)}</SummaryItem>
              <SummaryItem label="お名前(本名)" wide>
                {details.name || "(未入力)"}
              </SummaryItem>
              <SummaryItem label="ご相談内容" wide>
                {purposeLabel(details.purpose)}
              </SummaryItem>
              <SummaryItem label="ミーティング媒体" wide>
                <span className="flex flex-wrap items-center gap-2">
                  {methodLabel(contactMethod)}
                  {contactMethod === "discord" && <Tag>Discord名: {details.discordName || "(未入力)"}</Tag>}
                  {contactMethod === "slack" && <Tag>Slack名: {details.slackName || "(未入力)"}</Tag>}
                  {contactMethod === "other" && details.otherNote && <Tag>備考: {details.otherNote}</Tag>}
                  {contactMethod === "offline" && <Tag>オフライン</Tag>}
                </span>
              </SummaryItem>
              <SummaryItem label="メール" wide>
                {details.email || "(メール未入力)"}
              </SummaryItem>
              {shouldShowToggle && !hasPlaceName && toggle}
              {contactMethod === "offline" && (
                <>
                  <SummaryItem label="場所の名称(自動入力)" wide>
                    {details.offlinePlaceName ?? "(取得できませんでした)"}
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
                <SummaryItem label="ご相談詳細(任意)" wide>
                  <span className="block max-h-24 overflow-y-auto whitespace-pre-wrap">{details.meetingNote}</span>
                </SummaryItem>
              )}
            </dl>
          </div>
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
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 text-body-medium text-text-error-primary">
            <RiErrorWarningLine className="size-4" aria-hidden />
            作成に失敗しました。
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
