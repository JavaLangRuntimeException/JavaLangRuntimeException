import { Link } from "react-router";
import { RiArrowLeftSLine, RiArrowRightSLine, RiArrowUpLine, RiCalendarScheduleLine, RiDeleteBinLine, RiFlashlightLine, RiLoader4Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { CancelDialog } from "@/features/reserve-cancel";
import {
  CompletionDialog,
  ConfirmDialog,
  ContactFields,
  CreatingDialog,
  DateTimeFields,
  FieldCard,
  MeetingNoteField,
  NameEmailFields,
  Notice,
  PurposeField,
  useReserveForm,
} from "@/features/reserve";
import { businessHoursFor } from "@/entities/slot";
import { weekdayName } from "@/shared/lib/busy";
import { Card, PageContainer, PageHeader } from "@/shared/ui/layout";
import { WeekGrid } from "@/widgets/week-grid";
import { useState } from "react";

const HOURS = Array.from({ length: 15 }, (_, i) => 9 + i); // 9-23
const MINUTES = [0, 30];
const DAY_MS = 86400000;

const dayLabel = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${weekdayName(d)})`;

export default function ReservePage() {
  const f = useReserveForm();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelEventId, setCancelEventId] = useState("");
  const weekEnd = new Date(f.weekStart.getTime() + 6 * DAY_MS);

  return (
    <PageContainer>
      <PageHeader
        title="お打ち合わせ予約"
        description={
          <p>
            お問い合わせは
            <Link className="text-accent-300 underline underline-offset-2" to="/contact">
              Contact
            </Link>
            ページ・X(
            <a className="text-accent-300 underline underline-offset-2" href="https://x.com/JavaLangRuntime" target="_blank" rel="noreferrer">
              @JavaLangRuntime
            </a>
            )でも承っております
          </p>
        }
        actions={
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <div className="group relative inline-block self-end">
              {f.canSubmit && (
                <>
                  {/* 旧サイトと同じ: ホバーで左上から Qiitan、右上から Gopher が顔を出す */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -start-2 -top-1 translate-x-4 translate-y-2 opacity-0 transition-all duration-300 ease-out group-hover:z-10 group-hover:-translate-x-1 group-hover:-translate-y-4 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <img src="/qiitan.png" alt="" width={40} height={40} className="size-10 -rotate-45" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -end-2 -top-1 -translate-x-4 translate-y-2 opacity-0 transition-all duration-300 ease-out group-hover:z-10 group-hover:translate-x-1 group-hover:-translate-y-4 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <img src="/gopher.png" alt="" width={40} height={40} className="size-10 rotate-45" />
                  </span>
                </>
              )}
              <Button
                variant="primary"
                className="relative z-10 h-11 px-8 text-headline-semibold shadow-lg shadow-accent-500/25 hover:scale-[1.03]"
                disabled={!f.canSubmit || f.decisionLocked || f.confirmOpen}
                onClick={f.openConfirm}
              >
                決定
              </Button>
            </div>
            {!f.canSubmit && f.submitBlockMessage && <p className="text-caption-1-regular text-text-error-primary sm:text-end">{f.submitBlockMessage}</p>}
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiDeleteBinLine}
              className="text-text-destructive"
              onClick={() => {
                setCancelEventId("");
                setCancelOpen(true);
              }}
            >
              予定を取り消す
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        {/* 案内 */}
        <ul className="flex flex-col gap-2 text-body-2-regular text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
            入力内容は10分間保持されます
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
            フォームに入力いただいた内容はご相談や面談の予約確認の目的でのみ使用されます。
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
            <span>
              対面でのご相談をご希望の方は{" "}
              <Link to="/location" className="font-medium text-accent-300 underline underline-offset-2">
                勤務場所ページ
              </Link>{" "}
              で勤務予定地をご確認ください。
            </span>
          </li>
        </ul>

        {/* 直近の空き枠 */}
        {(f.slotLoading || f.displayedSlotText) && (
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-2-regular text-text-secondary">
              直近相談予約可能時間(30分枠):{" "}
              <span className="font-semibold text-text-primary tabular-nums">{f.slotLoading ? "読み込み中..." : f.displayedSlotText}</span>
            </p>
            {!f.slotLoading && f.displayedSlotText && (
              <Button variant="secondary" size="small" leadingIcon={RiFlashlightLine} onClick={f.applyNextAvailableSlot}>
                最短での時間指定(30分枠)
              </Button>
            )}
          </Card>
        )}
        {f.notify && <Notice tone="success">{f.notify}</Notice>}

        <PurposeField value={f.purpose} onChange={f.setPurpose} error={f.errors.purpose} />
        <MeetingNoteField value={f.meetingNote} onChange={f.setMeetingNote} />
        <NameEmailFields name={f.name} setName={f.setName} email={f.email} setEmail={f.setEmail} errors={f.errors} />
        <ContactFields
          contactMethod={f.contactMethod}
          setContactMethod={f.setContactMethod}
          discordServer={f.discordServer}
          setDiscordServer={f.setDiscordServer}
          onDiscordServerFocus={() => f.setDiscordServerTouched(true)}
          discordName={f.discordName}
          setDiscordName={f.setDiscordName}
          slackWorkspace={f.slackWorkspace}
          setSlackWorkspace={f.setSlackWorkspace}
          slackName={f.slackName}
          setSlackName={f.setSlackName}
          otherNote={f.otherNote}
          setOtherNote={f.setOtherNote}
          offlinePlaceLink={f.offlinePlaceLink}
          setOfflinePlaceLink={f.setOfflinePlaceLink}
          offlinePlaceName={f.offlinePlaceName}
          isResolvingPlace={f.isResolvingPlace}
          offlinePlaceDetail={f.offlinePlaceDetail}
          setOfflinePlaceDetail={f.setOfflinePlaceDetail}
          errors={f.errors}
        />
        {f.contactMethod === "offline" && <Notice tone="warning">オフライン面談の予約可能時間は 10:00 - 21:00 です。</Notice>}

        <DateTimeFields
          year={f.year}
          month={f.month}
          day={f.day}
          setYear={f.setYear}
          setMonth={f.setMonth}
          setDay={f.setDay}
          weekday={f.weekday}
          startHour={f.startHour}
          startMin={f.startMin}
          endHour={f.endHour}
          endMin={f.endMin}
          setStartHour={f.setStartHour}
          setStartMin={f.setStartMin}
          setEndHour={f.setEndHour}
          setEndMin={f.setEndMin}
          hours={HOURS}
          minuteOptions={MINUTES}
          yearOptions={f.yearOptions}
          monthOptions={f.monthOptions}
          selectionInvalid={f.selectionInvalid}
          timeError={f.errors.time}
          disabled={f.busyLoading}
          offlineHoursInvalid={f.offlineHoursInvalid}
        />

        {/* 週カレンダー（埋まっている時間は選べない） */}
        <FieldCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="inline-flex items-center gap-2 text-body-semibold text-text-primary">
              <RiCalendarScheduleLine className="size-4 text-foreground-icon-secondary" aria-hidden />
              <span className="whitespace-nowrap">カレンダーから日時選択</span>
            </h2>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="small"
                leadingIcon={RiArrowLeftSLine}
                onClick={() => f.setWeekStart(new Date(f.weekStart.getTime() - f.weekMs))}
                disabled={f.weekStart.getTime() <= f.currentMonday.getTime()}
              >
                前の週
              </Button>
              <span className="text-caption-1-medium tabular-nums text-text-secondary">
                {dayLabel(f.weekStart)} 〜 {dayLabel(weekEnd)}
              </span>
              <Button
                variant="secondary"
                size="small"
                trailingIcon={RiArrowRightSLine}
                onClick={() => f.setWeekStart(new Date(f.weekStart.getTime() + f.weekMs))}
                disabled={new Date(f.weekStart.getTime() + f.weekMs) > f.oneMonthLater}
              >
                次の週
              </Button>
            </div>
          </div>
          <p className="text-caption-1-regular text-text-secondary">
            30分枠をクリックで選択。
            <br />
            同日の隣接時間枠をクリックで1時間以上の面談設定ができます。
            <br />
            赤色の日付は予約可能な時間枠がない日です。
            <br />
            黄色の日付は予約可能な時間が残りわずかであることを示します。
          </p>
          <div className="relative" aria-busy={f.busyLoading}>
            {f.busyLoading && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-background-primary-default/70">
                <RiLoader4Line className="size-7 animate-spin text-accent-600 motion-reduce:animate-none" aria-label="読み込み中" />
              </div>
            )}
            <WeekGrid
              busy={f.busy}
              focusDate={f.weekStart}
              selectedStart={f.selectedStart}
              selectedEnd={f.selectedEnd}
              businessHours={businessHoursFor(f.contactMethod)}
              locations={f.locations}
              onSelectSlot={f.selectSlot}
            />
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" size="small" leadingIcon={RiArrowUpLine} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              ページ上部へ
            </Button>
          </div>
        </FieldCard>
      </div>

      <ConfirmDialog
        isOpen={f.confirmOpen}
        onClose={() => f.setConfirmOpen(false)}
        onSubmit={f.submit}
        submitting={f.creating}
        calendarLoading={f.busyLoading}
        details={{ ...f.details, contactMethod: f.contactMethod }}
      />
      <CreatingDialog isOpen={f.creating} />
      <CompletionDialog
        createdInfo={f.createdInfo}
        contactMethod={f.completedMethod}
        details={f.completedDetails ?? f.details}
        calendarLoading={f.busyLoading}
        onClose={f.closeCompletion}
        onOpenCancelModal={(eventId) => {
          setCancelEventId(eventId);
          setCancelOpen(true);
        }}
      />
      <CancelDialog
        isOpen={cancelOpen}
        initialEventId={cancelEventId}
        onClose={() => {
          setCancelOpen(false);
          setCancelEventId("");
        }}
        onDeleteSuccess={() => window.location.reload()}
      />
    </PageContainer>
  );
}
