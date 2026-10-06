import { Link } from "react-router";
import { useWorkLocations } from "@/entities/work-location";
import { PageContainer, PageHeader, Skeleton } from "@/shared/ui/layout";
import { WorkLocationCalendar } from "@/widgets/work-location-calendar";

export default function LocationPage() {
  const { data, isPending, isError } = useWorkLocations();

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="勤務場所"
        description={
          <div className="flex flex-col gap-1">
            <p>今日以降の勤務予定場所です</p>
            <p className="text-body-2-regular text-text-tertiary">最短2ヶ月先まで公開しています</p>
            <p className="text-body-2-regular text-text-tertiary">
              <Link to="/reserve" className="text-accent-300 underline underline-offset-2 hover:text-accent-200">
                Ask Me
              </Link>
              ページでの対面でのお問い合わせにご活用ください
            </p>
          </div>
        }
      />
      {isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
        </div>
      ) : isError ? (
        <p role="alert" className="py-8 text-center text-body-regular text-text-error-primary">
          データの取得に失敗しました
        </p>
      ) : (
        <WorkLocationCalendar locations={data} />
      )}
    </PageContainer>
  );
}
