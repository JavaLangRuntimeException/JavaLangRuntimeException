import { describe, expect, it } from "vitest";
import { isHidden, isValidKey, itemsFromFiles, planUpload, uploadAll, type UploadItem } from "./upload";

const file = (name: string) => new File(["x"], name);
const item = (path: string): UploadItem => ({ path, file: file(path.split("/").pop() ?? path) });

describe("まとめてアップロード", () => {
  it("隠しファイル（. で始まる名前・.git の中・Thumbs.db）は置かない", () => {
    expect(isHidden(".env")).toBe(true);
    expect(isHidden("dist/.DS_Store")).toBe(true);
    expect(isHidden(".git/config")).toBe(true);
    expect(isHidden("a/Thumbs.db")).toBe(true);
    expect(isHidden("dist/index.html")).toBe(false);
    expect(isHidden("assets/app.v1.js")).toBe(false);
    expect(isHidden(".well-known/security.txt")).toBe(false);
    expect(isHidden(".well-known/.secret")).toBe(true);
  });
  it("ストレージと同じ決まりでキーを確かめる", () => {
    expect(isValidKey("dist/assets/日本語 1.png")).toBe(true);
    for (const bad of ["", "/a", "a/", "a//b", "a/./b", "a/../b", "a\\b", "x".repeat(1025)]) expect(isValidKey(bad)).toBe(false);
  });
  it("今いるフォルダーの下に置き、隠しファイルと置けない名前を分ける", () => {
    const plan = planUpload("site/", [item("dist/index.html"), item("dist/.env"), item("dist/assets/a.js"), item("a\\b")]);
    expect(plan.upload.map((u) => u.path)).toEqual(["site/dist/assets/a.js", "site/dist/index.html"]);
    expect(plan.hidden).toEqual(["dist/.env"]);
    expect(plan.invalid).toEqual(["a\\b"]);
  });
  it("フォルダーを選んだときは webkitRelativePath を使う", () => {
    const f = file("index.html");
    Object.defineProperty(f, "webkitRelativePath", { value: "dist/index.html" });
    expect(itemsFromFiles([f, file("a.png")]).map((i) => i.path)).toEqual(["dist/index.html", "a.png"]);
  });
  it("並べて置き、進みぐあいを返す", async () => {
    const seen: string[] = [];
    const progress: number[] = [];
    await uploadAll(
      ["a", "b", "c", "d", "e"].map(item),
      async (it) => {
        seen.push(it.path);
      },
      (done) => progress.push(done),
      2,
    );
    expect(seen.sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(progress).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("1 つ失敗したら、パスを付けて止める", async () => {
    await expect(
      uploadAll(
        ["a", "b", "c"].map(item),
        async (it) => {
          if (it.path === "b") throw new Error("ファイルが大きすぎます");
        },
        () => {},
        1,
      ),
    ).rejects.toThrow("b: ファイルが大きすぎます");
  });
});
