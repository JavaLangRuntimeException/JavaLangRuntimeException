import { Link } from "react-router";
import { useWorkLocations } from "@/entities/work-location";
import { useT } from "@/shared/lib/i18n";
import { PageContainer, PageHeader, Skeleton } from "@/shared/ui/layout";
import { WorkLocationCalendar } from "@/widgets/work-location-calendar";

export default function LocationPage() {
  const t = useT();
  const { data, isPending, isError } = useWorkLocations();

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={t({ ja: "勤務場所", en: "Work Spot" })}
        description={
          <div className="flex flex-col gap-1">
            <p>{t({ ja: "今日以降の勤務予定場所です", en: "Where I plan to work from today onward." })}</p>
            <p className="text-body-2-regular text-text-tertiary">{t({ ja: "最短2ヶ月先まで公開しています", en: "Published at least two months ahead." })}</p>
            <p className="text-body-2-regular text-text-tertiary">
              {t({ ja: "", en: "Use it to request an in-person meeting on the " })}
              <Link to="/reserve" className="text-accent-300 underline underline-offset-2 hover:text-accent-200">
                Ask Me
              </Link>
              {t({ ja: "ページでの対面でのお問い合わせにご活用ください", en: " page." })}
            </p>
          </div>
        }
      />
      {isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : isError ? (
        <p role="alert" className="py-8 text-center text-body-regular text-text-error-primary">
          {t({ ja: "データの取得に失敗しました", en: "Failed to load the data." })}
        </p>
      ) : (
        <WorkLocationCalendar locations={data} />
      )}
    </PageContainer>
  );
}
