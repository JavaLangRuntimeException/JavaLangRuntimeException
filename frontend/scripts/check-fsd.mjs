// FSD の依存のルールを確かめる（CI で実行）。
//  1. 上の層 → 下の層だけ import できる（app > pages > widgets > features > entities > shared）
//  2. 同じ層のスライス同士は import しない（entities は @x の公開口だけ可）
//  3. 別のスライスへは index（公開口）経由だけ
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const LAYERS = ["shared", "entities", "features", "widgets", "pages", "app"];
const SLICED = new Set(["entities", "features", "widgets", "pages"]);
const rank = (l) => LAYERS.indexOf(l);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "gen") continue;
      yield* files(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const errors = [];
for (const file of files(SRC)) {
  const rel = relative(SRC, file).split(sep);
  const layer = rel[0];
  if (!LAYERS.includes(layer)) continue; // BoardUI の components/ styles/ utils/ は shared 扱い
  const slice = SLICED.has(layer) ? rel[1] : null;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+["']@\/([^"']+)["']/g)) {
    const [tLayer, tSlice, ...rest] = m[1].split("/");
    if (!LAYERS.includes(tLayer)) continue;
    const where = `${relative(SRC, file)}: @/${m[1]}`;
    if (rank(tLayer) > rank(layer)) errors.push(`上の層を import している  ${where}`);
    else if (tLayer === layer && SLICED.has(layer) && tSlice !== slice) {
      if (!(layer === "entities" && rest[0] === "@x" && rest[1] === slice)) errors.push(`同じ層の別スライスを import している  ${where}`);
    } else if (SLICED.has(tLayer) && tSlice !== slice && rest.length > 0 && rest[0] !== "@x") {
      errors.push(`公開口（index）を通していない  ${where}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("FSD: OK");
