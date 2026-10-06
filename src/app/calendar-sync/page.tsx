import type { Metadata } from "next";
import Link from "next/link";

// Google OAuth の同意画面に「アプリのホームページ」として登録しているページ（ログイン不要）。
// APP_NAME は同意画面のアプリ名と完全に一致させる
const APP_NAME = "taramanji Calendar Sync";

export const metadata: Metadata = {
  title: `${APP_NAME} | taramanji.com`,
  description: `${APP_NAME} は、複数の Google アカウントのカレンダーの予定を相互に同期するアプリです。`,
};

export default function CalendarSyncHome() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-black px-4 py-16">
      <article className="mx-auto max-w-3xl space-y-10 text-zinc-300 leading-relaxed">
        <header className="space-y-3">
          <h1 className="text-4xl font-bold text-white">{APP_NAME}</h1>
          <p className="text-lg">
            {APP_NAME} は、taramanji.com の運営者が自身の複数の Google アカウント（仕事・個人）のカレンダーを、ひとつにまとめるためのアプリです。
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">できること</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>接続した各アカウントのメインカレンダーの予定を読み取り、他のカレンダーに「予定あり」として反映します。どのカレンダーから見ても空き時間が正しくなり、ダブルブッキングを防げます。</li>
            <li>「マスター」に指定したカレンダーには、すべての予定がタイトル・場所・説明付きで入ります。参加者はコピーしません。</li>
            <li>予定の変更・削除も 5 分ごとに反映します。接続はいつでも解除でき、解除するとこのアプリが作った予定も削除します。</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Google ユーザーデータの扱い</h2>
          <p>
            Google アカウントの接続時に、メールアドレスとカレンダーの予定の読み取り・作成・更新・削除（<code className="text-zinc-200">calendar.events</code>）の許可をお願いします。
            データはカレンダーの同期にのみ使い、第三者への提供や広告・AI の学習には使いません。詳しくは<Link className="text-blue-300 underline" href="/privacy">プライバシーポリシー</Link>をご覧ください。
          </p>
        </section>

        <hr className="border-gray-700" />

        <section lang="en" className="space-y-3">
          <h2 className="text-2xl font-semibold text-white">{APP_NAME} (English)</h2>
          <p>
            {APP_NAME} lets the operator of taramanji.com combine the calendars of the operator&apos;s own Google accounts (work and personal) into one.
            It reads events on each connected primary calendar and mirrors them as &quot;Busy&quot; events on the other connected calendars, so availability is
            correct everywhere and double bookings are avoided. The calendar designated as the &quot;master&quot; receives every event with its title, location and
            description; attendees are never copied. Changes and deletions are synchronized every 5 minutes, and disconnecting an account removes the events the App created.
          </p>
          <p>
            When connecting a Google account, the App asks for your email address and permission to read, create, update and delete calendar events
            (<code className="text-zinc-200">calendar.events</code>). This data is used only for calendar
            synchronization and is never shared with third parties or used for advertising or AI training. See the{" "}
            <Link className="text-blue-300 underline" href="/privacy#en">Privacy Policy</Link> for details.
          </p>
        </section>

        <footer className="flex gap-4 text-sm">
          <Link className="text-blue-300 underline" href="/privacy">プライバシーポリシー / Privacy Policy</Link>
          <Link className="text-blue-300 underline" href="/contact">お問い合わせ / Contact</Link>
        </footer>
      </article>
    </main>
  );
}
