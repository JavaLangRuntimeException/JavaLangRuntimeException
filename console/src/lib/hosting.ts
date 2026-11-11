// 関数と API のフォームの計算。API の int64 は bigint で来るので、ここで number にそろえる
import { num } from "./capacity";

const MIB = 1024 ** 2;

export type TypeOption = { name: string; cpuMillis: number; memoryMib: number };

export type Limits = { minCpu: number; maxCpu: number; minMemoryMib: number; maxMemoryMib: number };

export type EnvRow = { name: string; value: string };

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
  return e;
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

export type ApiForm = { name: string; routes: RouteRow[] };

/** 新しく作るときは、全部のパス（/）を 1 つの関数に渡すところから始める */
export function emptyApiForm(functions: readonly string[]): ApiForm {
  return { name: "", routes: [{ path: "/", function: functions[0] ?? "" }] };
}

export function apiFormOf(spec: { name: string; routes: readonly { path: string; function: string }[] }): ApiForm {
  return { name: spec.name, routes: spec.routes.map((r) => ({ path: r.path, function: r.function })) };
}

export function apiSpecOf(form: ApiForm) {
  return { name: form.name.trim(), routes: form.routes.map((r) => ({ path: r.path.trim(), function: r.function })) };
}

const PATH_RE = /^\/[A-Za-z0-9._~/-]*$/;

export function apiFormErrors(form: ApiForm): Partial<Record<keyof ApiForm, string>> {
  const e: Partial<Record<keyof ApiForm, string>> = {};
  if (!NAME_RE.test(form.name.trim())) e.name = "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで";
  const paths = form.routes.map((r) => (r.path.trim().length > 1 ? r.path.trim().replace(/\/+$/, "") : r.path.trim()));
  if (form.routes.length === 0) e.routes = "ルートを 1 つ以上足してください";
  else if (paths.some((p) => !PATH_RE.test(p) || p.includes("//") || p.includes(".."))) e.routes = "パスは / で始め、英数字と . _ ~ - / にしてください";
  else if (new Set(paths).size !== paths.length) e.routes = "同じパスが 2 つあります";
  else if (form.routes.some((r) => r.function === "")) e.routes = "渡し先の関数を選んでください";
  return e;
}

/** 「5 分」「90 秒」 */
export function formatIdle(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} 分` : `${seconds} 秒`;
}

// ---- CDN ----

export type DistributionForm = { name: string; originType: "bucket" | "function"; origin: string; cacheSeconds: string; spa: boolean };

/** キャッシュの長さの選択肢（秒）。自由に入れることもできる */
export const cachePresets = [
  { seconds: 0, label: "キャッシュしない" },
  { seconds: 300, label: "5 分" },
  { seconds: 3600, label: "1 時間" },
  { seconds: 86400, label: "1 日" },
  { seconds: 31536000, label: "1 年" },
] as const;

export function emptyDistributionForm(buckets: readonly string[]): DistributionForm {
  return { name: "", originType: "bucket", origin: buckets[0] ?? "", cacheSeconds: "300", spa: false };
}

export function distributionFormOf(spec: { name: string; originType: string; origin: string; cacheSeconds: number; spa: boolean }): DistributionForm {
  return { name: spec.name, originType: spec.originType === "function" ? "function" : "bucket", origin: spec.origin, cacheSeconds: String(spec.cacheSeconds), spa: spec.spa };
}

export function distributionSpecOf(form: DistributionForm) {
  return { name: form.name.trim(), originType: form.originType, origin: form.origin, cacheSeconds: Number(form.cacheSeconds) || 0, spa: form.originType === "bucket" && form.spa };
}

export function distributionFormErrors(form: DistributionForm): Partial<Record<keyof DistributionForm, string>> {
  const e: Partial<Record<keyof DistributionForm, string>> = {};
  if (!NAME_RE.test(form.name.trim())) e.name = "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで";
  if (form.origin === "") e.origin = form.originType === "bucket" ? "元のバケットを選んでください" : "元の関数を選んでください";
  if (!isInt(form.cacheSeconds) || Number(form.cacheSeconds) > 31536000) e.cacheSeconds = "0〜31536000 秒（1 年）";
  return e;
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
