// 勤務場所の定義（色・漢字1文字・ラベル）
// 各ページで使用: /location, /reserve (WeekGrid), /admin

export type LocationStyle = {
  /** カレンダー用ドット背景色 (dark theme) */
  dot: string;
  /** テキスト色 (dark theme) */
  text: string;
  /** テキスト色 (light theme, reserve用) */
  textLight: string;
  /** カレンダー用漢字1文字 */
  char: string;
  /** reserve用フルラベル（短縮する場合のみ上書き） */
  label: string;
};

export const LOCATION_STYLES: Record<string, LocationStyle> = {
  "滋賀県草津市":           { dot: "bg-emerald-400", text: "text-emerald-300", textLight: "text-emerald-600", char: "草", label: "滋賀県草津市" },
  "滋賀県（草津市以外）":     { dot: "bg-emerald-600", text: "text-emerald-400", textLight: "text-emerald-700", char: "滋", label: "滋賀県（草津市以外）" },
  "京都府京都市":           { dot: "bg-purple-400",  text: "text-purple-300",  textLight: "text-purple-600",  char: "京", label: "京都府京都市" },
  "京都府（京都市以外）":     { dot: "bg-purple-600",  text: "text-purple-400",  textLight: "text-purple-700",  char: "都", label: "京都府（京都市以外）" },
  "大阪府大阪市":           { dot: "bg-orange-400",  text: "text-orange-300",  textLight: "text-orange-600",  char: "阪", label: "大阪府大阪市" },
  "大阪府茨木市":           { dot: "bg-amber-400",   text: "text-amber-300",   textLight: "text-amber-600",   char: "茨", label: "大阪府茨木市" },
  "大阪府（大阪市・茨木市以外）": { dot: "bg-orange-600", text: "text-orange-400", textLight: "text-orange-700", char: "大", label: "大阪府（他）" },
  "東京都渋谷区":           { dot: "bg-pink-400",    text: "text-pink-300",    textLight: "text-pink-500",    char: "渋", label: "東京都渋谷区" },
  "東京都（渋谷区以外）":     { dot: "bg-pink-500",    text: "text-pink-400",    textLight: "text-pink-600",    char: "東", label: "東京都（渋谷区以外）" },
  "愛知県名古屋市":         { dot: "bg-blue-400",    text: "text-blue-300",    textLight: "text-blue-600",    char: "名", label: "愛知県名古屋市" },
  "愛知県（名古屋市以外）":   { dot: "bg-blue-600",    text: "text-blue-400",    textLight: "text-blue-700",    char: "愛", label: "愛知県（名古屋市以外）" },
  "岐阜県":               { dot: "bg-lime-400",    text: "text-lime-300",    textLight: "text-lime-600",    char: "岐", label: "岐阜県" },
  "リモート":              { dot: "bg-cyan-400",    text: "text-cyan-300",    textLight: "text-cyan-600",    char: "リ", label: "リモート" },
  "未定（お問い合わせください）": { dot: "bg-gray-400",   text: "text-gray-400",   textLight: "text-gray-500",   char: "？", label: "？" },
  "対応不可日・休日":        { dot: "bg-red-600",     text: "text-red-400",    textLight: "text-red-700",     char: "休", label: "休" },
};

export const DEFAULT_LOCATION_STYLE: LocationStyle = {
  dot: "bg-white", text: "text-white/80", textLight: "text-gray-500", char: "・", label: "",
};

/** admin用: 場所名の配列 */
export const LOCATION_OPTIONS = Object.keys(LOCATION_STYLES);

export function getLocationStyle(location: string): LocationStyle {
  return LOCATION_STYLES[location] || DEFAULT_LOCATION_STYLE;
}
