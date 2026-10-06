import { describe, expect, it } from "vitest";
import { submitErrorMessage, DEFAULT_SUBMIT_ERROR } from "./errors";
import { addFiles, formatFileSize, MAX_FILE_BYTES } from "./files";
import { isContactValid, validateContact, type ContactFormData } from "./schema";

const base: ContactFormData = { email: "a@example.com", name: "山田", subject: "件名", purpose: "taramanji", message: "本文" };

describe("contact schema", () => {
  it("必須項目がそろえば通る", () => {
    expect(validateContact(base)).toEqual({});
    expect(isContactValid(base)).toBe(true);
  });
  it("旧実装と同じ文言で落ちる", () => {
    expect(validateContact({ ...base, email: "" }).email).toBe("メールアドレスは必須です");
    expect(validateContact({ ...base, email: "x" }).email).toBe("有効なメールアドレスを入力してください");
    expect(validateContact({ ...base, purpose: "" }).purpose).toBe("問い合わせ要件を選択してください");
  });
  it("Ask Me は EventID 必須（ボタンの判定は基本スキーマのまま）", () => {
    const askMe = { ...base, purpose: "Ask Me" };
    expect(validateContact(askMe).eventId).toBe("EventIDは必須です");
    expect(isContactValid(askMe)).toBe(true);
    expect(validateContact({ ...askMe, eventId: "abc" })).toEqual({});
  });
});

describe("attachments", () => {
  const f = (name: string, size: number) => new File([new Uint8Array(size)], name);
  it("5 個・3MB・重複を弾く", () => {
    const r1 = addFiles([], [f("a.txt", 10), f("big.bin", MAX_FILE_BYTES + 1)]);
    expect(r1.added.map((a) => a.file.name)).toEqual(["a.txt"]);
    expect(r1.errors).toEqual(["big.bin: ファイルサイズは3MB以下にしてください"]);
    const r2 = addFiles(r1.added, [f("a.txt", 1)]);
    expect(r2.errors).toEqual(["a.txt: 同じファイル名のファイルが既に添付されています"]);
    const r3 = addFiles([], Array.from({ length: 6 }, (_, i) => f(`${i}.txt`, 1)));
    expect(r3.errors[0]).toBe("ファイルは最大5個まで添付できます");
  });
  it("サイズ表記", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
});

describe("submit errors", () => {
  it("コードごとの文言", () => {
    expect(submitErrorMessage("invalid_email")).toBe("メールアドレスの形式が正しくありません。");
    expect(submitErrorMessage("email_send_failed", "x")).toContain("\n詳細: x");
    expect(submitErrorMessage("internal")).toBe(DEFAULT_SUBMIT_ERROR);
  });
});
