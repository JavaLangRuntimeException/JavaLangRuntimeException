import { useOverview } from "@/api/console";
import { Mono, PageHeader, Panel } from "@/components/Page";
import { Planned } from "@/components/Planned";

export function StoragePage() {
  const suffix = useOverview().data?.storageHostSuffix;
  return (
    <>
      <PageHeader title="ストレージ" description="ファイルを置いて、URL で配るためのバケットです。" />
      <Panel title="バケット" aside="近日追加">
        <Planned
          lead="バケットの一覧と操作はまだありません。次の機能を追加する予定です。"
          items={[
            { title: "バケットの作成", body: "名前を決めて作る。中身を公開するか、自分だけにするかを選べる。" },
            { title: "ファイルのアップロード", body: "ブラウザからファイルを置く・消す・一覧を見る。" },
            {
              title: "公開 URL",
              body: suffix ? (
                <>
                  公開したバケットは <Mono>https://&lt;名前&gt;{suffix}</Mono> で配られる。
                </>
              ) : (
                "公開したバケットは、名前の付いた URL で配られる。"
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
