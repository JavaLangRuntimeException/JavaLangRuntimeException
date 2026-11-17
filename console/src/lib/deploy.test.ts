import { describe, expect, it } from "vitest";
import { ago, deployState, deploymentOf } from "./deploy";

const d = { kind: "functions", name: "blog", state: "applied", message: "", revision: "abc1234", commit: "def5678", atMs: 0n };

describe("デプロイの様子", () => {
  it("状態を一文にする", () => {
    expect(deployState(undefined).label).toBe("反映待ち");
    expect(deployState(d, "abc1234ffff")).toEqual({ label: "反映済み", level: "ok", detail: undefined });
    expect(deployState(d, "9999999ffff").label).toBe("反映待ち");
    expect(deployState({ ...d, state: "invalid", message: "x", revision: "9999999" }, "abc1234").level).toBe("bad");
    expect(deployState({ ...d, state: "waiting", message: "namespace" }).detail).toBe("namespace");
  });
  it("種類と名前で引く", () => {
    expect(deploymentOf([d], "functions", "blog")).toBe(d);
    expect(deploymentOf([d], "apis", "blog")).toBeUndefined();
  });
  it("経過時間", () => {
    expect(ago(0, 30_000)).toBe("30 秒前");
    expect(ago(0, 5 * 60_000)).toBe("5 分前");
    expect(ago(0, 3 * 3600_000)).toBe("3 時間前");
  });
});
