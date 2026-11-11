import { useState, type ReactNode } from "react";
import { describeMutationError } from "@/api/errors";
import { btn, btnDanger, btnPrimary, Field, input } from "@/components/Form";
import { Panel } from "@/components/Page";

type Source = { yaml: string; revision: string; formEditable: boolean; url: string; problem: string };

/**
 * リソース（関数・API）の編集。フォームと YAML のどちらでも直せる。
 * 正はリポジトリの YAML なので、YAML を手で直したら YAML をそのまま保存する（フォームに戻ると捨てる）。
 * 手で書き足した YAML（フォームで作り直せない）と読めない YAML は、YAML のまま編集する
 */
export function ResourceEditor({
  title,
  source,
  yamlLabel,
  yamlHint,
  formValid,
  preview,
  onSave,
  onDelete,
  onClose,
  saving,
  error,
  warning,
  children,
}: {
  title: string;
  /** 既にあるリソースの YAML。新しく作るときは null */
  source: Source | null;
  yamlLabel: string;
  yamlHint: string;
  /** フォームに間違いがないか（あれば false を返し、フォーム側で間違いを表示する） */
  formValid: () => boolean;
  /** フォームの定義を YAML にする */
  preview: () => Promise<string>;
  /** yaml が null ならフォームの定義で保存する */
  onSave: (yaml: string | null) => void;
  onDelete?: () => void;
  onClose: () => void;
  saving: boolean;
  error: unknown;
  /** 保存はできたが伝えることがあるとき（監視を反映できなかった、など） */
  warning?: string;
  children: ReactNode;
}) {
  const isNew = source === null;
  const formOk = isNew || (source.formEditable && !source.problem);
  const [mode, setMode] = useState<"form" | "yaml">(formOk ? "form" : "yaml");
  const [yaml, setYaml] = useState(source?.yaml ?? "");
  const [yamlDirty, setYamlDirty] = useState(!formOk);
  const [previewError, setPreviewError] = useState<unknown>(null);

  const openYaml = async () => {
    if (!yamlDirty) {
      if (!formValid()) return;
      try {
        setPreviewError(null);
        setYaml(await preview());
      } catch (e) {
        setPreviewError(e);
        return;
      }
    }
    setMode("yaml");
  };

  const save = () => {
    const byYaml = mode === "yaml" && yamlDirty;
    if (!byYaml && !formValid()) return;
    onSave(byYaml ? yaml : null);
  };

  const shown = previewError ?? error;

  return (
    <Panel
      title={title}
      aside={
        <button type="button" className="text-accent hover:underline" onClick={onClose}>
          一覧に戻る
        </button>
      }
    >
      <div className="flex gap-1 border-b border-line px-4" role="tablist" aria-label="編集のしかた">
        {(["form", "yaml"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={m === "form" && !formOk}
            onClick={() => {
              if (m === "yaml") void openYaml();
              else if (!yamlDirty || window.confirm("YAML に直接入れた変更を捨てて、フォームに戻りますか？")) {
                setYamlDirty(false);
                setMode("form");
              }
            }}
            className={`-mb-px border-b-2 px-3 py-2 disabled:opacity-50 ${mode === m ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {m === "form" ? "フォーム" : "YAML"}
          </button>
        ))}
      </div>

      <div className="space-y-6 px-4 py-4">
        {source?.problem && (
          <p role="alert" className="rounded border border-line bg-surface-2 px-3 py-2 text-bad">
            この YAML は読めません: {source.problem}
          </p>
        )}
        {!formOk && !source?.problem && (
          <p className="rounded border border-line bg-surface-2 px-3 py-2 text-ink-2">
            この YAML には手で書き足した部分があるので、フォームでは編集できません（フォームで保存すると消えてしまうため）。
          </p>
        )}

        {mode === "form" ? (
          children
        ) : (
          <Field label={yamlLabel} hint={yamlHint}>
            <textarea
              className={`${input} h-[28rem] font-mono text-[13px] leading-5`}
              value={yaml}
              spellCheck={false}
              onChange={(e) => {
                setYaml(e.target.value);
                setYamlDirty(true);
              }}
            />
          </Field>
        )}

        {shown != null && (
          <p role="alert" className="text-bad">
            {describeMutationError(shown)}
          </p>
        )}
        {warning && (
          <p role="alert" className="text-warn">
            {warning}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
            {saving ? "保存中…" : isNew ? "作る" : "保存する"}
          </button>
          <button type="button" className={btn} disabled={saving} onClick={onClose}>
            {warning ? "閉じる" : "やめる"}
          </button>
          {!isNew && (
            <>
              <a href={source.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                GitHub で YAML を見る
              </a>
              {onDelete && (
                <button type="button" className={`${btnDanger} ml-auto`} disabled={saving} onClick={onDelete}>
                  消す
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
