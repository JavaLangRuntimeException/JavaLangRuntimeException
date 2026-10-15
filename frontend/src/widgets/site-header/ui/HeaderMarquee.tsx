import { useQuery } from "@tanstack/react-query";
import { useWorkLocations } from "@/entities/work-location";
import { pad, weekdayLabel } from "@/shared/lib/busy";
import { useLocale, type Locale } from "@/shared/lib/i18n";
import { computeNextFiveSlots } from "../model/next-slots";

/** 「10/15(木) 21:30〜」（英語は曜日が「Thu」） */
function slotText(t: Date, locale: Locale) {
  return `${t.getMonth() + 1}/${pad(t.getDate())}(${weekdayLabel(t, locale)}) ${pad(t.getHours())}:${pad(t.getMinutes())}〜`;
}

function locationText(locations: Record<string, string> | undefined, locale: Locale) {
  if (!locations) return "";
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const label = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${weekdayLabel(d, locale)})`;
  // 勤務場所の名前はサーバーのデータなのでそのまま
  const tbd = locale === "ja" ? "未定" : "TBD";
  const head = locale === "ja" ? "勤務場所" : "Work location";
  return `${head}: ${label(now)} ${locations[key(now)] || tbd} / ${label(tomorrow)} ${locations[key(tomorrow)] || tbd}`;
}

/** 直近の予約可能時間と勤務場所を横に流す（文言は旧サイトと同じ） */
export function HeaderMarquee() {
  const locale = useLocale();
  const slots = useQuery({ queryKey: ["next-five-slots"], queryFn: () => computeNextFiveSlots(), staleTime: 5 * 60_000 });
  const locations = useWorkLocations();

  const ja = locale === "ja";
  const head = ja ? "直近相談予約可能時間" : "Next available meeting slots";
  const text =
    slots.data && slots.data.length > 0
      ? `${head}: ${slots.data.map((d) => slotText(d, locale)).join(" / ")}`
      : slots.isPending
        ? `${head}: ${ja ? "取得中…" : "Loading…"}`
        : `${head}: ${ja ? "取得できませんでした" : "Could not be loaded"}`;
  const loc = locationText(locations.data, locale);
  const tail = ja
    ? "相談可能時間: 9:00 - 23:00 | Links ではプロフィール・SNS・連絡先を掲載中。Contact ではお問い合わせが可能です。Ask Meでは面談予約が可能です。面談の変更・取消は EventID を添えてお問い合わせください。"
    : "Meeting hours: 9:00 - 23:00 | Links has my profile, social accounts, and contact info. Contact lets you send an inquiry. Ask Me lets you book a meeting. To change or cancel a meeting, contact us with your EventID.";
  const message = `${text}${loc ? ` | ${loc}` : ""} | ${tail}`;

  return (
    <div className="relative overflow-hidden" role="marquee" aria-label={message}>
      <div className="animate-marquee inline-flex whitespace-nowrap ps-[50%] text-caption-1-medium text-text-secondary [animation:marquee_60s_linear_infinite] hover:[animation-play-state:paused]">
        <span className="pe-12">{message}</span>
        <span className="pe-12" aria-hidden="true">
          {message}
        </span>
      </div>
    </div>
  );
}
