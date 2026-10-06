import { useQuery } from "@tanstack/react-query";
import { workLocationApi } from "@/shared/api/clients";

/** 勤務場所（日付 YYYY-MM-DD → 場所）。古い日は消え、2 か月先まで「未定」で埋まった状態で返る */
export function useWorkLocations() {
  return useQuery({
    queryKey: ["work-locations"],
    queryFn: async () => (await workLocationApi.listWorkLocations({})).locations,
  });
}
