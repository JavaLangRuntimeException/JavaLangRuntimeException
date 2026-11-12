import { describe, expect, it } from "vitest";
import { filterGroups, serviceOf, services } from "./nav";

describe("サービスの一覧", () => {
  it("パスからサービスを引く", () => {
    expect(serviceOf("/functions")?.id).toBe("functions");
    expect(serviceOf("/storage/site")?.id).toBe("storage");
    expect(serviceOf("/")).toBeUndefined();
    expect(serviceOf("/functionsx")).toBeUndefined();
  });
  it("パスと ID は重複しない", () => {
    expect(new Set(services.map((s) => s.to)).size).toBe(services.length);
    expect(new Set(services.map((s) => s.id)).size).toBe(services.length);
  });
  it("名前と説明で絞り込み、空の分類は出さない", () => {
    expect(filterGroups("")).toHaveLength(7);
    expect(filterGroups("secret").flatMap((g) => g.services.map((s) => s.id))).toEqual(["secrets"]);
    expect(filterGroups("api").flatMap((g) => g.services.map((s) => s.id))).toEqual(["apis"]);
    expect(filterGroups("バケット").flatMap((g) => g.services.map((s) => s.id))).toEqual(["cdn", "storage"]);
    expect(filterGroups("zzz")).toEqual([]);
  });
});
