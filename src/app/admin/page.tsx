"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type ICalEvent = {
  start: string;
  end: string;
  summary?: string;
  source?: string;
  sourceUrl?: string;
};

type ICalSource = {
  url: string;
  name: string;
  ok: boolean;
  status: number;
  eventCount: number;
};

type LocationMap = Record<string, string>;

const LOCATION_OPTIONS = [
  "滋賀県草津市",
  "滋賀県草津市以外",
  "京都府京都市",
  "京都府京都市以外",
  "大阪府大阪市内",
  "大阪府茨木市内",
  "大阪府その他",
  "東京都渋谷区内",
  "東京都渋谷区以外",
  "愛知県名古屋市内",
  "愛知県名古屋市以外",
  "岐阜県内",
  "リモートのみ対応",
  "その他(問い合わせください)",
  "未定",
];

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ical" | "email" | "location">("ical");

  // iCal state
  const [icalSources, setIcalSources] = useState<ICalSource[]>([]);
  const [icalEvents, setIcalEvents] = useState<ICalEvent[]>([]);
  const [icalLoading, setIcalLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Email state
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState(`この度は、taramanji.comにお問い合わせいただき、ありがとうございます。

管理者からのメッセージです。



---
taramanji.com

※このメールは送信専用です。ご返信いただいても対応できない場合がございます。
お問い合わせは、Contactページ（https://taramanji.com/contact）からお願いいたします。`);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Location state
  const [locations, setLocations] = useState<LocationMap>({});
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationDate, setLocationDate] = useState("");
  const [locationValue, setLocationValue] = useState(LOCATION_OPTIONS[0]);
  const [locationResult, setLocationResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // セッションがない場合はログイン画面にリダイレクト
    if (status !== "loading" && !session?.user?.email) {
      router.push("/admin/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status]);

  const handleLogout = async () => {
    // セッションからログアウト
    signOut({ callbackUrl: "/" });
  };

  const fetchIcalSources = async () => {
    setIcalLoading(true);
    try {
      const monday = getWeekMonday(weekOffset);
      const res = await fetch(`/api/admin/ical-sources?weekStartISO=${monday.toISOString()}`);
      const data = await res.json();

      if (data.error) {
        console.error("Failed to fetch iCal sources:", data.error);
        return;
      }

      setIcalSources(data.sources || []);
      setIcalEvents(data.events || []);
    } catch (error) {
      console.error("Failed to fetch iCal sources:", error);
    } finally {
      setIcalLoading(false);
    }
  };

  const sendEmail = async () => {
    if (!emailTo || !emailSubject || !emailBody) {
      setEmailResult({ ok: false, message: "全ての項目を入力してください" });
      return;
    }

    setEmailSending(true);
    setEmailResult(null);

    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setEmailResult({ ok: true, message: "メールを送信しました" });
        setEmailTo("");
        setEmailSubject("");
        setEmailBody(`この度は、taramanji.comにお問い合わせいただき、ありがとうございます。

管理者からのメッセージです。



---
※このメールは送信専用です。ご返信いただいても対応できない場合がございます。
お問い合わせは、Contactページ（https://taramanji.com/contact）からお願いいたします。`);
      } else {
        setEmailResult({ ok: false, message: data.error || "送信に失敗しました" });
      }
    } catch {
      setEmailResult({ ok: false, message: "エラーが発生しました" });
    } finally {
      setEmailSending(false);
    }
  };

  const fetchLocations = async () => {
    setLocationLoading(true);
    try {
      const res = await fetch("/api/admin/location");
      const data = await res.json();
      if (data.ok) {
        setLocations(data.locations || {});
      }
    } catch (error) {
      console.error("Failed to fetch locations:", error);
    } finally {
      setLocationLoading(false);
    }
  };

  const saveLocation = async () => {
    if (!locationDate || !locationValue) {
      setLocationResult({ ok: false, message: "日付と場所を選択してください" });
      return;
    }
    try {
      const res = await fetch("/api/admin/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: locationDate, location: locationValue }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocationResult({ ok: true, message: "保存しました" });
        setLocationDate("");
        fetchLocations();
      } else {
        setLocationResult({ ok: false, message: data.error || "保存に失敗しました" });
      }
    } catch {
      setLocationResult({ ok: false, message: "エラーが発生しました" });
    }
  };

  const deleteLocation = async (date: string) => {
    try {
      const res = await fetch("/api/admin/location", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchLocations();
      }
    } catch (error) {
      console.error("Failed to delete location:", error);
    }
  };

  const getWeekMonday = (offset: number): Date => {
    const now = new Date();
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + diff + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const formatDate = (iso: string): string => {
    const date = new Date(iso);
    return date.toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getWeekLabel = (): string => {
    const monday = getWeekMonday(weekOffset);
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
    return `${monday.getMonth() + 1}/${monday.getDate()} - ${sunday.getMonth() + 1}/${sunday.getDate()}`;
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black">
      {/* Header */}
      <header className="bg-gray-800/50 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm">{session.user?.email}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("ical")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "ical"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            iCal予定確認
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "email"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            メール送信
          </button>
          <button
            onClick={() => { setActiveTab("location"); fetchLocations(); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "location"
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            勤務場所
          </button>
        </div>

        {/* iCal Tab */}
        {activeTab === "ical" && (
          <div className="space-y-6">
            {/* Controls */}
            <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setWeekOffset((prev) => prev - 1)}
                    className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                  >
                    ← 前週
                  </button>
                  <span className="text-white font-medium px-4">{getWeekLabel()}</span>
                  <button
                    onClick={() => setWeekOffset((prev) => prev + 1)}
                    className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                  >
                    次週 →
                  </button>
                  <button
                    onClick={() => setWeekOffset(0)}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 ml-2"
                  >
                    今週
                  </button>
                </div>
                <button
                  onClick={fetchIcalSources}
                  disabled={icalLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {icalLoading ? "読み込み中..." : "取得"}
                </button>
              </div>
            </div>

            {/* Sources */}
            <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">カレンダーソース</h2>
              {icalSources.length === 0 ? (
                <p className="text-gray-400">「取得」ボタンを押してデータを読み込んでください</p>
              ) : (
                <div className="space-y-2">
                  {icalSources.map((source, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        source.ok ? "bg-green-900/30" : "bg-red-900/30"
                      }`}
                    >
                      <div>
                        <span className="text-white font-medium">{source.name}</span>
                        <span className="text-gray-400 text-sm ml-2">({source.url})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-300 text-sm">{source.eventCount} 件</span>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            source.ok
                              ? "bg-green-600 text-white"
                              : "bg-red-600 text-white"
                          }`}
                        >
                          {source.ok ? "OK" : `Error ${source.status}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Events */}
            <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Busy予定一覧 ({icalEvents.length} 件)
              </h2>
              {icalEvents.length === 0 ? (
                <p className="text-gray-400">予定がありません</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {icalEvents.map((event, i) => (
                    <div
                      key={i}
                      className="bg-gray-700/50 p-3 rounded-lg border border-gray-600"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-medium">{event.summary}</p>
                          <p className="text-gray-300 text-sm">
                            {formatDate(event.start)} → {formatDate(event.end)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block bg-blue-600/50 text-blue-200 text-xs px-2 py-1 rounded">
                            {event.source}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Location Tab */}
        {activeTab === "location" && (
          <div className="space-y-6">
            {/* Add Location */}
            <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">勤務場所を登録</h2>

              {locationResult && (
                <div
                  className={`mb-4 px-4 py-2 rounded-lg ${
                    locationResult.ok
                      ? "bg-green-500/20 border border-green-500 text-green-200"
                      : "bg-red-500/20 border border-red-500 text-red-200"
                  }`}
                >
                  {locationResult.message}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-gray-300 text-sm mb-1">日付</label>
                  <input
                    type="date"
                    value={locationDate}
                    onChange={(e) => setLocationDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-gray-300 text-sm mb-1">勤務場所</label>
                  <select
                    value={locationValue}
                    onChange={(e) => setLocationValue(e.target.value)}
                    className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {LOCATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={saveLocation}
                    disabled={!locationDate}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>

            {/* Location List */}
            <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  登録済み勤務場所 ({Object.keys(locations).length} 件)
                </h2>
                <button
                  onClick={fetchLocations}
                  disabled={locationLoading}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 text-sm"
                >
                  {locationLoading ? "読み込み中..." : "更新"}
                </button>
              </div>

              {Object.keys(locations).length === 0 ? (
                <p className="text-gray-400">登録がありません</p>
              ) : (
                <div className="space-y-2">
                  {Object.keys(locations)
                    .sort()
                    .map((date) => {
                      const d = new Date(date + "T00:00:00");
                      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
                      const label = `${d.getMonth() + 1}/${d.getDate()}（${dayNames[d.getDay()]}）`;
                      return (
                        <div
                          key={date}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-700/50 border border-gray-600"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-white font-medium min-w-[100px]">
                              {label}
                            </span>
                            <span className="text-gray-300">{locations[date]}</span>
                          </div>
                          <button
                            onClick={() => deleteLocation(date)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                          >
                            削除
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === "email" && (
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-4">メール送信</h2>

            {emailResult && (
              <div
                className={`mb-4 px-4 py-2 rounded-lg ${
                  emailResult.ok
                    ? "bg-green-500/20 border border-green-500 text-green-200"
                    : "bg-red-500/20 border border-red-500 text-red-200"
                }`}
              >
                {emailResult.message}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-1">宛先</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">件名</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="件名を入力"
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm mb-1">本文</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="メール本文を入力"
                  rows={8}
                  className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <button
                onClick={sendEmail}
                disabled={emailSending || !emailTo || !emailSubject || !emailBody}
                className="w-full bg-blue-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailSending ? "送信中..." : "送信"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
