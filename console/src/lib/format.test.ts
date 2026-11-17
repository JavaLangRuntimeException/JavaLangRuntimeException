import { describe, expect, it } from "vitest";
import { byteExponent, formatBytes, formatDateTime, formatTick, formatTimeTick, formatValue } from "./format";

describe("formatValue", () => {
  it("bytes は 2 進の単位にそろえる", () => {
    expect(formatValue(512, "bytes")).toBe("512 B");
    expect(formatValue(1536, "bytes")).toBe("1.5 KiB");
    expect(formatValue(256 * 1024 ** 2, "bytes")).toBe("256 MiB");
    expect(formatValue(1.25 * 1024 ** 3, "bytes")).toBe("1.25 GiB");
  });

  it("mcores は 1000 以上で cores にする", () => {
    expect(formatValue(250.4, "mcores")).toBe("250 mcores");
    expect(formatValue(1500, "mcores")).toBe("1.5 cores");
  });

  it("% と ms と req/s", () => {
    expect(formatValue(0.123, "%")).toBe("0.12%");
    expect(formatValue(12.34, "%")).toBe("12.3%");
    expect(formatValue(87.6, "ms")).toBe("87.6 ms");
    expect(formatValue(2300, "ms")).toBe("2.3 s");
    expect(formatValue(3.456, "req/s")).toBe("3.46 req/s");
    expect(formatValue(1234, "req/s")).toBe("1,234 req/s");
  });

  it("数でない値はダッシュ、知らない単位はそのまま付ける", () => {
    expect(formatValue(Number.NaN, "ms")).toBe("—");
    expect(formatValue(3, "rps")).toBe("3 rps");
    expect(formatValue(3, "")).toBe("3");
  });
});

describe("formatBytes / byteExponent", () => {
  it("指数を指定すると、その単位で出す", () => {
    expect(byteExponent(3 * 1024 ** 3)).toBe(3);
    expect(formatBytes(512 * 1024 ** 2, 3)).toBe("0.5 GiB");
  });
});

describe("formatTick", () => {
  it("軸の中では上端に合わせて単位をそろえる", () => {
    const max = 2 * 1024 ** 3;
    expect(formatTick(0, "bytes", max)).toBe("0 GiB");
    expect(formatTick(512 * 1024 ** 2, "bytes", max)).toBe("0.5 GiB");
    expect(formatTick(500, "mcores", 2000)).toBe("0.5 cores");
    expect(formatTick(200, "mcores", 400)).toBe("200 m");
    expect(formatTick(2.5, "%", 5)).toBe("2.5%");
  });
});

describe("時刻（日本時間）", () => {
  // 2026-10-22 05:30 UTC = 14:30 JST
  const t = Date.UTC(2026, 9, 22, 5, 30);

  it("1h / 1d は時:分", () => {
    expect(formatTimeTick(t, "1h")).toBe("14:30");
    expect(formatTimeTick(t, "1d")).toBe("14:30");
  });

  it("7d は月/日。日付の境目も日本時間で決まる", () => {
    expect(formatTimeTick(t, "7d")).toBe("10/22");
    // 2026-10-22 16:00 UTC は JST では 10/23 01:00
    expect(formatTimeTick(Date.UTC(2026, 9, 22, 16, 0), "7d")).toBe("10/23");
  });

  it("ツールチップは月/日 時:分", () => {
    expect(formatDateTime(Date.UTC(2026, 9, 22, 15, 5))).toBe("10/23 00:05");
  });
});
