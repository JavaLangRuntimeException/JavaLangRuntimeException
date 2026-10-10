// 文字が定まるまでに流れる記号。全角の文字には全角、半角の文字には半角の記号を当て、幅の揺れを小さくする
export const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ０１＜＞／＝＋＊＃％｛｝";
const ASCII_GLYPHS = "01<>/=+*#%{}$_;:";
// 記号にしない文字（句読点・空白）
export const KEEP = new Set(["、", "。", " ", "　", "・", "/"]);

export function glyphFor(ch: string, i: number, bucket: number) {
  const set = ch.charCodeAt(0) < 0x7f ? ASCII_GLYPHS : GLYPHS;
  // 位置と時間を混ぜて散らす（単純な掛け算だと、時間によっては 2 種類の記号の繰り返しになる）
  let h = (Math.imul(i, 0x9e3779b1) + Math.imul(bucket, 0x85ebca6b)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return set[(h >>> 0) % set.length];
}
