// ホスティング（コンテナ）のフォームの計算。API の int64 は bigint で来るので、ここで number にそろえる
import { num } from "./capacity";

const MIB = 1024 ** 2;

export type TypeOption = { name: string; cpuMillis: number; memoryMib: number };

export type Limits = { minCpu: number; maxCpu: number; minMemoryMib: number; maxMemoryMib: number; maxReplicas: number };

export type EnvRow = { name: string; value: string };

/** フォームの状態。数は入力の途中（空・範囲外）を持てるよう文字列で持つ */
export type AppForm = {
  name: string;
  image: string;
  port: string;
  replicas: string;
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
export function emptyForm(types: readonly TypeOption[]): AppForm {
  const t = types[0];
  return {
    name: "",
    image: "",
    port: "8080",
    replicas: "1",
    instanceType: t?.name ?? "",
    cpuMillis: t ? String(t.cpuMillis) : "",
    memoryMib: t ? String(t.memoryMib) : "",
    env: [],
    alerts: [],
    notify: [],
  };
}

/** 型を選び直すと、CPU とメモリもその型の値に戻す（個別に変えるのはそのあと） */
export function withInstanceType(form: AppForm, type: TypeOption): AppForm {
  return { ...form, instanceType: type.name, cpuMillis: String(type.cpuMillis), memoryMib: String(type.memoryMib) };
}

/** 型の値から CPU・メモリを変えているか */
export function isCustom(form: Pick<AppForm, "instanceType" | "cpuMillis" | "memoryMib">, types: readonly TypeOption[]): boolean {
  const t = types.find((x) => x.name === form.instanceType);
  return !!t && (Number(form.cpuMillis) !== t.cpuMillis || Number(form.memoryMib) !== t.memoryMib);
}

type ApiSpec = {
  name: string;
  image: string;
  port: number;
  replicas: number;
  instanceType: string;
  cpuMillis: bigint | number;
  memory: bigint | number;
  env: readonly { name: string; value: string }[];
  alerts: readonly string[];
  notify: readonly string[];
};

export function formOf(spec: ApiSpec): AppForm {
  return {
    name: spec.name,
    image: spec.image,
    port: String(spec.port),
    replicas: String(spec.replicas),
    instanceType: spec.instanceType,
    cpuMillis: String(num(spec.cpuMillis)),
    memoryMib: String(num(spec.memory) / MIB),
    env: spec.env.map((e) => ({ name: e.name, value: e.value })),
    alerts: [...spec.alerts],
    notify: [...spec.notify],
  };
}

/** API に送る形。名前が空の環境変数の行（足しただけの行）は送らない */
export function specOf(form: AppForm) {
  return {
    name: form.name.trim(),
    image: form.image.trim(),
    port: Number(form.port) || 0,
    replicas: Number(form.replicas) || 0,
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
export function formErrors(form: AppForm, limits: Limits): Partial<Record<keyof AppForm, string>> {
  const e: Partial<Record<keyof AppForm, string>> = {};
  if (!NAME_RE.test(form.name.trim())) e.name = "英小文字で始め、英小文字・数字・ハイフンで 40 文字まで";
  if (form.image.trim() === "" || /\s/.test(form.image.trim())) e.image = "ghcr.io/owner/name:tag の形で指定してください";
  const port = Number(form.port);
  if (!isInt(form.port) || port < 1 || port > 65535) e.port = "1〜65535";
  const replicas = Number(form.replicas);
  if (!isInt(form.replicas) || replicas > limits.maxReplicas) e.replicas = `0〜${limits.maxReplicas}`;
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

/** アプリの状態の一文。deployed = false は、YAML は保存済みで Argo CD がまだ入れていない */
export function statusOf(app: { deployed: boolean; ready: number; desired: number; problem: string }): { label: string; level: "ok" | "warn" | "bad" | "off" } {
  if (app.problem) return { label: "YAML に問題", level: "bad" };
  if (!app.deployed) return { label: "反映待ち", level: "warn" };
  if (app.desired === 0) return { label: "停止中", level: "off" };
  if (app.ready >= app.desired) return { label: `稼働中 ${app.ready}/${app.desired}`, level: "ok" };
  return { label: `起動中 ${app.ready}/${app.desired}`, level: app.ready === 0 ? "bad" : "warn" };
}

const notifyLabels: Record<string, string> = { mail: "メール（SES）", discord: "Discord" };

export function notifyLabel(channel: string): string {
  return notifyLabels[channel] ?? channel;
}
