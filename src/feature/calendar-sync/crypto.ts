import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 更新トークンは AES-256-GCM で暗号化して Redis に置く（鍵は k8s の Secret）
function key(): Buffer {
  const k = Buffer.from(process.env.CALENDAR_SYNC_ENC_KEY || "", "base64");
  if (k.length !== 32) throw new Error("CALENDAR_SYNC_ENC_KEY に 32 バイトの鍵（base64）を設定してください");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

export function decrypt(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1") throw new Error("unknown token format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
