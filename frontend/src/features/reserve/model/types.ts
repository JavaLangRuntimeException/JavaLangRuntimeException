/** 確認・完了画面に出す予約の内容 */
export type ReservationDetails = {
  year: number | null;
  month: number | null;
  day: number | null;
  weekday: string;
  startHour: number | null;
  startMin: number | null;
  endHour: number | null;
  endMin: number | null;
  name: string;
  purpose: string;
  email: string;
  discordName: string;
  slackName: string;
  otherNote: string;
  offlinePlaceLink?: string;
  offlinePlaceName?: string;
  offlinePlaceDetail?: string;
  meetingNote?: string;
};
