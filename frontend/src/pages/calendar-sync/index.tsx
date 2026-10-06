import { Link } from "react-router";

// 見た目用のクラス（文言は旧サイトと 1 文字も変えない。Google の OAuth 審査に登録済み）
const link = "text-accent-300 underline underline-offset-2 hover:text-accent-200";
const code = "rounded bg-background-secondary-default px-1 font-mono text-[0.9em] text-text-primary";
// Google OAuth の同意画面に「アプリのホームページ」として登録しているページ（ログイン不要）。
// APP_NAME は同意画面のアプリ名と完全に一致させる
const APP_NAME = "taramanji Calendar Sync";

export default function CalendarSyncHome() {
  return (
    <>
      <title>{`${APP_NAME} | taramanji.com`}</title>
      <meta name="description" content={`${APP_NAME} は、複数の Google アカウントのカレンダーの予定を相互に同期するアプリです。`} />
    <main className="px-4 pb-24 pt-12 sm:px-6">
      <article className="mx-auto max-w-3xl space-y-10 text-body-regular text-text-secondary">
        <header className="space-y-3">
          <h1 className="text-title-1-semibold text-text-primary">{APP_NAME}</h1>
          <p className="text-headline-regular text-text-secondary">
            {APP_NAME} は、taramanji.com の運営者が自身の複数の Google アカウント（仕事・個人）のカレンダーを、ひとつにまとめるためのアプリです。
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-title-3-semibold text-text-primary">できること</h2>
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>接続した各アカウントのメインカレンダーの予定を読み取り、他のカレンダーに「予定あり」として反映します。どのカレンダーから見ても空き時間が正しくなり、ダブルブッキングを防げます。</li>
            <li>「マスター」に指定したカレンダーには、すべての予定がタイトル・場所・説明付きで入ります。参加者はコピーしません。</li>
            <li>予定の変更・削除も 5 分ごとに反映します。接続はいつでも解除でき、解除するとこのアプリが作った予定も削除します。</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-title-3-semibold text-text-primary">Google ユーザーデータの扱い</h2>
          <p>
            Google アカウントの接続時に、メールアドレスとカレンダーの予定の読み取り・作成・更新・削除（<code className={code}>calendar.events</code>）の許可をお願いします。
            データはカレンダーの同期にのみ使い、第三者への提供や広告・AI の学習には使いません。詳しくは<Link className={link} to="/privacy">プライバシーポリシー</Link>をご覧ください。
          </p>
        </section>

        <hr className="border-separator-border" />

        <section lang="en" className="space-y-3">
          <h2 className="text-title-2-semibold text-text-primary">{APP_NAME} (English)</h2>
          <p>
            {APP_NAME} lets the operator of taramanji.com combine the calendars of the operator&apos;s own Google accounts (work and personal) into one.
            It reads events on each connected primary calendar and mirrors them as &quot;Busy&quot; events on the other connected calendars, so availability is
            correct everywhere and double bookings are avoided. The calendar designated as the &quot;master&quot; receives every event with its title, location and
            description; attendees are never copied. Changes and deletions are synchronized every 5 minutes, and disconnecting an account removes the events the App created.
          </p>
          <p>
            When connecting a Google account, the App asks for your email address and permission to read, create, update and delete calendar events
            (<code className={code}>calendar.events</code>). This data is used only for calendar
            synchronization and is never shared with third parties or used for advertising or AI training. See the{" "}
            <Link className={link} to="/privacy#en">Privacy Policy</Link> for details.
          </p>
        </section>

        <footer className="flex flex-wrap gap-4 border-t border-separator-border pt-6 text-body-2-regular">
          <Link className={link} to="/privacy">プライバシーポリシー / Privacy Policy</Link>
          <Link className={link} to="/contact">お問い合わせ / Contact</Link>
        </footer>
      </article>
    </main>
    </>
  );
}
