// 左のナビの項目。画面を足すときはここと app/router.tsx に足す

export type NavItem = { to: string; label: string; children?: NavItem[] };

export const navItems: NavItem[] = [
  { to: "/", label: "概要" },
  { to: "/capacity", label: "容量" },
  { to: "/metrics", label: "メトリクス" },
  { to: "/functions", label: "関数" },
  { to: "/apis", label: "API Gateway" },
  { to: "/storage", label: "ストレージ" },
  { to: "/cdn", label: "CDN" },
];
