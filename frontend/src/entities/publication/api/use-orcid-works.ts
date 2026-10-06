import { useQuery } from "@tanstack/react-query";
import { contentApi } from "@/shared/api/clients";
import type { OrcidWork } from "../model/orcid";

/** ORCID に登録した論文（サーバーで 1 時間キャッシュ） */
export function useOrcidWorks() {
  return useQuery({
    queryKey: ["orcid-works"],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<{ orcidId: string | null; works: OrcidWork[] }> => {
      const res = await contentApi.listOrcidWorks({});
      return {
        orcidId: res.orcidId || null,
        works: res.works.map((w) => ({
          putCode: Number(w.putCode),
          title: w.title,
          type: w.type,
          venue: w.venue,
          date: w.date,
          doi: w.doi || null,
          url: w.url || null,
          authors: w.authors,
        })),
      };
    },
  });
}
