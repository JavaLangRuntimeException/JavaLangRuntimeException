"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CONTACT_PURPOSES } from "../../../shared/config/purposes";
import { NotebookText } from "lucide-react";
import { InfoBadge } from "../../../shared/ui/InfoBadge";
import { z } from "zod";
import { useAtom } from "jotai";
import { useLoading } from "../../../shared/contexts/LoadingContext";
import {
  contactEmailAtom,
  contactNameAtom,
  contactOrganizationAtom,
  contactSubjectAtom,
  contactPurposeAtom,
  contactMessageAtom,
  contactEventIdAtom
} from "../state";

interface ContactFormProps {
  onSuccess: () => void;
}

interface FileData {
  file: File;
  id: string;
}

// Zodスキーマ定義
const contactFormSchema = z.object({
  email: z.string().min(1, "メールアドレスは必須です").email("有効なメールアドレスを入力してください"),
  name: z.string().min(1, "名前は必須です"),
  organization: z.string().optional(),
  subject: z.string().min(1, "件名は必須です"),
  purpose: z.string().min(1, "問い合わせ要件を選択してください"),
  message: z.string().min(1, "本文は必須です"),
  eventId: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

export function ContactForm({ onSuccess }: ContactFormProps) {
  // Jotai atomsを使用してフォームデータを管理
  const [email, setEmail] = useAtom(contactEmailAtom);
  const [name, setName] = useAtom(contactNameAtom);
  const [organization, setOrganization] = useAtom(contactOrganizationAtom);
  const [subject, setSubject] = useAtom(contactSubjectAtom);
  const [purpose, setPurpose] = useAtom(contactPurposeAtom);
  const [message, setMessage] = useAtom(contactMessageAtom);
  const [eventId, setEventId] = useAtom(contactEventIdAtom);
  const { setContactLoading } = useLoading();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<ContactFormData>>({});
  const [attachedFiles, setAttachedFiles] = useState<FileData[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // フォームデータを統合
  const formData: ContactFormData = {
    email,
    name,
    organization: organization || undefined,
    subject,
    purpose,
    message,
    eventId: eventId || undefined,
  };

  // クライアントサイドでのみ状態を管理
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const validateForm = (): boolean => {
    try {
      // 面談予約の変更・取消の場合はEventIDを必須にする
      const schema = purpose === "Ask Me"
        ? contactFormSchema.extend({
            eventId: z.string().min(1, "EventIDは必須です")
          })
        : contactFormSchema;

      schema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Partial<ContactFormData> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as keyof ContactFormData] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setContactLoading(true);

    try {
      const formDataToSend = new FormData();

      // フォームデータを追加
      formDataToSend.append('email', email);
      formDataToSend.append('name', name);
      if (organization) {
        formDataToSend.append('organization', organization);
      }
      formDataToSend.append('subject', subject);
      formDataToSend.append('purpose', purpose);
      formDataToSend.append('message', message);
      if (eventId) {
        formDataToSend.append('eventId', eventId);
      }

      // ファイルを追加
      attachedFiles.forEach((fileData) => {
        formDataToSend.append('files', fileData.file);
      });

      const response = await fetch("/api/contact", {
        method: "POST",
        body: formDataToSend,
      });

      if (response.ok) {
        // 送信成功時にstateをクリア
        setEmail("");
        setName("");
        setOrganization("");
        setSubject("");
        setPurpose("");
        setMessage("");
        setEventId("");
        setAttachedFiles([]);
        setFileErrors([]);
        onSuccess();
      } else {
        const errorData = await response.json();
        console.error("送信エラー:", errorData);

        let errorMessage = "送信に失敗しました。もう一度お試しください。";
        if (errorData.error === "email_send_failed") {
          errorMessage = "メール送信に失敗しました。しばらく時間をおいてから再度お試しください。";
          if (errorData.details) {
            errorMessage += `\n詳細: ${errorData.details}`;
          }
        } else if (errorData.error === "missing_required_fields") {
          errorMessage = "必須項目が入力されていません。すべての必須項目をご入力ください。";
        } else if (errorData.error === "invalid_email") {
          errorMessage = "メールアドレスの形式が正しくありません。";
        } else if (errorData.error === "too_many_files") {
          errorMessage = "ファイルは最大5個まで添付できます。";
        } else if (errorData.error === "file_too_large") {
          errorMessage = "ファイルサイズが大きすぎます。1ファイルあたり3MB以下にしてください。";
        }

        alert(errorMessage);
      }
    } catch (error) {
      console.error("送信エラー:", error);
      alert("送信に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
      setContactLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Jotaiのsetterを使用
    switch (name) {
      case 'email':
        setEmail(value);
        break;
      case 'name':
        setName(value);
        break;
      case 'organization':
        setOrganization(value);
        break;
      case 'subject':
        setSubject(value);
        break;
      case 'purpose':
        setPurpose(value);
        break;
      case 'message':
        setMessage(value);
        break;
      case 'eventId':
        setEventId(value);
        break;
    }

    // Clear error when user starts typing
    if (errors[name as keyof ContactFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFileErrors: string[] = [];
    const validFiles: FileData[] = [];

    // ファイル数制限チェック
    if (attachedFiles.length + files.length > 5) {
      newFileErrors.push("ファイルは最大5個まで添付できます");
    }

    files.forEach((file) => {
      // ファイルサイズチェック (3MB = 3 * 1024 * 1024 bytes)
      if (file.size > 3 * 1024 * 1024) {
        newFileErrors.push(`${file.name}: ファイルサイズは3MB以下にしてください`);
        return;
      }

      // 重複チェック
      const isDuplicate = attachedFiles.some(attached => attached.file.name === file.name);
      if (isDuplicate) {
        newFileErrors.push(`${file.name}: 同じファイル名のファイルが既に添付されています`);
        return;
      }

      validFiles.push({
        file,
        id: Math.random().toString(36).substr(2, 9)
      });
    });

    setFileErrors(newFileErrors);
    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(file => file.id !== id));
    setFileErrors([]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 送信ボタンの有効性をチェック
  const isSubmitDisabled = () => {
    // クライアントサイドでのみ状態をチェック
    if (!isMounted) {
      return true; // サーバーサイドでは常に無効
    }

    // Zodバリデーションのチェック
    const validationResult = contactFormSchema.safeParse(formData);
    const hasValidationErrors = !validationResult.success;

    // ファイルエラーのチェック
    const hasFileErrors = fileErrors.length > 0;

    return hasValidationErrors || hasFileErrors || isSubmitting;
  };

  return (
    <motion.div
      className="mx-auto max-w-4xl space-y-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.7 }}
    >

      {/* 入力保持の案内 */}
      <div className="space-y-2">
        <div>
          <InfoBadge dotColor="bg-emerald-400/80">
            入力内容は10分間保持されます
          </InfoBadge>
        </div>
        <div>
          <InfoBadge dotColor="bg-yellow-400/80">
            フォームに入力いただいた内容はご相談や面談の予約確認の目的でのみ使用されます。
          </InfoBadge>
        </div>
        <div>
          <InfoBadge dotColor="bg-red-400/80">
            <span className="text-red-400">*</span> は必須項目です
          </InfoBadge>
        </div>
      </div>

      <motion.form
        onSubmit={handleSubmit}
        className="space-y-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
      >
      {/* メールアドレス */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <label htmlFor="email" className="block text-sm font-semibold text-zinc-700 mb-3">
          メールアドレス <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={email}
          onChange={handleChange}
          className={`w-full rounded-md border bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            errors.email ? "border-red-500" : "border-zinc-300"
          }`}
          placeholder="your@email.com"
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* 名前 */}
        <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
          <label htmlFor="name" className="block text-sm font-semibold text-zinc-700 mb-3">
            名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={name}
            onChange={handleChange}
            className={`w-full rounded-md border bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
              errors.name ? "border-red-500" : "border-zinc-300"
            }`}
            placeholder="山田太郎"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>

        {/* 所属 */}
        <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
          <label htmlFor="organization" className="block text-sm font-semibold text-zinc-700 mb-3">
            所属 (任意)
          </label>
          <input
            type="text"
            id="organization"
            name="organization"
            value={organization}
            onChange={handleChange}
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            placeholder="株式会社○○"
          />
        </div>
      </div>

      {/* 件名 */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <label htmlFor="subject" className="block text-sm font-semibold text-zinc-700 mb-3">
          件名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="subject"
          name="subject"
          value={subject}
          onChange={handleChange}
          className={`w-full rounded-md border bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            errors.subject ? "border-red-500" : "border-zinc-300"
          }`}
          placeholder="お問い合わせの件名"
        />
        {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
      </div>

      {/* 問い合わせ要件 */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <label htmlFor="purpose" className="block text-sm font-semibold text-zinc-700 mb-3">
          <span className="text-zinc-500">📋</span> 問い合わせ要件 <span className="text-red-500">*</span>
        </label>
        <select
          id="purpose"
          name="purpose"
          value={purpose}
          onChange={handleChange}
          className={`w-full rounded-md border bg-white p-2 text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            errors.purpose ? "border-red-500" : "border-zinc-300"
          }`}
        >
          <option value="">選択してください</option>
          {CONTACT_PURPOSES.map((purpose) => (
            <option key={purpose.value} value={purpose.value}>
              {purpose.label}
            </option>
          ))}
        </select>
        {errors.purpose && <p className="mt-1 text-xs text-red-600">{errors.purpose}</p>}
      </div>

      {/* EventID入力フォーム（面談予約の変更・取消の場合のみ表示） */}
      {purpose === "Ask Me" && (
        <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
          <label htmlFor="eventId" className="block text-sm font-semibold text-zinc-700 mb-3">
            <span className="text-zinc-500">🆔</span> EventID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="eventId"
            name="eventId"
            value={eventId}
            onChange={handleChange}
            className={`w-full rounded-md border bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
              errors.eventId ? "border-red-500" : "border-zinc-300"
            }`}
            placeholder="例: abcdefghij0123456789klmn"
          />
          <p className="mt-2 text-xs text-zinc-600">
            面談予約完了の際に表示されたEventIDを入力してください。<br />
            （招待されたGoogleカレンダーやメールにも記載されています）
          </p>
          {errors.eventId && <p className="mt-1 text-xs text-red-600">{errors.eventId}</p>}
        </div>
      )}

      {/* お問い合わせ内容 */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <label htmlFor="message" className="block text-sm font-semibold text-zinc-700 mb-3">
          <span className="text-zinc-500">💬</span> 本文 <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          value={message}
          onChange={handleChange}
          rows={6}
          className={`w-full rounded-md border bg-white p-2 text-zinc-900 placeholder-zinc-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            errors.message ? "border-red-500" : "border-zinc-300"
          }`}
          placeholder="お問い合わせ内容を詳しくお書きください"
        />
        {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
      </div>

      {/* ファイル添付 */}
      <div className="rounded-2xl border border-white/20 bg-white/90 p-6 shadow-lg backdrop-blur animate-in fade-in-50">
        <label htmlFor="files" className="block text-sm font-semibold text-zinc-700 mb-3">
          <span className="text-zinc-500">📎</span> ファイル添付 (任意)
        </label>

        {/* ファイル選択 */}
        <div className="mb-4">
          <input
            type="file"
            id="files"
            multiple
            onChange={handleFileChange}
            className="w-full rounded-md border border-zinc-300 bg-white p-2 text-zinc-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            accept="*/*"
          />
        </div>


        {/* エラー表示 */}
        {fileErrors.length > 0 && (
          <div className="mb-4 rounded-lg bg-red-50 p-3">
            {fileErrors.map((error, index) => (
              <p key={index} className="text-xs text-red-600">{error}</p>
            ))}
          </div>
        )}

        {/* 添付ファイル一覧 */}
        {attachedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-700">添付ファイル:</p>
            {attachedFiles.map((fileData) => (
              <div key={fileData.id} className="flex items-center justify-between rounded-lg bg-zinc-50 p-3">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-zinc-600">📄</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-700">{fileData.file.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(fileData.file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(fileData.id)}
                  className="rounded-full p-1 text-red-500 hover:bg-red-100 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 送信ボタン */}
      <div className="text-center">
        <button
          type="submit"
          disabled={isSubmitDisabled()}
          className={`inline-flex items-center rounded-xl px-8 py-3 text-lg font-semibold text-white shadow-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            isSubmitDisabled()
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 focus:ring-blue-500"
          }`}
        >
          {isSubmitting ? "送信中..." : "送信する"}
        </button>

        {/* エラーメッセージ表示 */}
        {isMounted && isSubmitDisabled() && !isSubmitting && (
          <div className="mt-4 text-center">
            <p className="text-sm text-red-600">
              {(() => {
                const validationResult = contactFormSchema.safeParse(formData);
                if (!validationResult.success) {
                  return "必須項目を正しく入力してください";
                }
                if (fileErrors.length > 0) {
                  return "ファイルエラーを修正してください";
                }
                return "";
              })()}
            </p>
          </div>
        )}
      </div>
      </motion.form>

      {/* 送信中モーダル */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/20 bg-gradient-to-r from-blue-500/90 to-indigo-500/90 px-5 py-3 backdrop-blur">
              <NotebookText className="h-5 w-5 text-white" aria-hidden="true" />
              <h3 className="text-base font-semibold text-white drop-shadow">お問い合わせを送信中</h3>
            </div>
            <div className="p-8 text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
              <div className="text-sm font-medium text-zinc-700">お問い合わせを送信しています…</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
