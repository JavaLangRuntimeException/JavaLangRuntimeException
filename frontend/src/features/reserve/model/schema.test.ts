import { describe, expect, it } from "vitest";
import { contactErrors } from "./schema";

const base = { name: "山田", email: "a@example.com", purpose: "STECH", contactMethod: "meet" };

describe("contactErrors", () => {
  // 空のメールは「入力必須」と「形式」の両方が出て、後のもの（形式）が残る（旧実装の zod v3 と同じ）
  it("必須と形式（旧実装と同じ文言）", () => {
    expect(contactErrors({ ...base, name: " ", email: "", purpose: "", contactMethod: "" })).toEqual({
      name: "入力必須です",
      email: "正しいメールアドレスを入力してください",
      purpose: "選択してください",
      contactMethod: "選択してください",
    });
    expect(contactErrors({ ...base, email: "bad" }).email).toBe("正しいメールアドレスを入力してください");
    expect(contactErrors(base)).toEqual({});
  });
  it("媒体ごとの必須", () => {
    expect(contactErrors({ ...base, contactMethod: "discord" })).toEqual({ discordServer: "入力必須です", discordName: "入力必須です" });
    expect(contactErrors({ ...base, contactMethod: "slack", slackWorkspace: "w" })).toEqual({ slackName: "入力必須です" });
    expect(contactErrors({ ...base, contactMethod: "offline" }).offlinePlaceLink).toBe("Googleマップの共有リンクを入力してください");
    expect(contactErrors({ ...base, contactMethod: "offline", offlinePlaceLink: "https://goo.gl/maps/x" }).offlinePlaceLink).toBe(
      "https://maps.app.goo.gl/から始まるリンクを記入してください",
    );
    expect(contactErrors({ ...base, contactMethod: "offline", offlinePlaceLink: "https://maps.app.goo.gl/abc" })).toEqual({});
  });
});
