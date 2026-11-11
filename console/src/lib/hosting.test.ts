import { describe, expect, it } from "vitest";
import { databaseStatus, engineLabel, envPrefix, familyOf, groupByFamily } from "./hosting";
import { aliasLabelError, cachePresets, crumbsOf, distributionFormErrors, distributionFormOf, distributionSpecOf, emptyBehavior, emptyDistributionForm, entriesOf, formatCache, MAX_BEHAVIORS } from "./hosting";
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
    const form = { ...emptyForm(types), name: " blog ", image: "ghcr.io/me/blog:v1", env: [{ name: "MODE", value: "prod" }, { name: " ", value: "x" }], alerts: ["cpu-high"], notify: ["discord"], databases: ["main"], buckets: ["site"] };
    const spec = specOf(form);
    expect(spec).toMatchObject({ name: "blog", port: 8080, cpuMillis: 100n, memory: BigInt(128 * MIB), env: [{ name: "MODE", value: "prod" }] });
    expect(formOf(spec)).toMatchObject({ name: "blog", cpuMillis: "100", memoryMib: "128", alerts: ["cpu-high"], notify: ["discord"], databases: ["main"], buckets: ["site"] });
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
    expect(emptyApiForm(["blog", "api"])).toEqual({ name: "", routes: [{ path: "/", function: "blog" }], auth: "none", corsOrigins: "" });
    expect(emptyApiForm([]).routes[0].function).toBe("");
  });
  it("API の形にして、読み戻せる", () => {
    const form = { name: " shop ", routes: [{ path: " /api ", function: "api" }], auth: "api_key" as const, corsOrigins: "https://Front-storage-cloud.taramanji.com/\n\nhttp://localhost:5173, https://front-storage-cloud.taramanji.com" };
    expect(apiSpecOf(form)).toEqual({
      name: "shop",
      routes: [{ path: "/api", function: "api" }],
      auth: "api_key",
      corsOrigins: ["https://front-storage-cloud.taramanji.com", "http://localhost:5173"],
    });
    expect(apiFormOf(apiSpecOf(form))).toEqual({
      name: "shop",
      routes: [{ path: "/api", function: "api" }],
      auth: "api_key",
      corsOrigins: "https://front-storage-cloud.taramanji.com\nhttp://localhost:5173",
    });
  });
  it("間違いを返す", () => {
    const ok = { name: "shop", routes: [{ path: "/", function: "blog" }], auth: "none" as const, corsOrigins: "*" };
    expect(apiFormErrors(ok)).toEqual({});
    expect(apiFormErrors({ ...ok, name: "Shop" }).name).toBeDefined();
    expect(apiFormErrors({ ...ok, routes: [] }).routes).toBeDefined();
    expect(apiFormErrors({ ...ok, routes: [{ path: "api", function: "blog" }] }).routes).toBeDefined();
    expect(apiFormErrors({ ...ok, routes: [{ path: "/a", function: "blog" }, { path: "/a/", function: "blog" }] }).routes).toBe("同じパスが 2 つあります");
    expect(apiFormErrors({ ...ok, routes: [{ path: "/", function: "" }] }).routes).toBeDefined();
    expect(apiFormErrors({ ...ok, corsOrigins: "https://a.example.com/path" }).corsOrigins).toContain("https://a.example.com/path");
    expect(apiFormErrors({ ...ok, corsOrigins: "a.example.com" }).corsOrigins).toBeDefined();
    expect(apiFormErrors({ ...ok, corsOrigins: "http://localhost:5173\nhttps://a.example.com" })).toEqual({});
  });
  it("待機までの時間", () => {
    expect(formatIdle(300)).toBe("5 分");
    expect(formatIdle(90)).toBe("90 秒");
  });
});

describe("CDN のフォーム", () => {
  it("最初のバケットを元にして、5 分のキャッシュから始める", () => {
    expect(emptyDistributionForm(["site"])).toMatchObject({ originType: "bucket", origin: "site", cacheSeconds: "300", spa: false, aliases: [] });
  });
  it("API の形にして、読み戻せる。API が元なら SPA は付けない", () => {
    const form = { name: " www ", originType: "api" as const, origin: "blog", cacheSeconds: "60", spa: true, behaviors: [], aliases: ["qa.taramanji.com"] };
    const spec = distributionSpecOf(form);
    expect(spec).toEqual({ name: "www", originType: "api", origin: "blog", cacheSeconds: 60, spa: false, behaviors: [], aliases: ["qa.taramanji.com"] });
    expect(distributionFormOf(spec)).toEqual({ name: "www", originType: "api", origin: "blog", cacheSeconds: "60", spa: false, behaviors: [], aliases: ["qa.taramanji.com"] });
  });
  it("間違いを返す", () => {
    const ok = { ...emptyDistributionForm(["site"]), name: "www" };
    expect(distributionFormErrors(ok)).toEqual({});
    expect(Object.keys(distributionFormErrors({ ...ok, name: "WWW", origin: "", cacheSeconds: "x" })).sort()).toEqual(["cacheSeconds", "name", "origin"]);
  });
  it("パスごとの元: 末尾の / を落として送り、API には SPA を付けない", () => {
    const form = { ...emptyDistributionForm(["front"]), name: "vrst", behaviors: [{ path: " /api/ ", originType: "api" as const, origin: "backend", cacheSeconds: "0", spa: true }] };
    const spec = distributionSpecOf(form);
    expect(spec.behaviors).toEqual([{ path: "/api", originType: "api", origin: "backend", cacheSeconds: 0, spa: false }]);
    expect(distributionFormOf(spec).behaviors).toEqual([{ path: "/api", originType: "api", origin: "backend", cacheSeconds: "0", spa: false }]);
    expect(distributionFormErrors(form)).toEqual({});
  });
  it("独自ドメインのラベルを確かめる", () => {
    expect(aliasLabelError("qa")).toBeUndefined();
    expect(aliasLabelError("QA ")).toBeUndefined();
    for (const bad of ["", "a.b", "x-cdn-cloud", "cloud", "cloud-stg", "-x", "*"]) expect(aliasLabelError(bad)).toBeDefined();
  });
  it("足すパスの最初の値は、API があれば /api → API", () => {
    expect(emptyBehavior(["front"], ["backend"])).toMatchObject({ path: "/api", originType: "api", origin: "backend", cacheSeconds: "0" });
    expect(emptyBehavior(["front"], [])).toMatchObject({ originType: "bucket", origin: "front" });
  });
  it("パスごとの元の間違いを、行ごとに返す", () => {
    const row = { path: "/api", originType: "api" as const, origin: "backend", cacheSeconds: "0", spa: false };
    const form = {
      ...emptyDistributionForm(["front"]),
      name: "vrst",
      behaviors: [row, { ...row, path: "/api/" }, { ...row, path: "/" }, { ...row, path: "/a b" }, { ...row, path: "/x", origin: "" }, { ...row, path: "/y", cacheSeconds: "99999999" }],
    };
    expect(Object.keys(distributionFormErrors(form).behaviors ?? {})).toEqual(["1", "2", "3", "4", "5"]);
    const many = { ...form, behaviors: Array.from({ length: MAX_BEHAVIORS + 1 }, (_, i) => ({ ...row, path: `/p${i}` })) };
    expect(distributionFormErrors(many).behaviors?.[MAX_BEHAVIORS]).toContain("15 個まで");
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

describe("つなぎ込み", () => {
  it("環境変数の接頭辞", () => {
    expect(envPrefix("database", "main-db")).toBe("DB_MAIN_DB_");
    expect(envPrefix("bucket", "site")).toBe("BUCKET_SITE_");
    expect(engineLabel("postgres")).toBe("PostgreSQL");
  });
  it("データベースの状態", () => {
    expect(databaseStatus({ ready: true, status: "ready", problem: "" }).label).toBe("使用可能");
    expect(databaseStatus({ ready: false, status: "pending", problem: "" }).label).toBe("作成中");
    expect(databaseStatus({ ready: false, status: "postgres に作れませんでした", problem: "" })).toEqual({ label: "エラー", level: "bad", detail: "postgres に作れませんでした" });
    expect(databaseStatus({ ready: false, status: "", problem: "x" }).level).toBe("bad");
  });
});

describe("インスタンスタイプの系統", () => {
  it("系統ごとにまとめる", () => {
    expect(familyOf("c1.large")).toBe("c1");
    const g = groupByFamily([{ name: "t1.small" }, { name: "r1.small" }, { name: "c1.small" }, { name: "t1.large" }], ["t1", "c1", "r1"]);
    expect(g.map((x) => [x.family, x.items.map((i) => i.name)])).toEqual([
      ["t1", ["t1.small", "t1.large"]],
      ["c1", ["c1.small"]],
      ["r1", ["r1.small"]],
    ]);
  });
});
