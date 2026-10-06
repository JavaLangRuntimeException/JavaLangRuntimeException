import { useState } from "react";
import { RiChat3Line, RiHashtag, RiLink, RiLoader4Line, RiMapPinLine, RiSlackLine, type RemixiconComponentType } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Textarea } from "@/components/base/textarea/textarea";
import type { ContactMethod } from "../model/state";
import { FieldCard, FieldError, FieldNote } from "./parts";

const METHODS: { value: Exclude<ContactMethod, "">; label: string }[] = [
  { value: "meet", label: "GoogleMeet" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "other", label: "その他 (Zoom等)" },
  { value: "offline", label: "オフライン（対面）" },
];

function SubLabel({ icon: IconCmp, children }: { icon: RemixiconComponentType; children: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-caption-1-medium text-text-secondary">
      <IconCmp className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

function Required({ value }: { value: string }) {
  return <FieldError>{!value || !value.trim() ? "入力必須です" : undefined}</FieldError>;
}

export type ContactFieldsProps = {
  contactMethod: ContactMethod;
  setContactMethod: (v: ContactMethod) => void;
  discordServer: string;
  setDiscordServer: (v: string) => void;
  onDiscordServerFocus?: () => void;
  discordName: string;
  setDiscordName: (v: string) => void;
  slackWorkspace: string;
  setSlackWorkspace: (v: string) => void;
  slackName: string;
  setSlackName: (v: string) => void;
  otherNote: string;
  setOtherNote: (v: string) => void;
  offlinePlaceLink: string;
  setOfflinePlaceLink: (v: string) => void;
  offlinePlaceName: string;
  isResolvingPlace?: boolean;
  offlinePlaceDetail: string;
  setOfflinePlaceDetail: (v: string) => void;
  errors: Record<string, string | undefined>;
};

/** ミーティング媒体と、媒体ごとの入力欄（文言は旧 ContactFields と同じ） */
export function ContactFields(p: ContactFieldsProps) {
  const [linkTouched, setLinkTouched] = useState(false);
  const linkError = (() => {
    if (p.contactMethod !== "offline") return undefined;
    const looksLikeUrl = /^https:\/\/maps\.app\.goo\.gl\//i.test((p.offlinePlaceLink || "").trim());
    const zodErr = p.errors.offlinePlaceLink;
    if (zodErr) return zodErr === "Dynamic Link Not Found" ? "正しいリンクにしてください" : zodErr;
    if (linkTouched && !looksLikeUrl) return "https://maps.app.goo.gl/から始まるリンクを記入してください";
    return undefined;
  })();

  return (
    <FieldCard title="ミーティング媒体" icon={RiChat3Line}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Select
            aria-label="ミーティング媒体"
            placeholder="---選択してください---"
            className="w-full"
            selectedKey={p.contactMethod || null}
            onSelectionChange={(k) => k != null && p.setContactMethod(k as ContactMethod)}
          >
            {METHODS.map((m) => (
              <SelectItem key={m.value} id={m.value} textValue={m.label}>
                {m.label}
              </SelectItem>
            ))}
          </Select>
          <FieldError>{p.errors.contactMethod}</FieldError>
        </div>

        {p.contactMethod === "meet" && (
          <FieldNote className="sm:col-span-3">
            Google Meetの場合は予約完了後ミーティングURLが発行されますので、ミーティングの際はそのリンクからご参加くださいますようお願いいたします。
          </FieldNote>
        )}

        {p.contactMethod === "discord" && (
          <>
            <div className="flex flex-col gap-1.5">
              <SubLabel icon={RiHashtag}>Discordサーバー名</SubLabel>
              <Input aria-label="Discordサーバー名" placeholder="Discordサーバー名" value={p.discordServer} onChange={p.setDiscordServer} onFocus={p.onDiscordServerFocus} />
              <Required value={p.discordServer} />
            </div>
            <div className="flex flex-col gap-1.5">
              <SubLabel icon={RiHashtag}>Discord表示名</SubLabel>
              <Input aria-label="Discord表示名" placeholder="Discord表示名" value={p.discordName} onChange={p.setDiscordName} />
              <Required value={p.discordName} />
            </div>
          </>
        )}

        {p.contactMethod === "slack" && (
          <>
            <div className="flex flex-col gap-1.5">
              <SubLabel icon={RiSlackLine}>Slackワークスペース名</SubLabel>
              <Input aria-label="Slackワークスペース名" placeholder="面談するSlackワークスペース名" value={p.slackWorkspace} onChange={p.setSlackWorkspace} />
              <Required value={p.slackWorkspace} />
            </div>
            <div className="flex flex-col gap-1.5">
              <SubLabel icon={RiSlackLine}>Slack表示名</SubLabel>
              <Input aria-label="Slack表示名" placeholder="Slack表示名" value={p.slackName} onChange={p.setSlackName} />
              <Required value={p.slackName} />
            </div>
          </>
        )}

        {p.contactMethod === "other" && (
          <div className="flex flex-col gap-1.5">
            <SubLabel icon={RiLink}>備考・リンク</SubLabel>
            <Input aria-label="備考・リンク" placeholder="備考（任意：Zoomリンク等）" value={p.otherNote} onChange={p.setOtherNote} />
          </div>
        )}

        {p.contactMethod === "offline" && (
          <>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <SubLabel icon={RiMapPinLine}>Googleマップの共有リンク</SubLabel>
              <Textarea
                aria-label="Googleマップの共有リンク"
                placeholder="Googleマップの『共有』で取得できるリンクを貼り付けてください"
                rows={3}
                value={p.offlinePlaceLink}
                onChange={(v) => {
                  p.setOfflinePlaceLink(v);
                  if (!linkTouched) setLinkTouched(true);
                }}
              />
              {p.isResolvingPlace && (
                <span className="inline-flex items-center gap-1.5 text-caption-1-regular text-text-secondary" role="status">
                  <RiLoader4Line className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                  場所名を取得中…
                </span>
              )}
              <FieldError>{linkError}</FieldError>
            </div>
            <div className="flex flex-col gap-1.5">
              <SubLabel icon={RiMapPinLine}>場所の名称(自動入力)</SubLabel>
              {/* 自動入力のみ（ずっと入力不可） */}
              <Input
                aria-label="場所の名称(自動入力)"
                placeholder={p.offlinePlaceName && p.offlinePlaceName.trim() !== "" ? "" : linkTouched ? "取得できませんでした" : "リンクを入力してください"}
                value={p.offlinePlaceName}
                isDisabled
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <SubLabel icon={RiMapPinLine}>場所の詳細（任意）</SubLabel>
              <Textarea
                aria-label="場所の詳細（任意）"
                placeholder="集合場所の目印・フロア・席番号などがあればご記入ください（任意）"
                rows={3}
                value={p.offlinePlaceDetail}
                onChange={p.setOfflinePlaceDetail}
              />
            </div>
          </>
        )}
      </div>
    </FieldCard>
  );
}
