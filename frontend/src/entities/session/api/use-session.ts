import { useQuery, useQueryClient } from "@tanstack/react-query";
import { identityApi } from "@/shared/api/clients";

export type SessionUser = { email: string; name: string; picture: string };

export const sessionQueryKey = ["session"] as const;

/** ログイン中の管理者（Cookie のセッション）。未ログイン・許可外なら null */
export function useSession() {
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<SessionUser | null> => {
      const res = await identityApi.getSession({});
      return res.user ? { email: res.user.email, name: res.user.name, picture: res.user.picture } : null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { user: query.data ?? null, isLoading: query.isPending, refetch: query.refetch };
}

export function useClearSession() {
  const qc = useQueryClient();
  return () => qc.setQueryData(sessionQueryKey, null);
}
