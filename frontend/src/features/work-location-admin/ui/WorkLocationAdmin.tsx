import { useCallback, useEffect, useRef, useState } from "react";
import { RiDeleteBinLine, RiRefreshLine, RiSaveLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { LOCATION_OPTIONS } from "@/entities/work-location";
import { workLocationApi } from "@/shared/api/clients";
import { WEEKDAYS } from "@/shared/lib/busy";
import { cx } from "@/utils/cx";
import { AdminNotice, AdminPanel } from "@/shared/ui/admin";
import { LocationSelect } from "./LocationSelect";

type LocationMap = Record<string, string>;
type Result = { ok: boolean; message: string };

/**
 * 勤務場所の登録・変更・削除。行をドラッグすると複数日をまとめて選べ、選んだ日を一括で変更できる。
 * 画面を開いた（タブを選んだ）ときに一覧を読み込む（旧実装と同じ）
 */
export function WorkLocationAdmin() {
  const [locations, setLocations] = useState<LocationMap>({});
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState("");
  const [value, setValue] = useState<string>(LOCATION_OPTIONS[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState<string>(LOCATION_OPTIONS[0]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // ドラッグで選択
  const isDragging = useRef(false);
  const dragMode = useRef<"select" | "deselect">("select");

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      setLocations((await workLocationApi.listWorkLocations({})).locations);
    } catch (error) {
      console.error("Failed to fetch locations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  // ドラッグ終了をグローバルで検知
  useEffect(() => {
    const end = () => {
      isDragging.current = false;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const handleDragStart = (d: string) => {
    isDragging.current = true;
    const wasSelected = selected.has(d);
    dragMode.current = wasSelected ? "deselect" : "select";
    setSelected((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const handleDragEnter = (d: string) => {
    if (!isDragging.current) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (dragMode.current === "select") next.add(d);
      else next.delete(d);
      return next;
    });
  };

  const toggleDate = (d: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  const saveLocation = async () => {
    if (!date || !value) {
      setResult({ ok: false, message: "日付と場所を選択してください" });
      return;
    }
    try {
      await workLocationApi.setWorkLocations({ dates: [date], location: value });
      setResult({ ok: true, message: "保存しました" });
      setDate("");
      void fetchLocations();
    } catch {
      setResult({ ok: false, message: "保存に失敗しました" });
    }
  };

  const deleteLocation = async (d: string) => {
    try {
      await workLocationApi.deleteWorkLocation({ date: d });
      void fetchLocations();
    } catch (error) {
      console.error("Failed to delete location:", error);
    }
  };

  const updateOne = async (d: string, location: string) => {
    try {
      await workLocationApi.setWorkLocations({ dates: [d], location });
      setLocations((prev) => ({ ...prev, [d]: location }));
    } catch (err) {
      console.error("Failed to update location:", err);
    }
  };

  const bulkUpdate = async () => {
    if (selected.size === 0) return;
    setBulkSaving(true);
    try {
      await workLocationApi.setWorkLocations({ dates: Array.from(selected), location: bulkLocation });
      setResult({ ok: true, message: `${selected.size}件を「${bulkLocation}」に変更しました` });
      setSelected(new Set());
      void fetchLocations();
    } catch {
      setResult({ ok: false, message: "一括変更に失敗しました" });
    } finally {
      setBulkSaving(false);
    }
  };

  const dates = Object.keys(locations).sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <AdminPanel title="勤務場所を登録">
        {result && (
          <div className="mb-4">
            <AdminNotice ok={result.ok}>{result.message}</AdminNotice>
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Input label="日付" type="date" value={date} onChange={setDate} className="flex-1" inputDir="ltr" {...{ min: today }} />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-body-2-medium text-text-secondary">勤務場所</span>
            <LocationSelect label="勤務場所" value={value} onChange={setValue} />
          </div>
          <Button variant="primary" leadingIcon={RiSaveLine} onClick={saveLocation} disabled={!date}>
            保存
          </Button>
        </div>
      </AdminPanel>

      <AdminPanel
        title={
          <>
            登録済み勤務場所 ({dates.length} 件)
            {selected.size > 0 && <span className="ms-2 text-body-2-medium text-accent-300">（{selected.size}件選択中）</span>}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="xs" onClick={() => setSelected(new Set(dates))}>
              全選択
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
              選択解除
            </Button>
            <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} onClick={fetchLocations} disabled={loading}>
              {loading ? "読み込み中..." : "更新"}
            </Button>
          </>
        }
      >
        {/* 一括変更バー */}
        {selected.size > 0 && (
          <div className="mb-4 flex flex-col items-stretch gap-3 rounded-2xl border border-accent-500/40 bg-accent-500/15 p-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-body-2-semibold text-accent-200">{selected.size}件を一括変更 →</span>
            <LocationSelect label="一括変更する勤務場所" value={bulkLocation} onChange={setBulkLocation} size="sm" className="min-w-0 flex-1" />
            <Button variant="primary" size="small" onClick={bulkUpdate} disabled={bulkSaving}>
              {bulkSaving ? "変更中..." : "一括変更"}
            </Button>
          </div>
        )}

        {dates.length === 0 ? (
          <p className="text-body-2-regular text-text-tertiary">登録がありません</p>
        ) : (
          <ul className="flex select-none flex-col gap-2">
            {dates.map((d) => {
              const dt = new Date(d + "T00:00:00");
              const label = `${dt.getMonth() + 1}/${dt.getDate()}（${WEEKDAYS[dt.getDay()]}）`;
              const isSelected = selected.has(d);
              return (
                <li
                  key={d}
                  onPointerDown={(e) => {
                    // セレクト・ボタン・チェックボックスの上でのドラッグは無視
                    if ((e.target as HTMLElement).closest("button, select, input, label, [role='listbox']")) return;
                    e.preventDefault();
                    handleDragStart(d);
                  }}
                  onPointerEnter={() => handleDragEnter(d)}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 transition-colors",
                    isSelected ? "border-accent-300 bg-accent-500/15" : "border-border-button-default bg-background-primary-default hover:bg-background-primary-hover",
                  )}
                >
                  <Checkbox isSelected={isSelected} onChange={() => toggleDate(d)} aria-label={`${label}を選択`} />
                  <span className="w-24 shrink-0 text-body-medium tabular-nums text-text-primary">{label}</span>
                  <LocationSelect label={`${label}の勤務場所`} value={locations[d]} onChange={(v) => updateOne(d, v)} size="sm" className="min-w-0 flex-1" />
                  <Button variant="ghost" size="small" leadingIcon={RiDeleteBinLine} className="shrink-0 text-text-error-primary" onClick={() => deleteLocation(d)}>
                    削除
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
