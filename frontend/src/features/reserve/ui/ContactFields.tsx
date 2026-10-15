import { useState } from "react";
import { RiLoader4Line } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Textarea } from "@/components/base/textarea/textarea";
import { useT, type L10n } from "@/shared/lib/i18n";
import type { ContactMethod } from "../model/state";
import { FieldCard, FieldError, FieldNote } from "./parts";

const METHODS: { value: Exclude<ContactMethod, "">; label: L10n }[] = [
  { value: "meet", label: { ja: "GoogleMeet", en: "GoogleMeet" } },
  { value: "discord", label: { ja: "Discord", en: "Discord" } },
  { value: "slack", label: { ja: "Slack", en: "Slack" } },
  { value: "other", label: { ja: "その他 (Zoom等)", en: "Other (Zoom, etc.)" } },
  { value: "offline", label: { ja: "オフライン（対面）", en: "In person" } },
];

function SubLabel({ children }: { children: string }) {
  return (
    <span className="text-[0.8125rem] font-medium text-text-secondary">
      {children}
    </span>
  );
}

function Required({ value }: { value: string }) {
  const t = useT();
  return <FieldError>{!value || !value.trim() ? t({ ja: "入力必須です", en: "This field is required" }) : undefined}</FieldError>;
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
  const t = useT();
  const [linkTouched, setLinkTouched] = useState(false);
  const linkError = (() => {
    if (p.contactMethod !== "offline") return undefined;
    const looksLikeUrl = /^https:\/\/maps\.app\.goo\.gl\//i.test((p.offlinePlaceLink || "").trim());
    const zodErr = p.errors.offlinePlaceLink;
    if (zodErr) return zodErr === "Dynamic Link Not Found" ? t({ ja: "正しいリンクにしてください", en: "Please enter a valid link" }) : zodErr;
    if (linkTouched && !looksLikeUrl) return t({ ja: "https://maps.app.goo.gl/から始まるリンクを記入してください", en: "Enter a link that starts with https://maps.app.goo.gl/" });
    return undefined;
  })();

  const methodTitle = t({ ja: "ミーティング媒体", en: "Meeting method" });
  // 見出し・読み上げ・入力例が同じ文言の欄
  const discordServer = t({ ja: "Discordサーバー名", en: "Discord server name" });
  const discordName = t({ ja: "Discord表示名", en: "Discord display name" });
  const slackWorkspace = t({ ja: "Slackワークスペース名", en: "Slack workspace name" });
  const slackName = t({ ja: "Slack表示名", en: "Slack display name" });
  const otherNote = t({ ja: "備考・リンク", en: "Note / link" });
  const mapsLink = t({ ja: "Googleマップの共有リンク", en: "Google Maps share link" });
  const placeName = t({ ja: "場所の名称(自動入力)", en: "Place name (auto-filled)" });
  const placeDetail = t({ ja: "場所の詳細（任意）", en: "Place details (optional)" });
  return (
    <FieldCard title={methodTitle}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Select
            aria-label={methodTitle}
            placeholder={t({ ja: "---選択してください---", en: "--- Please select ---" })}
            className="w-full"
            selectedKey={p.contactMethod || null}
            onSelectionChange={(k) => k != null && p.setContactMethod(k as ContactMethod)}
          >
            {METHODS.map((m) => (
              <SelectItem key={m.value} id={m.value} textValue={t(m.label)}>
                {t(m.label)}
              </SelectItem>
            ))}
          </Select>
          <FieldError>{p.errors.contactMethod}</FieldError>
        </div>

        {p.contactMethod === "meet" && (
          <FieldNote className="sm:col-span-3">
            {t({
              ja: "Google Meetの場合は予約完了後ミーティングURLが発行されますので、ミーティングの際はそのリンクからご参加くださいますようお願いいたします。",
              en: "For Google Meet, a meeting URL will be issued once your reservation is complete. Please join the meeting from that link.",
            })}
          </FieldNote>
        )}

        {p.contactMethod === "discord" && (
          <>
            <div className="flex flex-col gap-1.5">
              <SubLabel>{discordServer}</SubLabel>
              <Input aria-label={discordServer} placeholder={discordServer} value={p.discordServer} onChange={p.setDiscordServer} onFocus={p.onDiscordServerFocus} />
              <Required value={p.discordServer} />
            </div>
            <div className="flex flex-col gap-1.5">
              <SubLabel>{discordName}</SubLabel>
              <Input aria-label={discordName} placeholder={discordName} value={p.discordName} onChange={p.setDiscordName} />
              <Required value={p.discordName} />
            </div>
          </>
        )}

        {p.contactMethod === "slack" && (
          <>
            <div className="flex flex-col gap-1.5">
              <SubLabel>{slackWorkspace}</SubLabel>
              <Input aria-label={slackWorkspace} placeholder={t({ ja: "面談するSlackワークスペース名", en: "Slack workspace for the meeting" })} value={p.slackWorkspace} onChange={p.setSlackWorkspace} />
              <Required value={p.slackWorkspace} />
            </div>
            <div className="flex flex-col gap-1.5">
              <SubLabel>{slackName}</SubLabel>
              <Input aria-label={slackName} placeholder={slackName} value={p.slackName} onChange={p.setSlackName} />
              <Required value={p.slackName} />
            </div>
          </>
        )}

        {p.contactMethod === "other" && (
          <div className="flex flex-col gap-1.5">
            <SubLabel>{otherNote}</SubLabel>
            <Input aria-label={otherNote} placeholder={t({ ja: "備考（任意：Zoomリンク等）", en: "Note (optional: Zoom link, etc.)" })} value={p.otherNote} onChange={p.setOtherNote} />
          </div>
        )}

        {p.contactMethod === "offline" && (
          <>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <SubLabel>{mapsLink}</SubLabel>
              <Textarea
                aria-label={mapsLink}
                placeholder={t({ ja: "Googleマップの『共有』で取得できるリンクを貼り付けてください", en: "Paste the link from Share in Google Maps" })}
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
                  {t({ ja: "場所名を取得中…", en: "Fetching the place name…" })}
                </span>
              )}
              <FieldError>{linkError}</FieldError>
            </div>
            <div className="flex flex-col gap-1.5">
              <SubLabel>{placeName}</SubLabel>
              {/* 自動入力のみ（ずっと入力不可） */}
              <Input
                aria-label={placeName}
                placeholder={
                  p.offlinePlaceName && p.offlinePlaceName.trim() !== ""
                    ? ""
                    : linkTouched
                      ? t({ ja: "取得できませんでした", en: "Could not be retrieved" })
                      : t({ ja: "リンクを入力してください", en: "Enter a link" })
                }
                value={p.offlinePlaceName}
                isDisabled
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <SubLabel>{placeDetail}</SubLabel>
              <Textarea
                aria-label={placeDetail}
                placeholder={t({ ja: "集合場所の目印・フロア・席番号などがあればご記入ください（任意）", en: "Landmarks, floor, seat number, etc. for the meeting point (optional)" })}
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
