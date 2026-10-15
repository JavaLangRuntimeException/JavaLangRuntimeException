import type { ReactNode } from "react";
import { PURPOSES } from "@/shared/config/purposes";
import { weekdayLabel } from "@/shared/lib/busy";
import type { Locale } from "@/shared/lib/i18n";
import { cx } from "@/utils/cx";
import type { ContactMethod } from "../model/state";

export type { ReservationDetails } from "../model/types";
import type { ReservationDetails } from "../model/types";

const pad = (n: number) => n.toString().padStart(2, "0");
const padOrXX = (n: number | null) => (n == null ? "XX" : pad(n));

export function formatDate(d: ReservationDetails, locale: Locale) {
  // 曜日は日付から表示する言語で出す（d.weekday は API に送る日本語の曜日）
  const weekday = d.year != null && d.month != null && d.day != null ? weekdayLabel(new Date(d.year, d.month - 1, d.day), locale) : d.weekday || "X";
  return `${d.year ?? "XXXX"}/${padOrXX(d.month)}/${padOrXX(d.day)}(${weekday})`;
}

export function formatTimeRange(d: ReservationDetails) {
  if (d.startHour == null || d.startMin == null || d.endHour == null || d.endMin == null) return "XX : XX ~ XX : XX";
  return `${pad(d.startHour)} : ${pad(d.startMin)} ~ ${pad(d.endHour)} : ${pad(d.endMin)}`;
}

export function purposeLabel(value: string, locale: Locale) {
  return PURPOSES.find((p) => p.value === value)?.label[locale] || value;
}

export function methodLabel(m: ContactMethod, locale: Locale) {
  return m === "meet" ? "GoogleMeet" : m === "offline" ? (locale === "ja" ? "オフライン" : "In person") : m;
}

/** 確認・完了画面の 1 項目 */
export function SummaryItem({ label, children, wide, className }: { label: string; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-border-button-default bg-background-primary-default px-3.5 py-3", wide && "col-span-2", className)}>
      <dt className="text-caption-1-regular text-text-tertiary">{label}</dt>
      <dd className="mt-1 break-all text-body-2-medium text-text-primary">{children}</dd>
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex w-fit items-center rounded-full bg-badge-neutral-background px-2 py-0.5 text-caption-1-medium text-text-secondary">{children}</span>;
}
