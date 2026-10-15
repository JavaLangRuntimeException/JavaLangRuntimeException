// Google カレンダーの予定の色（全アカウント共通のパレット。名前は Google カレンダーの日本語・英語表示と同じ）。
// 色の値は Google カレンダーでの見え方に合わせたデータの色（デザインのトークンではない）
export const CALENDAR_COLORS = [
  { id: "11", name: { ja: "トマト", en: "Tomato" }, hex: "#D50000" },
  { id: "4", name: { ja: "フラミンゴ", en: "Flamingo" }, hex: "#E67C73" },
  { id: "6", name: { ja: "ミカン", en: "Tangerine" }, hex: "#F4511E" },
  { id: "5", name: { ja: "バナナ", en: "Banana" }, hex: "#F6BF26" },
  { id: "2", name: { ja: "セージ", en: "Sage" }, hex: "#33B679" },
  { id: "10", name: { ja: "バジル", en: "Basil" }, hex: "#0B8043" },
  { id: "7", name: { ja: "ピーコック", en: "Peacock" }, hex: "#039BE5" },
  { id: "9", name: { ja: "ブルーベリー", en: "Blueberry" }, hex: "#3F51B5" },
  { id: "1", name: { ja: "ラベンダー", en: "Lavender" }, hex: "#7986CB" },
  { id: "3", name: { ja: "ブドウ", en: "Grape" }, hex: "#8E24AA" },
  { id: "8", name: { ja: "グラファイト", en: "Graphite" }, hex: "#616161" },
] as const;

export const colorOf = (id: string) => CALENDAR_COLORS.find((c) => c.id === id);
