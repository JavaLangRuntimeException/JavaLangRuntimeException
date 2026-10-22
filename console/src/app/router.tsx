import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/AppShell";
import { HostingPage } from "@/pages/HostingPage";
import { MetricsPage } from "@/pages/MetricsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { StoragePage } from "@/pages/StoragePage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "metrics", element: <MetricsPage /> },
      { path: "storage", element: <StoragePage /> },
      { path: "hosting", element: <Navigate to="/hosting/containers" replace /> },
      { path: "hosting/:kind", element: <HostingPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
