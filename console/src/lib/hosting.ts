// 関数と API のフォームの計算。API の int64 は bigint で来るので、ここで number にそろえる
import { num } from "./capacity";

const MIB = 1024 ** 2;

export type TypeOption = { name: string; cpuMillis: number; memoryMib: number };

export type Limits = { minCpu: number; maxCpu: number; minMemoryMib: number; maxMemoryMib: number };

export type EnvRow = { name: string; value: string };

/** 環境変数 name に、シークレット secret の値を入れる（YAML には値でなく、シークレットの名前だけが残る） */
export type SecretRow = { name: string; secret: string };

/** フォームの状態。数は入力の途中（空・範囲外）を持てるよう文字列で持つ */
export type FunctionForm = {
  name: string;
  image: string;
  port: string;
  instanceType: string;
  cpuMillis: string;
  memoryMib: string;
  env: EnvRow[];
  alerts: string[];
  notify: string[];
  /** つなぐデータベースとバケットの名前 */
  databases: string[];
  buckets: string[];
  /** 環境変数に入れるシークレット */
  secrets: SecretRow[];
};

type ApiType = { name: string; cpuMillis: bigint | number; memory: bigint | number };

export function typeOptions(types: readonly ApiType[]): TypeOption[] {
  return types.map((t) => ({ name: t.name, cpuMillis: num(t.cpuMillis), memoryMib: num(t.memory) / MIB }));
}

/** 新しく作るときの初期値。いちばん小さい型から始める（足りなければ上げる） */
export function emptyForm(types: readonly TypeOption[]): FunctionForm {
  const t = types[0];
  return {
    name: "",
    image: "",
    port: "8080",
    instanceType: t?.name ?? "",
    cpuMillis: t ? String(t.cpuMillis) : "",
    memoryMib: t ? String(t.memoryMib) : "",
    env: [],
    alerts: [],
    notify: [],
    databases: [],
    buckets: [],
    secrets: [],
  };
}

/** 型を選び直すと、CPU とメモリもその型の値に戻す（個別に変えるのはそのあと） */
export function withInstanceType(form: FunctionForm, type: TypeOption): FunctionForm {
  return { ...form, instanceType: type.name, cpuMillis: String(type.cpuMillis), memoryMib: String(type.memoryMib) };
}

/** 型の値から CPU・メモリを変えているか */
export function isCustom(form: Pick<FunctionForm, "instanceType" | "cpuMillis" | "memoryMib">, types: readonly TypeOption[]): boolean {
  const t = types.find((x) => x.name === form.instanceType);
  return !!t && (Number(form.cpuMillis) !== t.cpuMillis || Number(form.memoryMib) !== t.memoryMib);
}

type ApiSpec = {
  name: string;
  image: string;
  port: number;
  instanceType: string;
  cpuMillis: bigint | number;
  memory: bigint | number;
  env: readonly { name: string; value: string }[];
  alerts: readonly string[];
  notify: readonly string[];
  databases: readonly string[];
  buckets: readonly string[];
  secrets: readonly { name: string; secret: string }[];
};

export function formOf(spec: ApiSpec): FunctionForm {
  return {
    name: spec.name,
    image: spec.image,
    port: String(spec.port),
    instanceType: spec.instanceType,
    cpuMillis: String(num(spec.cpuMillis)),
    memoryMib: String(num(spec.memory) / MIB),
    env: spec.env.map((e) => ({ name: e.name, value: e.value })),
    alerts: [...spec.alerts],
    notify: [...spec.notify],
    databases: [...spec.databases],
    buckets: [...spec.buckets],
    secrets: spec.secrets.map((s) => ({ name: s.name, secret: s.secret })),
  };
}

/** API に送る形。名前が空の環境変数の行（足しただけの行）は送らない */
export function specOf(form: FunctionForm) {
  return {
    name: form.name.trim(),
    image: form.image.trim(),
    port: Number(form.port) || 0,
    instanceType: form.instanceType,
    cpuMillis: BigInt(Math.round(Number(form.cpuMillis) || 0)),
    memory: BigInt(Math.round(Number(form.memoryMib) || 0) * MIB),
    env: form.env.filter((e) => e.name.trim() !== "").map((e) => ({ name: e.name.trim(), value: e.value })),
    alerts: form.alerts,
    notify: form.notify,
    databases: form.databases,
    buckets: form.buckets,
    secrets: form.secrets.filter((s) => s.name.trim() !== "" || s.secret !== "").map((s) => ({ name: s.name.trim(), secret: s.secret })),
  };
}

const NAME_RE = /^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isInt = (s: string) => /^\d+$/.test(s.trim());

/** 送る前にわかる間違い（項目 → 一文）。API も同じことを確かめるので、ここは早く気づくためだけ */
export function formErrors(form: FunctionForm, limits: Limits): Partial<Record<keyof FunctionForm, string>> {
  const e: Partial<Record<keyof FunctionForm, string>> = {};
  if (!NAME_RE.test(form.name.trim())) e.name = "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで";
  if (form.image.trim() === "" || /\s/.test(form.image.trim())) e.image = "ghcr.io/owner/name:tag の形で指定してください";
  const port = Number(form.port);
  if (!isInt(form.port) || port < 1 || port > 65535) e.port = "1〜65535";
  const cpu = Number(form.cpuMillis);
  if (!isInt(form.cpuMillis) || cpu < limits.minCpu || cpu > limits.maxCpu) e.cpuMillis = `${limits.minCpu}〜${limits.maxCpu} ミリコア`;
  const mem = Number(form.memoryMib);
  if (!isInt(form.memoryMib) || mem < limits.minMemoryMib || mem > limits.maxMemoryMib)
    e.memoryMib = `${limits.minMemoryMib}〜${limits.maxMemoryMib} MiB`;
  const names = form.env.map((v) => v.name.trim()).filter((n) => n !== "");
  if (names.some((n) => !ENV_RE.test(n)) || new Set(names).size !== names.length) e.env = "名前は英数字と _ だけで、重複させないでください";
  const secretRows = form.secrets.filter((s) => s.name.trim() !== "" || s.secret !== "");
  const secretNames = secretRows.map((s) => s.name.trim());
  if (secretRows.some((s) => s.secret === "")) e.secrets = "シークレットを選んでください";
  else if (secretNames.some((n) => !ENV_RE.test(n) || names.includes(n)) || new Set(secretNames).size !== secretNames.length)
    e.secrets = "名前は英数字と _ だけで、ほかの環境変数と重複させないでください";
  return e;
}

/** 秘密らしい名前（KEY・TOKEN・SECRET・PASSWORD など）。ふつうの環境変数に入れると YAML（git）に平文で残るので、シークレットを勧める */
export function looksSecret(name: string): boolean {
  return /(^|_)(API_?KEY|KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASSCODE|PASS|PRIVATE|CREDENTIALS?)(_|$)/i.test(name.trim());
}

export function toggle(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 関数の状態の一文。0 台は「寝ている」（次のリクエストで起きる）で、異常ではない */
export function statusOf(fn: { deployed: boolean; ready: number; desired: number; problem: string }): { label: string; level: "ok" | "warn" | "bad" | "off" } {
  if (fn.problem) return { label: "YAML に問題", level: "bad" };
  if (!fn.deployed) return { label: "反映待ち", level: "warn" };
  if (fn.desired === 0) return { label: "待機中（0 台）", level: "off" };
  if (fn.ready >= fn.desired) return { label: "実行中", level: "ok" };
  return { label: "起動中", level: "warn" };
}

const notifyLabels: Record<string, string> = { mail: "メール（SES）", discord: "Discord" };

export function notifyLabel(channel: string): string {
  return notifyLabels[channel] ?? channel;
}

// ---- API ----

export type RouteRow = { path: string; function: string };

/** 認証: none（だれでも）/ api_key（x-api-key を API Gateway が確かめる） */
export type ApiAuth = "none" | "api_key";

/** corsOrigins は 1 行に 1 つ（https://x-storage-cloud.taramanji.com・http://localhost:5173・*） */
export type ApiForm = { name: string; routes: RouteRow[]; auth: ApiAuth; corsOrigins: string };

/** 新しく作るときは、全部のパス（/）を 1 つの関数に渡すところから始める */
export function emptyApiForm(functions: readonly string[]): ApiForm {
  return { name: "", routes: [{ path: "/", function: functions[0] ?? "" }], auth: "none", corsOrigins: "" };
}

export function apiFormOf(spec: { name: string; routes: readonly { path: string; function: string }[]; auth?: string; corsOrigins?: readonly string[] }): ApiForm {
  return {
    name: spec.name,
    routes: spec.routes.map((r) => ({ path: r.path, function: r.function })),
    auth: spec.auth === "api_key" ? "api_key" : "none",
    corsOrigins: (spec.corsOrigins ?? []).join("\n"),
  };
}

export function apiSpecOf(form: ApiForm) {
  return { name: form.name.trim(), routes: form.routes.map((r) => ({ path: r.path.trim(), function: r.function })), auth: form.auth, corsOrigins: originsOf(form.corsOrigins) };
}

/** 1 行に 1 つのオリジンを、小文字・末尾の / なし・重複なしにする */
export function originsOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/[\s,]+/)) {
    const o = line.trim().toLowerCase().replace(/\/+$/, "");
    if (o !== "" && !out.includes(o)) out.push(o);
  }
  return out;
}

const ORIGIN_RE = /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$/;

const PATH_RE = /^\/[A-Za-z0-9._~/-]*$/;

export function apiFormErrors(form: ApiForm): Partial<Record<keyof ApiForm, string>> {
  const e: Partial<Record<keyof ApiForm, string>> = {};
  if (!NAME_RE.test(form.name.trim())) e.name = "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで";
  const paths = form.routes.map((r) => (r.path.trim().length > 1 ? r.path.trim().replace(/\/+$/, "") : r.path.trim()));
  if (form.routes.length === 0) e.routes = "ルートを 1 つ以上足してください";
  else if (paths.some((p) => !PATH_RE.test(p) || p.includes("//") || p.includes(".."))) e.routes = "パスは / で始め、英数字と . _ ~ - / にしてください";
  else if (new Set(paths).size !== paths.length) e.routes = "同じパスが 2 つあります";
  else if (form.routes.some((r) => r.function === "")) e.routes = "渡し先の関数を選んでください";
  const origins = originsOf(form.corsOrigins);
  const bad = origins.find((o) => o !== "*" && !ORIGIN_RE.test(o));
  if (bad !== undefined) e.corsOrigins = `${bad} は https://example.com の形（パスなし）か * にしてください`;
  else if (origins.length > 10) e.corsOrigins = "10 個までです";
  return e;
}

/** 「5 分」「90 秒」 */
export function formatIdle(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} 分` : `${seconds} 秒`;
}

// ---- CDN ----

/** パスごとの元（CloudFront の behavior）。パスはそのまま元に渡る */
/** 元: バケットか API（API Gateway。関数は API を通して出す） */
export type OriginType = "bucket" | "api";

export type BehaviorForm = { path: string; originType: OriginType; origin: string; cacheSeconds: string; spa: boolean };

export type DistributionForm = {
  name: string;
  originType: OriginType;
  origin: string;
  cacheSeconds: string;
  spa: boolean;
  behaviors: BehaviorForm[];
  /** 独自ドメイン（<ラベル>.taramanji.com）。CDN を作ったあとに足せる */
  aliases: string[];
};

/** キャッシュの長さの選択肢（秒）。自由に入れることもできる */
export const cachePresets = [
  { seconds: 0, label: "キャッシュしない" },
  { seconds: 300, label: "5 分" },
  { seconds: 3600, label: "1 時間" },
  { seconds: 86400, label: "1 日" },
  { seconds: 31536000, label: "1 年" },
] as const;

/** 既定（/）のほかに足せるパスの数（HTTPRoute の rules は 16 まで） */
export const MAX_BEHAVIORS = 15;

export function emptyDistributionForm(buckets: readonly string[]): DistributionForm {
  return { name: "", originType: "bucket", origin: buckets[0] ?? "", cacheSeconds: "300", spa: false, behaviors: [], aliases: [] };
}

/** 足すパスの最初の値: API があれば /api → API（キャッシュしない）。なければバケット */
export function emptyBehavior(buckets: readonly string[], apis: readonly string[]): BehaviorForm {
  return apis.length > 0
    ? { path: "/api", originType: "api", origin: apis[0], cacheSeconds: "0", spa: false }
    : { path: "/", originType: "bucket", origin: buckets[0] ?? "", cacheSeconds: "300", spa: false };
}

type OriginSpec = { originType: string; origin: string; cacheSeconds: number; spa: boolean };

export function distributionFormOf(spec: OriginSpec & { name: string; behaviors?: (OriginSpec & { path: string })[]; aliases?: readonly string[] }): DistributionForm {
  const type = (t: string): OriginType => (t === "api" ? "api" : "bucket");
  return {
    name: spec.name,
    originType: type(spec.originType),
    origin: spec.origin,
    cacheSeconds: String(spec.cacheSeconds),
    spa: spec.spa,
    behaviors: (spec.behaviors ?? []).map((b) => ({ path: b.path, originType: type(b.originType), origin: b.origin, cacheSeconds: String(b.cacheSeconds), spa: b.spa })),
    aliases: [...(spec.aliases ?? [])],
  };
}

/** 独自ドメインのラベル（<ラベル>.taramanji.com の <ラベル>）。予約した名前とホスト名の形はサーバーでも確かめる */
export function aliasLabelError(label: string): string | undefined {
  const l = label.trim().toLowerCase();
  if (!NAME_RE.test(l)) return "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで（. は使えません）";
  if (l.startsWith("cloud") || l.includes("-cloud")) return "taramanji cloud のホスト名の形は使えません";
  return undefined;
}

export function distributionSpecOf(form: DistributionForm) {
  return {
    name: form.name.trim(),
    originType: form.originType,
    origin: form.origin,
    cacheSeconds: Number(form.cacheSeconds) || 0,
    spa: form.originType === "bucket" && form.spa,
    behaviors: form.behaviors.map((b) => ({
      path: normalizePath(b.path),
      originType: b.originType,
      origin: b.origin,
      cacheSeconds: Number(b.cacheSeconds) || 0,
      spa: b.originType === "bucket" && b.spa,
    })),
    aliases: form.aliases,
  };
}

function normalizePath(p: string): string {
  const t = p.trim();
  return t.length > 1 ? t.replace(/\/+$/, "") : t;
}

export type DistributionFormErrors = Partial<Record<Exclude<keyof DistributionForm, "behaviors">, string>> & { behaviors?: Record<number, string> };

export function distributionFormErrors(form: DistributionForm): DistributionFormErrors {
  const e: DistributionFormErrors = {};
  if (!NAME_RE.test(form.name.trim())) e.name = "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで";
  if (form.origin === "") e.origin = form.originType === "bucket" ? "元のバケットを選んでください" : "元の API を選んでください";
  if (!isCache(form.cacheSeconds)) e.cacheSeconds = "0〜31536000 秒（1 年）";
  const rows: Record<number, string> = {};
  const seen = new Set<string>();
  form.behaviors.forEach((b, i) => {
    const p = normalizePath(b.path);
    if (p === "/") rows[i] = "/ は既定の元です。ほかのパスにしてください";
    else if (!PATH_RE.test(p) || p.includes("//") || p.includes("..")) rows[i] = "パスは / で始め、英数字と . _ ~ - / にしてください";
    else if (seen.has(p)) rows[i] = "パスが重複しています";
    else if (b.origin === "") rows[i] = b.originType === "bucket" ? "元のバケットを選んでください" : "元の API を選んでください";
    else if (!isCache(b.cacheSeconds)) rows[i] = "キャッシュは 0〜31536000 秒（1 年）";
    seen.add(p);
  });
  if (form.behaviors.length > MAX_BEHAVIORS) rows[MAX_BEHAVIORS] = `パスごとの元は ${MAX_BEHAVIORS} 個までです`;
  if (Object.keys(rows).length > 0) e.behaviors = rows;
  return e;
}

function isCache(v: string): boolean {
  return isInt(v) && Number(v) <= 31536000;
}

/** 「5 分」「1 時間」「90 秒」「キャッシュしない」 */
export function formatCache(seconds: number): string {
  if (seconds <= 0) return "キャッシュしない";
  for (const [unit, label] of [[86400, "日"], [3600, "時間"], [60, "分"]] as const) {
    if (seconds % unit === 0) return `${seconds / unit} ${label}`;
  }
  return `${seconds} 秒`;
}

// ---- オブジェクト ----

export type Entry = { name: string; key: string; folder: boolean; size: number; modifiedMs: number; count: number };

/** prefix の直下を、フォルダー（/ で区切った次の階層）とファイルに分ける。フォルダーが先、名前の順 */
export function entriesOf(objects: readonly { key: string; size: bigint | number; modifiedMs: bigint | number }[], prefix: string): Entry[] {
  const folders = new Map<string, Entry>();
  const files: Entry[] = [];
  for (const o of objects) {
    if (!o.key.startsWith(prefix)) continue;
    const rest = o.key.slice(prefix.length);
    const i = rest.indexOf("/");
    if (i < 0) {
      files.push({ name: rest, key: o.key, folder: false, size: num(o.size), modifiedMs: num(o.modifiedMs), count: 1 });
      continue;
    }
    const name = rest.slice(0, i);
    const f = folders.get(name) ?? { name, key: prefix + name + "/", folder: true, size: 0, modifiedMs: 0, count: 0 };
    f.size += num(o.size);
    f.count += 1;
    f.modifiedMs = Math.max(f.modifiedMs, num(o.modifiedMs));
    folders.set(name, f);
  }
  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);
  return [...[...folders.values()].sort(byName), ...files.sort(byName)];
}

/** パンくず: "a/b/" → [{name:"a", prefix:"a/"}, {name:"b", prefix:"a/b/"}] */
export function crumbsOf(prefix: string): { name: string; prefix: string }[] {
  const parts = prefix.split("/").filter((p) => p !== "");
  return parts.map((name, i) => ({ name, prefix: parts.slice(0, i + 1).join("/") + "/" }));
}

// ---- つなぎ込み ----

/** 名前を環境変数に使える形にする（main-db → MAIN_DB）。API（Go の envToken）と同じ */
export function envToken(name: string): string {
  return name.replaceAll("-", "_").toUpperCase();
}

/** つないだ関数に入る環境変数の接頭辞（DB_MAIN_ / BUCKET_SITE_） */
export function envPrefix(kind: "database" | "bucket", name: string): string {
  return `${kind === "database" ? "DB" : "BUCKET"}_${envToken(name)}_`;
}

const engineLabels: Record<string, string> = { postgres: "PostgreSQL", redis: "Redis" };

export function engineLabel(engine: string): string {
  return engineLabels[engine] ?? engine;
}

/** データベースの状態。ready 以外で pending でもないものは、コントローラーが書いたエラーの理由 */
export function databaseStatus(db: { ready: boolean; status: string; problem: string }): { label: string; level: "ok" | "warn" | "bad"; detail?: string } {
  if (db.problem) return { label: "YAML に問題", level: "bad", detail: db.problem };
  if (db.ready) return { label: "使用可能", level: "ok" };
  if (db.status === "" || db.status === "pending") return { label: "作成中", level: "warn" };
  return { label: "エラー", level: "bad", detail: db.status };
}

/** シークレットの状態の一文。作成中は、Sealed Secrets がまだ復号していない（数秒〜数十秒） */
export function secretStatus(secret: { ready: boolean; status: string; problem: string }): { label: string; level: "ok" | "warn" | "bad"; detail?: string } {
  if (secret.problem) return { label: "YAML に問題", level: "bad", detail: secret.problem };
  if (secret.ready) return { label: "使用可能", level: "ok" };
  if (secret.status === "" || secret.status === "pending") return { label: "作成中", level: "warn" };
  return { label: "復号できません", level: "bad", detail: `${secret.status}（値を上書きすると直ります）` };
}

/** 値の前後の空白・改行（貼り付けで入りやすい）。そのまま保存されるので、気づけるように一文を返す */
export function secretValueNote(value: string): string | undefined {
  if (value === "" || value.trim() === value) return undefined;
  return "前後に空白か改行があります。そのまま保存されます（要らなければ消してください）";
}

// ---- インスタンスタイプの系統 ----

/** 「c1.large」の「c1」 */
export function familyOf(name: string): string {
  return name.split(".")[0] ?? name;
}

/** 系統の名前（API の instanceFamilies が読めないときの控え。API と同じ） */
export const familyLabels: Record<string, string> = { t1: "汎用", c1: "コンピューティング最適化", r1: "メモリ最適化" };

/** 型を系統ごとにまとめる。系統の順は order（なければ出てきた順） */
export function groupByFamily<T extends { name: string }>(items: readonly T[], order: readonly string[] = []): { family: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const f of order) groups.set(f, []);
  for (const it of items) {
    const f = familyOf(it.name);
    groups.set(f, [...(groups.get(f) ?? []), it]);
  }
  return [...groups.entries()].filter(([, v]) => v.length > 0).map(([family, items]) => ({ family, items }));
}
