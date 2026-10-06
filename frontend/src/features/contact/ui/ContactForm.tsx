import { useId, useState, type FormEvent } from "react";
import { useAtom, useSetAtom } from "jotai";
import { TerminalLoadingDialog } from "@/shared/ui/terminal";
import { DropZone, FileTrigger } from "react-aria-components";
import { RiCloseLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select, SelectItem } from "@/components/base/select/select";
import { Textarea } from "@/components/base/textarea/textarea";
import { inquiryApi } from "@/shared/api/clients";
import { toApiError } from "@/shared/api/errors";
import { CONTACT_PURPOSES } from "@/shared/config/purposes";
import { contactSubmittingAtom } from "@/shared/model/nav-lock";
import { cx } from "@/utils/cx";
import { DEFAULT_SUBMIT_ERROR, submitErrorMessage } from "../model/errors";
import { addFiles, formatFileSize, type AttachedFile } from "../model/files";
import { isContactValid, validateContact, type ContactFormData, type ContactFormErrors } from "../model/schema";
import {
  contactEmailAtom,
  contactEventIdAtom,
  contactMessageAtom,
  contactNameAtom,
  contactOrganizationAtom,
  contactPurposeAtom,
  contactSubjectAtom,
} from "../model/state";

function FieldLabel({ id, children, required }: { id?: string; children: string; required?: boolean }) {
  return (
    <span id={id} className="flex items-center gap-1.5 text-body-medium text-text-primary">
      {children}
      {required && <span className="text-text-error-primary">*</span>}
    </span>
  );
}

function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-caption-1-regular text-text-error-primary">{children}</p>;
}

/** 入力の保持・利用目的・必須の案内（旧 InfoBadge の内容） */
function FormNotes() {
  const notes = [
    { text: <>入力内容は10分間保持されます</> },
    { text: <>フォームに入力いただいた内容はご相談や面談の予約確認の目的でのみ使用されます。</> },
    { text: <><span className="text-text-error-primary">*</span> は必須項目です</> },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {notes.map(({ text }, i) => (
        <li key={i} className="text-[0.875rem] text-text-secondary">
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function ContactForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useAtom(contactEmailAtom);
  const [name, setName] = useAtom(contactNameAtom);
  const [organization, setOrganization] = useAtom(contactOrganizationAtom);
  const [subject, setSubject] = useAtom(contactSubjectAtom);
  const [purpose, setPurpose] = useAtom(contactPurposeAtom);
  const [message, setMessage] = useAtom(contactMessageAtom);
  const [eventId, setEventId] = useAtom(contactEventIdAtom);
  const setNavLocked = useSetAtom(contactSubmittingAtom);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const purposeLabelId = useId();

  const formData: ContactFormData = {
    email,
    name,
    organization: organization || undefined,
    subject,
    purpose,
    message,
    eventId: eventId || undefined,
  };
  const valid = isContactValid(formData);
  const submitDisabled = !valid || fileErrors.length > 0 || isSubmitting;

  // 入力し始めたらその項目のエラーを消す
  const edit = (key: keyof ContactFormData, set: (v: string) => void) => (value: string) => {
    set(value);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const onFiles = (files: File[]) => {
    const { added, errors: errs } = addFiles(attached, files);
    setFileErrors(errs);
    if (added.length > 0) setAttached((prev) => [...prev, ...added]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateContact(formData);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    setNavLocked(true);
    setSubmitError(null);
    try {
      const files = await Promise.all(
        attached.map(async ({ file }) => ({
          name: file.name,
          contentType: file.type,
          data: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      await inquiryApi.submitContact({ email, name, organization, subject, purpose, message, eventId, files });
      // 送信できたら保持していた入力を消す
      setEmail("");
      setName("");
      setOrganization("");
      setSubject("");
      setPurpose("");
      setMessage("");
      setEventId("");
      setAttached([]);
      setFileErrors([]);
      onSuccess();
    } catch (err) {
      const apiError = toApiError(err);
      setSubmitError(apiError ? submitErrorMessage(apiError.code, apiError.detail) : DEFAULT_SUBMIT_ERROR);
    } finally {
      setIsSubmitting(false);
      setNavLocked(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <FormNotes />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-6 border-t border-separator-border pt-8">
          <Input
            label="メールアドレス"
            isRequired
            validationBehavior="aria"
            type="email"
            name="email"
            value={email}
            onChange={edit("email", setEmail)}
            placeholder="your@email.com"
            isInvalid={!!errors.email}
            hint={errors.email}
            autoComplete="email"
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="名前"
              isRequired
              validationBehavior="aria"
              name="name"
              value={name}
              onChange={edit("name", setName)}
              placeholder="山田太郎"
              isInvalid={!!errors.name}
              hint={errors.name}
              autoComplete="name"
            />
            <Input
              label="所属 (任意)"
              name="organization"
              value={organization}
              onChange={edit("organization", setOrganization)}
              placeholder="株式会社○○"
              autoComplete="organization"
            />
          </div>
          <Input
            label="件名"
            isRequired
            validationBehavior="aria"
            name="subject"
            value={subject}
            onChange={edit("subject", setSubject)}
            placeholder="お問い合わせの件名"
            isInvalid={!!errors.subject}
            hint={errors.subject}
          />
        </div>

        <div className="flex flex-col gap-6 border-t border-separator-border pt-8">
          <div className="flex flex-col gap-1.5">
            <FieldLabel id={purposeLabelId} required>
              問い合わせ要件
            </FieldLabel>
            <Select
              aria-labelledby={purposeLabelId}
              placeholder="選択してください"
              selectedKey={purpose || null}
              onSelectionChange={(key) => edit("purpose", setPurpose)(key == null ? "" : String(key))}
              isInvalid={!!errors.purpose}
              className="w-full"
              popoverClassName="w-[var(--trigger-width)] max-w-[calc(100vw-2rem)]"
            >
              {CONTACT_PURPOSES.map((p) => (
                <SelectItem key={p.value} id={p.value} textValue={p.label}>
                  <span className="whitespace-normal">{p.label}</span>
                </SelectItem>
              ))}
            </Select>
            <FieldError>{errors.purpose}</FieldError>
          </div>

          {/* EventID（面談予約の変更・取消の場合のみ） */}
          {purpose === "Ask Me" && (
            <div className="flex flex-col gap-1.5">
              <Input
                label="EventID"
                isRequired
                validationBehavior="aria"
                name="eventId"
                value={eventId}
                onChange={edit("eventId", setEventId)}
                placeholder="例: abcdefghij0123456789klmn"
                isInvalid={!!errors.eventId}
              />
              <p className="text-caption-1-regular text-text-secondary">
                面談予約完了の際に表示されたEventIDを入力してください。
                <br />
                （招待されたGoogleカレンダーやメールにも記載されています）
              </p>
              <FieldError>{errors.eventId}</FieldError>
            </div>
          )}

          <Textarea
            label="本文"
            isRequired
            validationBehavior="aria"
            name="message"
            rows={6}
            value={message}
            onChange={edit("message", setMessage)}
            placeholder="お問い合わせ内容を詳しくお書きください"
            isInvalid={!!errors.message}
            hint={errors.message}
          />
        </div>

        <div className="flex flex-col gap-4 border-t border-separator-border pt-8">
          <FieldLabel>ファイル添付 (任意)</FieldLabel>
          <DropZone
            onDrop={async (e) => {
              const files = await Promise.all(
                e.items.filter((i) => i.kind === "file").map((i) => (i as { getFile: () => Promise<File> }).getFile()),
              );
              onFiles(files);
            }}
            className={({ isDropTarget }) =>
              cx(
                "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center outline-none",
                isDropTarget ? "border-accent-500 bg-accent-500/15" : "border-border-button-default bg-background-secondary-default",
              )
            }
          >
            <FileTrigger allowsMultiple onSelect={(list) => list && onFiles(Array.from(list))}>
              <Button type="button" variant="secondary" size="small">
                ファイルを選択
              </Button>
            </FileTrigger>
          </DropZone>

          {fileErrors.length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-xl border border-border-error-default px-3 py-2">
              {fileErrors.map((err, i) => (
                <p key={i} className="text-caption-1-regular text-text-error-primary">
                  {err}
                </p>
              ))}
            </div>
          )}

          {attached.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-body-2-medium text-text-primary">添付ファイル:</p>
              <ul className="flex flex-col gap-2">
                {attached.map(({ file, id }) => (
                  <li key={id} className="flex items-center justify-between gap-3 rounded-xl border border-separator-border px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-2-medium text-text-primary">{file.name}</span>
                        <span className="text-caption-1-regular text-text-tertiary">{formatFileSize(file.size)}</span>
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="small"
                      iconOnly
                      leadingIcon={RiCloseLine}
                      aria-label={`${file.name} を削除`}
                      onClick={() => {
                        setAttached((prev) => prev.filter((a) => a.id !== id));
                        setFileErrors([]);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {submitError && (
          <div role="alert" className="whitespace-pre-line rounded-xl border border-border-error-default px-4 py-3 text-body-2-regular text-text-error-primary">
            {submitError}
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <Button type="submit" variant="primary" disabled={submitDisabled} className="min-w-40">
            {isSubmitting ? "送信中..." : "送信する"}
          </Button>
          {submitDisabled && !isSubmitting && (
            <p className="text-body-2-regular text-text-error-primary">
              {!valid ? "必須項目を正しく入力してください" : fileErrors.length > 0 ? "ファイルエラーを修正してください" : ""}
            </p>
          )}
        </div>
      </form>

      {/* 送信中 */}
      <TerminalLoadingDialog
        isOpen={isSubmitting}
        title="お問い合わせを送信中"
        message="お問い合わせを送信しています…"
       
        variant="contact"
      />
    </div>
  );
}
