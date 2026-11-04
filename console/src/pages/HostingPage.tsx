import { NavLink, useParams } from "react-router";
import { useOverview } from "@/api/console";
import { Mono, PageHeader, Panel } from "@/components/Page";
import { Planned } from "@/components/Planned";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { hostingKinds, type HostingKind } from "@/lib/nav";

const plans: Record<HostingKind, { lead: string; items: { title: string; body: string }[] }> = {
  containers: {
    lead: "コンテナの一覧と操作はまだありません。次の機能を追加する予定です。",
    items: [
      { title: "コンテナの作成", body: "イメージとポート・環境変数を指定して、常に動かしておく。" },
      { title: "GitHub 連携のデプロイ", body: "リポジトリとブランチを選ぶと、push のたびにビルドして入れ替える。" },
      { title: "ログと状態", body: "動いている数・再起動の回数・直近のログを見る。" },
    ],
  },
  functions: {
    lead: "関数の一覧と操作はまだありません。次の機能を追加する予定です。",
    items: [
      { title: "関数の作成", body: "HTTP のリクエストを受けたときだけ動くコードを置く。" },
      { title: "GitHub 連携のデプロイ", body: "リポジトリのディレクトリを指定して、push のたびに更新する。" },
      { title: "呼び出しの記録", body: "呼ばれた回数・かかった時間・エラーを見る。" },
    ],
  },
  instances: {
    lead: "インスタンスの一覧と操作はまだありません。次の機能を追加する予定です。",
    items: [
      { title: "インスタンスの作成", body: "CPU とメモリを決めて、SSH で入れる環境を作る。" },
      { title: "起動と停止", body: "使わないときは止めて、家のマシンの資源を空ける。" },
      { title: "ディスク", body: "止めても消えない領域を付ける。" },
    ],
  },
};

export function HostingPage() {
  const { kind } = useParams();
  const suffix = useOverview().data?.hostingHostSuffix;
  const current = hostingKinds.find((k) => k.kind === kind);
  if (!current) return <NotFoundPage />;
  const plan = plans[current.kind];

  return (
    <>
      <PageHeader
        title="ホスティング"
        description={
          suffix ? (
            <>
              アプリを動かして <Mono>https://&lt;名前&gt;{suffix}</Mono> で公開します。
            </>
          ) : (
            "アプリを動かして、名前の付いた URL で公開します。"
          )
        }
      />
      {/* 幅が狭いとき（左のナビに下の階層が出ないとき）もここで切り替えられる */}
      <nav aria-label="ホスティングの種類" className="mb-4 flex gap-1 border-b border-line">
        {hostingKinds.map((k) => (
          <NavLink
            key={k.kind}
            to={`/hosting/${k.kind}`}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 ${isActive ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`
            }
          >
            {k.label}
          </NavLink>
        ))}
      </nav>
      <Panel title={current.label} aside="近日追加">
        <Planned lead={plan.lead} items={plan.items} />
      </Panel>
    </>
  );
}
