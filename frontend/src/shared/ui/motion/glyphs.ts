// 文字が定まるまでに流れる記号。全角の文字には全角、半角の文字には半角の記号を当て、幅の揺れを小さくする
export const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ０１＜＞／＝＋＊＃％｛｝";
const ASCII_GLYPHS = "01<>/=+*#%{}$_;:";
// 記号にしない文字（句読点・空白）
export const KEEP = new Set(["、", "。", " ", "　", "・", "/"]);

export function glyphFor(ch: string, i: number, bucket: number) {
  const set = ch.charCodeAt(0) < 0x7f ? ASCII_GLYPHS : GLYPHS;
  return set[(i * 7 + bucket * 13 + i * bucket) % set.length];
}
