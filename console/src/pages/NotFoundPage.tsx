import { Link } from "react-router";
import { EmptyState, PageHeader, Panel } from "@/components/Page";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="ページがありません" />
      <Panel>
        <EmptyState title="この URL の画面はありません">
          <Link to="/" className="font-medium text-accent hover:underline">
            概要へ戻る
          </Link>
        </EmptyState>
      </Panel>
    </>
  );
}
