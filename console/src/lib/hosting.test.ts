import { describe, expect, it } from "vitest";
import { emptyForm, formErrors, formOf, isCustom, specOf, statusOf, toggle, typeOptions, withInstanceType } from "./hosting";

const MIB = 1024 ** 2;
const types = typeOptions([
  { name: "t1.small", cpuMillis: 100n, memory: BigInt(128 * MIB) },
  { name: "t1.medium", cpuMillis: 250n, memory: BigInt(256 * MIB) },
]);
const limits = { minCpu: 10, maxCpu: 1000, minMemoryMib: 16, maxMemoryMib: 1024, maxReplicas: 3 };

describe("インスタンスタイプ", () => {
  it("型を選ぶと CPU とメモリが決まり、あとから個別に変えられる", () => {
    let form = emptyForm(types);
    expect(form).toMatchObject({ instanceType: "t1.small", cpuMillis: "100", memoryMib: "128" });
    form = withInstanceType(form, types[1]);
    expect(form).toMatchObject({ instanceType: "t1.medium", cpuMillis: "250", memoryMib: "256" });
    expect(isCustom(form, types)).toBe(false);
    form = { ...form, memoryMib: "300" };
    expect(isCustom(form, types)).toBe(true);
    // 型を選び直すと、個別に変えた値は型の値に戻る
    expect(isCustom(withInstanceType(form, types[0]), types)).toBe(false);
  });
});

describe("specOf / formOf", () => {
  it("フォームを API の形にして、読み戻せる", () => {
    const form = { ...emptyForm(types), name: " blog ", image: "ghcr.io/me/blog:v1", env: [{ name: "MODE", value: "prod" }, { name: " ", value: "x" }], alerts: ["cpu-high"], notify: ["discord"] };
    const spec = specOf(form);
    expect(spec).toMatchObject({ name: "blog", port: 8080, replicas: 1, cpuMillis: 100n, memory: BigInt(128 * MIB), env: [{ name: "MODE", value: "prod" }] });
    expect(formOf(spec)).toMatchObject({ name: "blog", cpuMillis: "100", memoryMib: "128", alerts: ["cpu-high"], notify: ["discord"] });
  });
});

describe("formErrors", () => {
  const ok = { ...emptyForm(types), name: "blog", image: "ghcr.io/me/blog:v1" };
  it("正しければ空", () => {
    expect(formErrors(ok, limits)).toEqual({});
    expect(formErrors({ ...ok, replicas: "0" }, limits)).toEqual({});
  });
  it("項目ごとに間違いを返す", () => {
    const e = formErrors({ ...ok, name: "Blog", image: "a b", port: "0", replicas: "4", cpuMillis: "1001", memoryMib: "8", env: [{ name: "A", value: "" }, { name: "A", value: "" }] }, limits);
    expect(Object.keys(e).sort()).toEqual(["cpuMillis", "env", "image", "memoryMib", "name", "port", "replicas"]);
  });
});

describe("statusOf / toggle", () => {
  it("状態を一文にする", () => {
    expect(statusOf({ deployed: false, ready: 0, desired: 0, problem: "" }).label).toBe("反映待ち");
    expect(statusOf({ deployed: true, ready: 2, desired: 2, problem: "" })).toEqual({ label: "稼働中 2/2", level: "ok" });
    expect(statusOf({ deployed: true, ready: 0, desired: 2, problem: "" }).level).toBe("bad");
    expect(statusOf({ deployed: true, ready: 0, desired: 0, problem: "" }).label).toBe("停止中");
    expect(statusOf({ deployed: true, ready: 2, desired: 2, problem: "x" }).level).toBe("bad");
  });
  it("選択を入れ替える", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});
