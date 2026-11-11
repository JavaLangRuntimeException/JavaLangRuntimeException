import { NavLink, useParams } from "react-router";
import { useOverview } from "@/api/console";
import { Mono, PageHeader, Panel } from "@/components/Page";
import { Planned } from "@/components/Planned";
import { ContainersPanel } from "@/pages/ContainersPanel";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { hostingKinds, type HostingKind } from "@/lib/nav";

const plans: Record<Exclude<HostingKind, "containers">, { lead: string; items: { title: string; body: string }[] }> = {
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
      {current.kind === "containers" ? (
        <ContainersPanel />
      ) : (
        <Panel title={current.label} aside="近日追加">
          <Planned lead={plans[current.kind].lead} items={plans[current.kind].items} />
        </Panel>
      )}
    </>
  );
}
