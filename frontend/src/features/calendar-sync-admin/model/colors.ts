// Google カレンダーの予定の色（全アカウント共通のパレット。名前は Google カレンダーの日本語表示と同じ）。
// 色の値は Google カレンダーでの見え方に合わせたデータの色（デザインのトークンではない）
export const CALENDAR_COLORS = [
  { id: "11", name: "トマト", hex: "#D50000" },
  { id: "4", name: "フラミンゴ", hex: "#E67C73" },
  { id: "6", name: "ミカン", hex: "#F4511E" },
  { id: "5", name: "バナナ", hex: "#F6BF26" },
  { id: "2", name: "セージ", hex: "#33B679" },
  { id: "10", name: "バジル", hex: "#0B8043" },
  { id: "7", name: "ピーコック", hex: "#039BE5" },
  { id: "9", name: "ブルーベリー", hex: "#3F51B5" },
  { id: "1", name: "ラベンダー", hex: "#7986CB" },
  { id: "3", name: "ブドウ", hex: "#8E24AA" },
  { id: "8", name: "グラファイト", hex: "#616161" },
] as const;

export const colorOf = (id: string) => CALENDAR_COLORS.find((c) => c.id === id);
