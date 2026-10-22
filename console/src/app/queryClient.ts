import { QueryClient } from "@tanstack/react-query";
import { isAuthError } from "@/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 401 / 403 は何度やっても同じ（Access のログインが要る）ので繰り返さない
      retry: (count, err) => !isAuthError(err) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});
