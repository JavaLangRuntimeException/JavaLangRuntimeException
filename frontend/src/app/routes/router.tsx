import { createBrowserRouter, Navigate } from "react-router";
import { SiteLayout } from "@/app/layouts/SiteLayout";
import { isCalendarHost } from "@/shared/config/site";
import { NotFoundPage } from "@/pages/not-found";
import { loadChunk } from "@/shared/lib/stale-chunk";

// ページはルートごとに分割して読み込む（リリース直後の古いタブでチャンクが消えていたら 1 回だけ読み直す）
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await loadChunk(load)).default });

// gws.taramanji.com はカレンダー同期の管理画面専用（旧 middleware.ts と同じ振る舞い）
const calendarHostRoutes = [
  { path: "/admin", lazy: page(() => import("@/pages/admin-calendar-sync")) },
  { path: "/admin/login", lazy: page(() => import("@/pages/admin-login")) },
  { path: "/admin/*", element: <Navigate to="/admin" replace /> },
];

const siteRoutes = [
  { path: "/", lazy: page(() => import("@/pages/home")) },
  { path: "/link", lazy: page(() => import("@/pages/link")) },
  { path: "/blogs", lazy: page(() => import("@/pages/blogs")) },
  { path: "/portfolio", lazy: page(() => import("@/pages/portfolio")) },
  { path: "/contact", lazy: page(() => import("@/pages/contact")) },
  { path: "/reserve", lazy: page(() => import("@/pages/reserve")) },
  { path: "/location", lazy: page(() => import("@/pages/location")) },
  { path: "/questionnaire", lazy: page(() => import("@/pages/questionnaire")) },
  { path: "/privacy", lazy: page(() => import("@/pages/privacy")) },
  { path: "/calendar-sync", lazy: page(() => import("@/pages/calendar-sync")) },
  { path: "/admin", lazy: page(() => import("@/pages/admin")) },
  { path: "/admin/login", lazy: page(() => import("@/pages/admin-login")) },
];

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [...(isCalendarHost() ? calendarHostRoutes : siteRoutes), { path: "*", element: <NotFoundPage /> }],
  },
]);
