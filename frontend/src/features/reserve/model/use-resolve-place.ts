import { useEffect, useState } from "react";
import { reservationApi } from "@/shared/api/clients";

/**
 * Google マップの共有リンクから場所名を自動入力する（旧 reserve/page.tsx と同じ振る舞い）。
 * リンクが空・取得失敗・名前が取れないときは場所名を空にする。返り値は取得中かどうか
 */
export function useResolvePlace(link: string, enabled: boolean, setName: (name: string) => void): boolean {
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const url = (link || "").trim();
    if (!url) {
      setName("");
      return;
    }
    let active = true;
    setResolving(true);
    reservationApi
      .resolveMapsUrl({ url })
      .then((res) => {
        if (active) setName(res.name || "");
      })
      .catch(() => {
        if (active) setName("");
      })
      .finally(() => {
        if (active) setResolving(false);
      });
    return () => {
      active = false;
    };
    // setName は jotai の setter で変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, enabled]);

  return resolving;
}
