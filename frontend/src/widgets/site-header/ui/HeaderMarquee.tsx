import { useQuery } from "@tanstack/react-query";
import { useWorkLocations } from "@/entities/work-location";
import { WEEKDAYS } from "@/shared/lib/busy";
import { computeNextFiveSlots } from "../model/next-slots";

function locationText(locations: Record<string, string> | undefined) {
  if (!locations) return "";
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const label = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  return `勤務場所: ${label(now)} ${locations[key(now)] || "未定"} / ${label(tomorrow)} ${locations[key(tomorrow)] || "未定"}`;
}

/** 直近の予約可能時間と勤務場所を横に流す（文言は旧サイトと同じ） */
export function HeaderMarquee() {
  const slots = useQuery({ queryKey: ["next-five-slots"], queryFn: () => computeNextFiveSlots(), staleTime: 5 * 60_000 });
  const locations = useWorkLocations();

  const text =
    slots.data && slots.data.length > 0
      ? `直近相談予約可能時間: ${slots.data.join(" / ")}`
      : slots.isPending
        ? "直近相談予約可能時間: 取得中…"
        : "直近相談予約可能時間: 取得できませんでした";
  const loc = locationText(locations.data);
  const message = `${text}${loc ? ` | ${loc}` : ""} | 相談可能時間: 9:00 - 23:00 | Links ではプロフィール・SNS・連絡先を掲載中。Contact ではお問い合わせが可能です。Ask Meでは面談予約が可能です。面談の変更・取消は EventID を添えてお問い合わせください。`;

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
