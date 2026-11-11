import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/AppShell";
import { CapacityPage } from "@/pages/CapacityPage";
import { ApisPage } from "@/pages/ApisPage";
import { CdnPage } from "@/pages/CdnPage";
import { DatabasesPage } from "@/pages/DatabasesPage";
import { FunctionsPage } from "@/pages/FunctionsPage";
import { GuidePage } from "@/pages/GuidePage";
import { MetricsPage } from "@/pages/MetricsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { StoragePage } from "@/pages/StoragePage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "capacity", element: <CapacityPage /> },
      { path: "metrics", element: <MetricsPage /> },
      { path: "storage", element: <StoragePage /> },
      { path: "functions", element: <FunctionsPage /> },
      { path: "apis", element: <ApisPage /> },
      { path: "cdn", element: <CdnPage /> },
      { path: "databases", element: <DatabasesPage /> },
      { path: "guide", element: <GuidePage /> },
      { path: "guide/:slug", element: <GuidePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
