import { useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine, RiDownloadLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { reservationApi } from "@/shared/api/clients";
import { AdminPanel } from "@/shared/ui/admin";

type ICalEvent = { start: string; end: string; summary?: string; source?: string; sourceUrl?: string };
type ICalSource = { url: string; name: string; ok: boolean; status: number; eventCount: number };

function getWeekMonday(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

/** iCal 予定確認（各カレンダーの取得状況と、その週の Busy 予定） */
export function IcalSourcesPanel() {
  const [sources, setSources] = useState<ICalSource[]>([]);
  const [events, setEvents] = useState<ICalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchIcalSources = async () => {
    setLoading(true);
    try {
      const res = await reservationApi.listIcalSources({ weekStartIso: getWeekMonday(weekOffset).toISOString() });
      setSources(res.sources.map((s) => ({ url: s.url, name: s.name, ok: s.ok, status: s.status, eventCount: s.eventCount })));
      setEvents(res.events.map((e) => ({ start: e.start, end: e.end, summary: e.summary, source: e.source, sourceUrl: e.sourceUrl })));
    } catch (error) {
      console.error("Failed to fetch iCal sources:", error);
    } finally {
      setLoading(false);
    }
  };

  const monday = getWeekMonday(weekOffset);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  const weekLabel = `${monday.getMonth() + 1}/${monday.getDate()} - ${sunday.getMonth() + 1}/${sunday.getDate()}`;

  return (
    <div className="flex flex-col gap-6">
      <AdminPanel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="small" leadingIcon={RiArrowLeftSLine} onClick={() => setWeekOffset((p) => p - 1)}>
              前週
            </Button>
            <span className="px-3 text-body-semibold tabular-nums text-text-primary">{weekLabel}</span>
            <Button variant="secondary" size="small" trailingIcon={RiArrowRightSLine} onClick={() => setWeekOffset((p) => p + 1)}>
              次週
            </Button>
            <Button variant="ghost" size="small" onClick={() => setWeekOffset(0)}>
              今週
            </Button>
          </div>
          <Button variant="primary" leadingIcon={RiDownloadLine} onClick={fetchIcalSources} disabled={loading}>
            {loading ? "読み込み中..." : "取得"}
          </Button>
        </div>
      </AdminPanel>

      <AdminPanel title="カレンダーソース">
        {sources.length === 0 ? (
          <p className="text-body-2-regular text-text-tertiary">「取得」ボタンを押してデータを読み込んでください</p>
        ) : (
          <ul className="divide-y divide-separator-border">
            {sources.map((source, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <span className="text-body-semibold text-text-primary">{source.name}</span>
                  <span className="ms-2 text-body-2-regular break-all text-text-tertiary">({source.url})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-body-2-regular tabular-nums text-text-secondary">{source.eventCount} 件</span>
                  <span
                    className={
                      source.ok
                        ? "rounded-md bg-background-secondary-default px-2 py-0.5 text-caption-1-semibold text-accent-300"
                        : "rounded-md border border-border-error-default px-2 py-0.5 text-caption-1-semibold text-text-error-primary"
                    }
                  >
                    {source.ok ? "OK" : `Error ${source.status}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel title={`Busy予定一覧 (${events.length} 件)`}>
        {events.length === 0 ? (
          <p className="text-body-2-regular text-text-tertiary">予定がありません</p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {events.map((event, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-2xl border border-border-button-default px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body-medium break-all text-text-primary">{event.summary}</p>
                  <p className="text-body-2-regular tabular-nums text-text-secondary">
                    {formatDate(event.start)} → {formatDate(event.end)}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-background-secondary-default px-2 py-0.5 text-caption-1-medium text-text-secondary">{event.source}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
