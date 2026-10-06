import { RouterProvider } from "react-router";
import { AppProviders } from "@/app/providers/AppProviders";
import { router } from "@/app/routes/router";

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
