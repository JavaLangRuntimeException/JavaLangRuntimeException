import type { ReactNode } from "react";
import { PURPOSES } from "@/shared/config/purposes";
import { cx } from "@/utils/cx";
import type { ContactMethod } from "../model/state";

export type { ReservationDetails } from "../model/types";
import type { ReservationDetails } from "../model/types";

const pad = (n: number) => n.toString().padStart(2, "0");
const padOrXX = (n: number | null) => (n == null ? "XX" : pad(n));

export function formatDate(d: ReservationDetails) {
  return `${d.year ?? "XXXX"}/${padOrXX(d.month)}/${padOrXX(d.day)}(${d.weekday || "X"})`;
}

export function formatTimeRange(d: ReservationDetails) {
  if (d.startHour == null || d.startMin == null || d.endHour == null || d.endMin == null) return "XX : XX ~ XX : XX";
  return `${pad(d.startHour)} : ${pad(d.startMin)} ~ ${pad(d.endHour)} : ${pad(d.endMin)}`;
}

export function purposeLabel(value: string) {
  return PURPOSES.find((p) => p.value === value)?.label || value;
}

export function methodLabel(m: ContactMethod) {
  return m === "meet" ? "GoogleMeet" : m === "offline" ? "オフライン" : m;
}

/** 確認・完了画面の 1 項目 */
export function SummaryItem({ label, children, wide, className }: { label: string; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cx("rounded-2xl border border-border-button-default bg-background-primary-default px-3.5 py-3", wide && "col-span-2", className)}>
      <dt className="text-caption-1-regular text-text-tertiary">{label}</dt>
      <dd className="mt-1 break-all text-body-2-medium text-text-primary">{children}</dd>
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex w-fit items-center rounded-full bg-badge-neutral-background px-2 py-0.5 text-caption-1-medium text-text-secondary">{children}</span>;
}
