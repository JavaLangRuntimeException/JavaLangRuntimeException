import { Link } from "react-router";

// 見た目用のクラス（文言は旧サイトと 1 文字も変えない。Google の OAuth 審査に登録済み）
const link = "text-accent-300 underline underline-offset-2 hover:text-accent-200";
const code = "break-all rounded bg-background-secondary-default px-1 font-mono text-[0.9em] text-text-primary";
// Google OAuth の同意画面（ブランディング）に登録している URL。Google API のユーザーデータの扱いを必ず記載する
// （Google の自動チェックが読めるよう英語版も載せる。APP_NAME は同意画面のアプリ名と完全に一致させる）
const UPDATED = "2026年10月6日";
const APP_NAME = "taramanji Calendar Sync";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
      <div className="space-y-3 text-body-regular text-text-secondary">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <title>{"プライバシーポリシー / Privacy Policy | taramanji.com"}</title>
      <meta name="description" content={"taramanji.com と taramanji Calendar Sync のプライバシーポリシー / Privacy Policy for taramanji.com and taramanji Calendar Sync"} />
    <main className="px-4 pb-24 pt-12 sm:px-6">
      <article className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-2">
          <h1 className="text-title-1-semibold text-text-primary">プライバシーポリシー</h1>
          <p className="text-body-2-regular text-text-tertiary">最終更新日: {UPDATED} ／ <a className={link} href="#en">English</a></p>
          <p className="text-body-regular text-text-secondary">
            taramanji.com の運営者（以下「運営者」）は、このサイトおよびカレンダー同期アプリ「{APP_NAME}」（<Link className={link} to="/calendar-sync">taramanji.com/calendar-sync</Link>、以下「本アプリ」）で取り扱う情報について、以下のとおり定めます。
          </p>
        </header>

        <Section title="1. お問い合わせ・お打ち合わせ予約で取得する情報">
          <p>お問い合わせフォーム、お打ち合わせ予約、アンケートでは、お名前・メールアドレス・ご入力いただいた内容を取得します。</p>
          <p>これらは、ご連絡への返信、お打ち合わせの日程調整と実施、研究・活動の改善のためにのみ利用し、法令に基づく場合を除き第三者に提供しません。</p>
        </Section>

        <Section title="2. 本アプリが取得する Google ユーザーデータ">
          <p>本アプリは、運営者が自身の複数の Google アカウントのカレンダーを同期するためのものです。Google アカウントを接続すると、次のデータにアクセスします。</p>
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>メールアドレス（接続したアカウントとメインカレンダーを識別するため）</li>
            <li>メインカレンダーの予定（タイトル・日時・場所・説明・Google Meet の URL・参加状況・公開設定）。対象は過去 1 日から 90 日先まで</li>
          </ul>
          <p>本アプリが要求する権限は、メールアドレスの確認（<code className={code}>email</code>）と <code className={code}>calendar.events</code>（予定の読み取り・作成・更新・削除）のみです。</p>
        </Section>

        <Section title="3. Google ユーザーデータの利用方法">
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>接続した各カレンダーの予定を読み取り、他の接続済みカレンダーに「予定あり」の予定として作成・更新・削除します。</li>
            <li>運営者が「マスター」に指定したカレンダーにだけ、予定のタイトル・場所・説明・Google Meet の URL を記載します。予定の参加者はコピーしません。</li>
            <li>本アプリが作成した予定には識別用の情報を付け、同期の重複や連鎖を防ぎます。</li>
          </ul>
          <p>Google ユーザーデータを広告、販売、信用調査、機械学習モデルの学習、その他カレンダー同期以外の目的に利用することはありません。</p>
        </Section>

        <Section title="4. 保存と保護">
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>接続に必要な更新トークンは AES-256-GCM で暗号化し、運営者が管理するサーバーにのみ保存します。</li>
            <li>予定の本文は保存しません。同期の状態を管理するため、予定の ID・終了日時・内容の変化を判定するハッシュ値のみを保存します。</li>
            <li>本アプリの管理画面を利用できるのは運営者のみです。通信はすべて HTTPS で暗号化されます。</li>
          </ul>
        </Section>

        <Section title="5. 第三者への提供">
          <p>
            Google ユーザーデータを第三者に提供・販売・共有することはありません。ただし、法令に基づく場合、またはサーバーの運用に必要な範囲で通信を中継するサービス（Cloudflare）を利用する場合を除きます。
          </p>
        </Section>

        <Section title="6. Google API サービスのユーザーデータに関するポリシーへの準拠">
          <p>
            本アプリによる Google API から受け取った情報の使用および他のアプリへの転送は、
            <a className={link} href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API サービスのユーザーデータに関するポリシー
            </a>
            （限定使用の要件を含む）に準拠します。
          </p>
        </Section>

        <Section title="7. 削除とアクセスの取り消し">
          <p>本アプリの管理画面で接続を解除すると、保存している更新トークンを削除し、そのカレンダーに本アプリが作成した予定も削除します。</p>
          <p>
            Google アカウントの
            <a className={link} href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">サードパーティ製のアプリとサービス</a>
            から、いつでも本アプリのアクセス権を取り消すことができます。
          </p>
        </Section>

        <Section title="8. お問い合わせ">
          <p>
            本ポリシーに関するお問い合わせは、<Link className={link} to="/contact">お問い合わせフォーム</Link>からご連絡ください。
          </p>
        </Section>

        <hr className="border-separator-border" />

        <header id="en" className="space-y-2">
          <h1 className="text-title-1-semibold text-text-primary">Privacy Policy</h1>
          <p className="text-body-2-regular text-text-tertiary">Last updated: October 6, 2026</p>
          <p className="text-body-regular text-text-secondary">
            This policy explains how the operator of taramanji.com (&quot;we&quot;) handles information on this website and in the calendar
            synchronization app &quot;{APP_NAME}&quot; (<Link className={link} to="/calendar-sync">taramanji.com/calendar-sync</Link>, the &quot;App&quot;).
          </p>
        </header>

        <Section title="1. Contact and meeting reservation forms">
          <p>
            Through the contact form, the meeting reservation form and questionnaires we collect your name, email address and the content you enter.
            We use it only to reply to you, to schedule and hold meetings, and to improve our research and activities. We do not provide it to third parties except as required by law.
          </p>
        </Section>

        <Section title="2. Google user data the App accesses">
          <p>{APP_NAME} lets the operator synchronize the calendars of the operator&apos;s own Google accounts. When a Google account is connected, the App accesses:</p>
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>The account&apos;s email address, to identify the connected account and its primary calendar.</li>
            <li>Events on the primary calendar from 1 day in the past to 90 days in the future: title, date and time, location, description, Google Meet link, response status and visibility.</li>
          </ul>
          <p>
            The App requests only the <code className={code}>email</code> scope and{" "}
            <code className={code}>https://www.googleapis.com/auth/calendar.events</code> (read, create, update and delete events).
          </p>
        </Section>

        <Section title="3. How the App uses Google user data">
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>It reads events on each connected calendar and creates, updates and deletes corresponding &quot;Busy&quot; events on the other connected calendars, so that every calendar shows the correct availability.</li>
            <li>Only on the calendar the operator designates as the &quot;master&quot; does it include the event title, location, description and Google Meet link. Attendees are never copied.</li>
            <li>Events created by the App carry an identifier so they are not synchronized again.</li>
          </ul>
          <p>Google user data is never used for advertising, sold, used for credit assessment, used to train machine learning or AI models, or used for any purpose other than calendar synchronization.</p>
        </Section>

        <Section title="4. Storage and protection">
          <ul className="list-disc space-y-1 ps-6 marker:text-text-tertiary">
            <li>The OAuth refresh token needed for the connection is encrypted with AES-256-GCM and stored only on a server managed by the operator.</li>
            <li>Event contents are not stored. To track synchronization, the App stores only event IDs, end times and a hash used to detect changes.</li>
            <li>Only the operator can sign in to the App&apos;s admin screen. All traffic is encrypted with HTTPS.</li>
          </ul>
        </Section>

        <Section title="5. Sharing">
          <p>We do not share, sell or transfer Google user data to third parties, except as required by law and except for the network provider (Cloudflare) that relays encrypted traffic to our server.</p>
        </Section>

        <Section title="6. Compliance with the Google API Services User Data Policy">
          <p>
            {APP_NAME}&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
            <a className={link} href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="7. Deletion and revoking access">
          <p>
            When an account is disconnected in the App, its stored refresh token is deleted and the events the App created on that calendar are deleted.
            You can also revoke the App&apos;s access at any time from{" "}
            <a className={link} href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Third-party apps &amp; services</a>{" "}
            in your Google Account.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>For questions about this policy, please use the <Link className={link} to="/contact">contact form</Link>.</p>
        </Section>
      </article>
    </main>
    </>
  );
}
