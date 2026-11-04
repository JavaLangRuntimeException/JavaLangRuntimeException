import { describe, expect, it } from "vitest";
import { formatCpu, formatPercent, levelOf, limitedByLabel, machineMemory, pickFit, sizeLabel, usage } from "./capacity";

const GIB = 1024 ** 3;

describe("usage", () => {
  it("bigint を受け取り、割合と棒の長さを出す", () => {
    const u = usage({ used: 512n * 1024n ** 2n, limit: 2n * BigInt(GIB) });
    expect(u.percent).toBe(25);
    expect(u.fill).toBe(0.25);
    expect(u.unlimited).toBe(false);
  });

  it("枠が 0 なら「枠なし」扱い（割合は出さない）", () => {
    const u = usage({ used: 3n, limit: 0n });
    expect(u).toMatchObject({ used: 3, unlimited: true, fill: 0, percent: null });
    expect(usage(undefined)).toMatchObject({ used: 0, limit: 0, unlimited: true });
  });

  it("枠を超えても棒ははみ出さないが、割合はそのまま出す", () => {
    const u = usage({ used: 15, limit: 10 });
    expect(u.fill).toBe(1);
    expect(u.percent).toBe(150);
  });
});

describe("formatPercent / levelOf", () => {
  it("1% 未満は <1%、0 は 0%、枠なしはダッシュ", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.4)).toBe("<1%");
    expect(formatPercent(42.6)).toBe("43%");
    expect(formatPercent(null)).toBe("—");
  });

  it("8 割で注意、95% で危険、枠なしはふつう", () => {
    expect(levelOf({ unlimited: false, percent: 79 })).toBe("ok");
    expect(levelOf({ unlimited: false, percent: 80 })).toBe("warn");
    expect(levelOf({ unlimited: false, percent: 95 })).toBe("bad");
    expect(levelOf({ unlimited: true, percent: null })).toBe("ok");
  });
});

describe("formatCpu / sizeLabel / limitedByLabel", () => {
  it("ミリコアを CPU の数にする", () => {
    expect(formatCpu(250)).toBe("0.25 CPU");
    expect(formatCpu(1000)).toBe("1 CPU");
    expect(formatCpu(12)).toBe("0.012 CPU");
    expect(formatCpu(10000)).toBe("10 CPU");
  });

  it("大きさの名前は大文字", () => {
    expect(sizeLabel("xl")).toBe("XL");
  });

  it("何で止まるかを日本語にする。知らない値はそのまま", () => {
    expect(limitedByLabel("quota_memory")).toBe("この環境の枠（メモリ）");
    expect(limitedByLabel("quota_cpu")).toBe("この環境の枠（CPU）");
    expect(limitedByLabel("quota_pods")).toBe("この環境の枠（Pod 数）");
    expect(limitedByLabel("machine_memory")).toBe("Mac mini の空きメモリ");
    expect(limitedByLabel("gpu")).toBe("gpu");
    expect(limitedByLabel("")).toBe("—");
  });
});

describe("machineMemory", () => {
  it("使用中・予約・空きに分ける", () => {
    const m = machineMemory({ memoryTotal: 10n * BigInt(GIB), memoryUsed: 5n * BigInt(GIB), memoryReserved: 2n * BigInt(GIB) });
    expect(m.free).toBe(3 * GIB);
    expect(m.over).toBe(false);
    expect(m.segments.used).toBeCloseTo(0.5);
    expect(m.segments.reserved).toBeCloseTo(0.2);
    expect(m.segments.free).toBeCloseTo(0.3);
  });

  it("使用中 + 予約が全体を超えたら over。棒は使用中を優先して 1 に収める", () => {
    const m = machineMemory({ memoryTotal: 10, memoryUsed: 9, memoryReserved: 2 });
    expect(m.over).toBe(true);
    expect(m.shortage).toBe(1);
    expect(m.free).toBe(0);
    expect(m.segments.used).toBeCloseTo(0.9);
    expect(m.segments.reserved).toBeCloseTo(0.1);
    expect(m.segments.free).toBe(0);
  });

  it("使用中だけで全体を超えても壊れない", () => {
    const m = machineMemory({ memoryTotal: 10, memoryUsed: 12, memoryReserved: 2 });
    expect(m.segments).toEqual({ used: 1, reserved: 0, free: 0 });
    expect(m.shortage).toBe(4);
  });

  it("全体が 0（取れなかった）なら棒は空", () => {
    expect(machineMemory(undefined).segments).toEqual({ used: 0, reserved: 0, free: 0 });
  });
});

describe("pickFit", () => {
  it("M を優先し、なければ最初", () => {
    expect(pickFit([{ name: "s" }, { name: "m" }])?.name).toBe("m");
    expect(pickFit([{ name: "s" }, { name: "l" }])?.name).toBe("s");
    expect(pickFit([])).toBeUndefined();
  });
});
