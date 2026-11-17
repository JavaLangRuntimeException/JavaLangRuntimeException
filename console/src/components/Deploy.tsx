import { useDeployments } from "@/api/console";
import type { Deployment } from "@/api/gen/taramanji/cloud/v1/console_pb";
import { Status } from "@/components/Form";
import { Mono, Panel } from "@/components/Page";
import { ago, deploymentOf, deployState, kindLabel } from "@/lib/deploy";

/** 一覧の 1 行に出すデプロイの状態（リポジトリの版と比べる） */
export function DeployBadge({ kind, name, revision }: { kind: string; name: string; revision?: string }) {
  const list = useDeployments().data?.deployments;
  const d = deploymentOf(list, kind, name);
  const st = deployState(d, revision);
  return (
    <span title={st.detail}>
      <Status level={st.level} label={st.label} />
      {d && <span className="ml-1 text-xs text-muted">{ago(d.atMs)}</span>}
    </span>
  );
}

function Row({ d, showName }: { d: { atMs: bigint; commit: string; revision: string; state: string; message: string }; showName?: { kind: string; name: string } }) {
  const st = deployState({ kind: "", name: "", ...d }, undefined);
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
      <span className="w-20 shrink-0 text-xs text-muted">{ago(d.atMs)}</span>
      {showName && (
        <span className="min-w-[10rem] text-ink">
          <span className="text-xs text-muted">{kindLabel(showName.kind)}</span> <span className="font-medium">{showName.name}</span>
        </span>
      )}
      <Status level={st.level} label={st.label} />
      {d.revision && (
        <span className="text-xs text-muted">
          版 <Mono>{d.revision}</Mono>
          {d.commit && (
            <>
              {" "}
              ・ コミット <Mono>{d.commit}</Mono>
            </>
          )}
        </span>
      )}
      {d.message && <span className="w-full text-xs break-all text-ink-2 md:pl-[5.75rem]">{d.message}</span>}
    </li>
  );
}

/** 1 つのリソースのデプロイの履歴（編集画面の下に出す） */
export function DeployHistory({ kind, name, revision }: { kind: string; name: string; revision?: string }) {
  const q = useDeployments();
  const d = deploymentOf(q.data?.deployments, kind, name);
  const st = deployState(d, revision);
  return (
    <Panel title="デプロイ" aside={<Status level={st.level} label={st.label} />}>
      {!q.data?.enabled ? (
        <p className="px-4 py-3 text-ink-2">リポジトリのトークンがないので、コントローラーが YAML を入れていません。</p>
      ) : !d ? (
        <p className="px-4 py-3 text-ink-2">まだ入っていません。保存してから 15 秒ほどで、コントローラーがクラスターに入れます。</p>
      ) : (
        <ul className="divide-y divide-line">
          {d.history.length === 0 ? <Row d={d} /> : d.history.map((e, i) => <Row key={i} d={e} />)}
        </ul>
      )}
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        コントローラーが 15 秒ごとにリポジトリを見て、変わっていたらクラスターに入れます（Argo CD では入れません。Argo CD の画面では Pod の様子だけ見られます）。決まりに合わない YAML は入れず、前の版のまま動かします。
      </p>
    </Panel>
  );
}

/** 最近のデプロイ（Console Home） */
export function RecentDeployments({ limit = 8 }: { limit?: number }) {
  const q = useDeployments();
  const recent = [...(q.data?.deployments ?? [])].sort((a: Deployment, b: Deployment) => Number(b.atMs - a.atMs)).slice(0, limit);
  return (
    <Panel title="デプロイ" aside="新しい順">
      {recent.length === 0 ? (
        <p className="px-4 py-3 text-ink-2">まだデプロイはありません。Functions などで作ると、ここに結果が出ます。</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((d) => (
            <Row key={`${d.kind}.${d.name}`} d={d} showName={{ kind: d.kind, name: d.name }} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
