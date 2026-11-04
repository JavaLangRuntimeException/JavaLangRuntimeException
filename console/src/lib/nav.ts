// 左のナビの項目。画面を足すときはここと app/router.tsx に足す

export type NavItem = { to: string; label: string; children?: NavItem[] };

export const hostingKinds = [
  { kind: "containers", label: "コンテナ" },
  { kind: "functions", label: "関数" },
  { kind: "instances", label: "インスタンス" },
] as const;

export type HostingKind = (typeof hostingKinds)[number]["kind"];

export const navItems: NavItem[] = [
  { to: "/", label: "概要" },
  { to: "/capacity", label: "容量" },
  { to: "/metrics", label: "メトリクス" },
  { to: "/storage", label: "ストレージ" },
  {
    to: "/hosting",
    label: "ホスティング",
    children: hostingKinds.map((k) => ({ to: `/hosting/${k.kind}`, label: k.label })),
  },
];
