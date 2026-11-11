import { describe, expect, it } from "vitest";
import { cachePresets, crumbsOf, distributionFormErrors, distributionFormOf, distributionSpecOf, emptyDistributionForm, entriesOf, formatCache } from "./hosting";
import { apiFormErrors, apiFormOf, apiSpecOf, emptyApiForm, emptyForm, formatIdle, formErrors, formOf, isCustom, specOf, statusOf, toggle, typeOptions, withInstanceType } from "./hosting";

const MIB = 1024 ** 2;
const types = typeOptions([
  { name: "t1.small", cpuMillis: 100n, memory: BigInt(128 * MIB) },
  { name: "t1.medium", cpuMillis: 250n, memory: BigInt(256 * MIB) },
]);
const limits = { minCpu: 10, maxCpu: 1000, minMemoryMib: 16, maxMemoryMib: 1024 };

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
    expect(spec).toMatchObject({ name: "blog", port: 8080, cpuMillis: 100n, memory: BigInt(128 * MIB), env: [{ name: "MODE", value: "prod" }] });
    expect(formOf(spec)).toMatchObject({ name: "blog", cpuMillis: "100", memoryMib: "128", alerts: ["cpu-high"], notify: ["discord"] });
  });
});

describe("formErrors", () => {
  const ok = { ...emptyForm(types), name: "blog", image: "ghcr.io/me/blog:v1" };
  it("正しければ空", () => {
    expect(formErrors(ok, limits)).toEqual({});
  });
  it("項目ごとに間違いを返す", () => {
    const e = formErrors({ ...ok, name: "Blog", image: "a b", port: "0", cpuMillis: "1001", memoryMib: "8", env: [{ name: "A", value: "" }, { name: "A", value: "" }] }, limits);
    expect(Object.keys(e).sort()).toEqual(["cpuMillis", "env", "image", "memoryMib", "name", "port"]);
  });
});

describe("statusOf / toggle", () => {
  it("状態を一文にする。0 台は異常ではない", () => {
    expect(statusOf({ deployed: false, ready: 0, desired: 0, problem: "" }).label).toBe("反映待ち");
    expect(statusOf({ deployed: true, ready: 1, desired: 1, problem: "" })).toEqual({ label: "実行中", level: "ok" });
    expect(statusOf({ deployed: true, ready: 0, desired: 1, problem: "" }).label).toBe("起動中");
    expect(statusOf({ deployed: true, ready: 0, desired: 0, problem: "" })).toEqual({ label: "待機中（0 台）", level: "off" });
    expect(statusOf({ deployed: true, ready: 1, desired: 1, problem: "x" }).level).toBe("bad");
  });
  it("選択を入れ替える", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("API のフォーム", () => {
  it("全部のパスを最初の関数に渡すところから始める", () => {
    expect(emptyApiForm(["blog", "api"])).toEqual({ name: "", routes: [{ path: "/", function: "blog" }] });
    expect(emptyApiForm([]).routes[0].function).toBe("");
  });
  it("API の形にして、読み戻せる", () => {
    const form = { name: " shop ", routes: [{ path: " /api ", function: "api" }] };
    expect(apiSpecOf(form)).toEqual({ name: "shop", routes: [{ path: "/api", function: "api" }] });
    expect(apiFormOf(apiSpecOf(form))).toEqual({ name: "shop", routes: [{ path: "/api", function: "api" }] });
  });
  it("間違いを返す", () => {
    const ok = { name: "shop", routes: [{ path: "/", function: "blog" }] };
    expect(apiFormErrors(ok)).toEqual({});
    expect(apiFormErrors({ ...ok, name: "Shop" }).name).toBeDefined();
    expect(apiFormErrors({ ...ok, routes: [] }).routes).toBeDefined();
    expect(apiFormErrors({ ...ok, routes: [{ path: "api", function: "blog" }] }).routes).toBeDefined();
    expect(apiFormErrors({ ...ok, routes: [{ path: "/a", function: "blog" }, { path: "/a/", function: "blog" }] }).routes).toBe("同じパスが 2 つあります");
    expect(apiFormErrors({ ...ok, routes: [{ path: "/", function: "" }] }).routes).toBeDefined();
  });
  it("待機までの時間", () => {
    expect(formatIdle(300)).toBe("5 分");
    expect(formatIdle(90)).toBe("90 秒");
  });
});

describe("CDN のフォーム", () => {
  it("最初のバケットを元にして、5 分のキャッシュから始める", () => {
    expect(emptyDistributionForm(["site"])).toMatchObject({ originType: "bucket", origin: "site", cacheSeconds: "300", spa: false });
  });
  it("API の形にして、読み戻せる。関数が元なら SPA は付けない", () => {
    const form = { name: " www ", originType: "function" as const, origin: "blog", cacheSeconds: "60", spa: true };
    const spec = distributionSpecOf(form);
    expect(spec).toEqual({ name: "www", originType: "function", origin: "blog", cacheSeconds: 60, spa: false });
    expect(distributionFormOf(spec)).toEqual({ name: "www", originType: "function", origin: "blog", cacheSeconds: "60", spa: false });
  });
  it("間違いを返す", () => {
    const ok = { ...emptyDistributionForm(["site"]), name: "www" };
    expect(distributionFormErrors(ok)).toEqual({});
    expect(Object.keys(distributionFormErrors({ ...ok, name: "WWW", origin: "", cacheSeconds: "x" })).sort()).toEqual(["cacheSeconds", "name", "origin"]);
  });
  it("キャッシュの長さを読みやすくする", () => {
    expect(cachePresets.map((p) => formatCache(p.seconds))).toEqual(["キャッシュしない", "5 分", "1 時間", "1 日", "365 日"]);
    expect(formatCache(90)).toBe("90 秒");
  });
});

describe("オブジェクトの一覧", () => {
  const objects = [
    { key: "index.html", size: 10n, modifiedMs: 1n },
    { key: "assets/app.js", size: 20n, modifiedMs: 3n },
    { key: "assets/img/logo.svg", size: 5n, modifiedMs: 2n },
  ];
  it("直下をフォルダーとファイルに分ける", () => {
    expect(entriesOf(objects, "")).toEqual([
      { name: "assets", key: "assets/", folder: true, size: 25, modifiedMs: 3, count: 2 },
      { name: "index.html", key: "index.html", folder: false, size: 10, modifiedMs: 1, count: 1 },
    ]);
    expect(entriesOf(objects, "assets/").map((e) => e.name)).toEqual(["img", "app.js"]);
  });
  it("パンくず", () => {
    expect(crumbsOf("")).toEqual([]);
    expect(crumbsOf("assets/img/")).toEqual([{ name: "assets", prefix: "assets/" }, { name: "img", prefix: "assets/img/" }]);
  });
});
