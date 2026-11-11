import type { ReactNode } from "react";
import type { ServiceId } from "@/lib/nav";
import { ArchitectureDiagram, C, Code, H2, Note, P, Steps, Table, To, UL } from "@/components/Doc";

export type Article = {
  slug: string;
  title: string;
  /** 一覧に出す 1〜2 文 */
  summary: string;
  /** 読む・手を動かす目安（分） */
  minutes: number;
  /** 一覧のアイコン */
  icon: ServiceId;
  kind: "concept" | "tutorial" | "reference";
  /** ページ内の見出し（右の目次） */
  toc: { id: string; label: string }[];
  body: () => ReactNode;
};

const cdnHost = <C>&lt;名前&gt;-cdn-cloud.taramanji.com</C>;
const apiHost = <C>&lt;名前&gt;-apigw-cloud.taramanji.com</C>;
const storageHost = <C>&lt;バケット&gt;-storage-cloud.taramanji.com</C>;

export const articles: Article[] = [
  {
    slug: "overview",
    title: "taramanji cloud のしくみ",
    summary: "何ができて、リクエストがどこを通り、設定がどこに保存されるか。最初に読むページです。",
    minutes: 5,
    icon: "guide",
    kind: "concept",
    toc: [
      { id: "what", label: "何ができるか" },
      { id: "flow", label: "リクエストの流れ" },
      { id: "entry", label: "入口ごとのログイン" },
      { id: "yaml", label: "設定は YAML で残る" },
      { id: "env", label: "環境（本番・stg・dev）" },
      { id: "names", label: "名前と URL" },
    ],
    body: () => (
      <>
        <H2 id="what">何ができるか</H2>
        <P>
          taramanji cloud は、家の Mac mini の上で動く、自分専用の小さなクラウドです。AWS の Lambda・API Gateway・S3・CloudFront・RDS / ElastiCache
          にあたるものを、このコンソールから作れます。
        </P>
        <Table
          rows={[
            ["サービス", "AWS でいうと", "できること"],
            [<To to="/functions">関数</To>, "Lambda", "コンテナイメージを、リクエストが来たときだけ動かす"],
            [<To to="/apis">API Gateway</To>, "API Gateway", "ホスト名とパスを、関数に結びつけて公開する"],
            [<To to="/storage">ストレージ</To>, "S3", "ファイルを置くバケット"],
            [<To to="/cdn">CDN</To>, "CloudFront", "バケットや API Gateway を自分だけに出し（ログインあり）、Cloudflare にキャッシュさせる"],
            [<To to="/databases">データベース</To>, "RDS / ElastiCache", "PostgreSQL と Redis を切り出して、関数につなぐ"],
          ]}
        />
        <P>1 つのアプリは、1 つのリポジトリから作るイメージを 1 つの関数で動かし、1 つのホスト名で公開する、という単位を想定しています。</P>

        <H2 id="flow">リクエストの流れ</H2>
        <ArchitectureDiagram />
        <UL>
          <li>
            利用者は CDN（{cdnHost}）・API Gateway（{apiHost}）・公開バケット（{storageHost}）にアクセスします。Cloudflare が証明書と DNS を受け持ち、トンネルで家のクラスターに届けます。
          </li>
          <li>
            API Gateway（<C>cloud-gw</C>）が、その名前の API か CDN の設定を見て、渡し先の関数かバケットを決めます。CDN の元が API のときは、その API のホスト名で入口（Envoy）に渡し直すので、API のルート・認証・CORS がそのまま効きます。
          </li>
          <li>関数が 0 台なら、ここで 1 台に起こしてから渡します。しばらくリクエストが来なければ、また 0 台に戻します。</li>
          <li>
            関数は 1 つずつ別の namespace で動き、つないだデータベースとバケットだけを使えます。ほかの関数の中身、taramanji.com のサービス、家の LAN
            には届きません。
          </li>
        </UL>
        <H2 id="entry">入口ごとのログイン</H2>
        <P>ホスト名はサービスごとに分かれていて、ログインが要るかどうかも入口で決まります（AWS で CloudFront は署名付き、API Gateway・S3 は単体で使えるのと同じ考え方）。</P>
        <Table
          rows={[
            ["入口", "ホスト名", "ログイン", "向いている使い方"],
            ["コンソール", <C>cloud.taramanji.com</C>, "あり（自分だけ）", "管理"],
            ["CDN", cdnHost, "あり（自分だけ）", "自分だけのアプリ。画面と /api をパスごとの元でまとめる"],
            ["API Gateway", apiHost, "なし（誰でも）", "公開する API・Webhook・スクリプトから呼ぶ。認証は関数か API キー"],
            ["公開バケット", storageHost, "なし（誰でも）", "画像やサイトの配信。公開をオンにしたバケットだけ"],
          ]}
        />
        <Note kind="warn" title="ログインなしの入口は、誰でも届きます">
          API Gateway の関数は、インターネットの誰からでも呼ばれます。認証が要る処理は、関数の中で確かめてください。公開バケットのファイルは、URL を知っている人なら誰でも読めます（一覧は出ません）。秘密のファイルは置かないでください。
          ログインが要る CDN は、開くと Google のログインが出て、管理者のアカウントだけが通ります。ブラウザ以外から呼ぶときは <C>cloudflared access curl</C> を使います。
        </Note>

        <H2 id="yaml">設定は YAML で残る</H2>
        <P>
          コンソールで作ったものは、すべて Kubernetes の YAML として、リポジトリ <C>JavaLangRuntimeException/taramanji-cloud-apps</C> にコミットされます。
          クラスターに入れるのはコントローラー（デプロイヤー）で、15 秒ごとにリポジトリを見て入れます。Argo CD では入れませんが、Argo CD の画面では関数ごとの Pod が動いているかを見られます（<C>taramanji-cloud-fn-&lt;名前&gt;</C>。見るだけ）。入れた結果は各画面の「デプロイ」と、Console Home の「デプロイ」で見られます。
        </P>
        <UL>
          <li>変更の履歴が git に残り、いつでも前の版に戻せます。</li>
          <li>YAML を手で書いて push しても、コンソールで作ったものと同じように扱われます。</li>
          <li>
            各画面の「YAML」タブで、保存される YAML を確かめたり、直接直したりできます。詳しくは <To to="/guide/yaml">YAML で管理する</To>。
          </li>
        </UL>

        <H2 id="env">環境（本番・stg・dev）</H2>
        <P>
          コンソールは環境ごとに 1 つずつあり、右上のバッジで、今どの環境にいるかがわかります。アプリ（関数・API・CDN・バケット・データベース）を作れるのは本番だけです。
          stg・dev は taramanji cloud そのもの（コンソール・API Gateway など）を試すための環境で、アプリは置きません。
        </P>
        <Table
          rows={[
            ["環境", "コンソール", "公開する URL", "監視（Datadog）"],
            ["本番", <C>cloud.taramanji.com</C>, <C>&lt;名前&gt;-cdn / -apigw / -storage-cloud.taramanji.com</C>, "あり"],
            ["stg", <C>cloud-stg.taramanji.com</C>, "なし（アプリは本番だけ）", "なし"],
            ["dev", <C>cloud-dev.taramanji.com</C>, "なし（アプリは本番だけ）", "なし"],
          ]}
        />

        <H2 id="names">名前と URL</H2>
        <P>
          名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までです。あとから変えられません。名前はホスト名の先頭になります（<C>&lt;名前&gt;-cdn-cloud</C>・
          <C>&lt;名前&gt;-apigw-cloud</C>・<C>&lt;バケット&gt;-storage-cloud</C>）。API と CDN は同じ名前を使えません。DNS は作ったとき（バケットは公開したとき）に自動で登録され、消すと削除されます。
        </P>
      </>
    ),
  },
  {
    slug: "first-function",
    title: "はじめての関数を公開する",
    summary: "コンテナイメージから関数を作り、API Gateway で URL を付けて、ブラウザから呼ぶまで。",
    minutes: 10,
    icon: "functions",
    kind: "tutorial",
    toc: [
      { id: "image", label: "1. イメージを用意する" },
      { id: "function", label: "2. 関数を作る" },
      { id: "api", label: "3. API で公開する" },
      { id: "call", label: "4. 呼んでみる" },
      { id: "auth", label: "5. API キーと CORS" },
      { id: "cold", label: "0 台からの起動について" },
    ],
    body: () => (
      <>
        <H2 id="image">1. イメージを用意する</H2>
        <P>
          関数は、HTTP を受けるコンテナイメージです。言語は何でもかまいません。決まったポートで HTTP を受け、<C>GET</C> などのリクエストに応えるだけです。
          イメージは公開されているもの（GitHub の Packages を public にしたものなど）を使います。
        </P>
        <Code lang="Node.js（server.js）">{`
import http from "node:http";

http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ hello: "taramanji cloud", path: req.url }));
  })
  .listen(8080);
`}</Code>
        <Code lang="Dockerfile">{`
FROM node:24-alpine
WORKDIR /app
COPY server.js .
USER node
EXPOSE 8080
CMD ["node", "server.js"]
`}</Code>
        <Note title="起動が速いほど、最初のリクエストが速く返ります">
          関数は使われていないとき 0 台なので、最初のリクエストはコンテナの起動を待ちます。小さなイメージ（alpine・distroless など）にすると待ち時間が短くなります。
        </Note>

        <H2 id="function">2. 関数を作る</H2>
        <Steps>
          <li>
            <To to="/functions">関数</To> を開き、「関数を作る」を押します。
          </li>
          <li>
            名前（例: <C>hello</C>）、イメージ（例: <C>ghcr.io/&lt;owner&gt;/hello:v1</C>）、ポート（例: <C>8080</C>）を入れます。
          </li>
          <li>
            インスタンスタイプを選びます。まずは <C>t1.small</C>（0.1 CPU / 128 MiB）で十分です。足りなければあとから上げられます。
          </li>
          <li>「作る」を押します。YAML がリポジトリにコミットされ、1 分ほどで状態が「待機中（0 台）」になります。</li>
        </Steps>

        <H2 id="api">3. API で公開する</H2>
        <P>関数を作っただけでは、外からは呼べません。API Gateway でホスト名を付けます。</P>
        <Steps>
          <li>
            <To to="/apis">API Gateway</To> を開き、「API を作る」を押します。
          </li>
          <li>
            名前（例: <C>hello</C>）を入れます。<C>https://hello-apigw-cloud.taramanji.com</C> で公開されます（ログインなし）。
          </li>
          <li>
            ルートは最初から <C>/ → hello</C> が入っています。そのまま「作る」を押します。DNS も自動で登録されます。
          </li>
        </Steps>
        <P>
          パスごとに別の関数へ渡すこともできます。たとえば <C>/api → api</C> と <C>/ → web</C> にすると、<C>/api</C> で始まるリクエストだけが api に、
          それ以外は web に行きます（長いパスが先に当たります）。
        </P>

        <H2 id="call">4. 呼んでみる</H2>
        <P>
          ブラウザで <C>https://hello-apigw-cloud.taramanji.com/</C> を開くか、ターミナルから呼びます。API Gateway はログインなしなので、そのまま届きます。
        </P>
        <Code lang="sh">{`curl https://hello-apigw-cloud.taramanji.com/`}</Code>
        <P>
          最初の 1 回は関数の起動を待つので、数秒かかります。2 回目からはすぐ返ります。関数の画面で、状態が「実行中」に変わるのを確かめてください。
        </P>
        <Note kind="warn" title="誰でも呼べます">
          API Gateway はログインなしなので、GitHub や Stripe などの Webhook も受けられます。その代わり、インターネットの誰からでも呼ばれます。
          自分だけが使うなら、API を「API キー」にして、ブラウザからは CDN の「パスごとの元」で <C>/api</C> をこの API に向けてください。CDN（ログイン済み）を通ったリクエストには API キーが要りません（<To to="/guide/static-site">静的なサイトをバケットと CDN で配る</To>）。
        </Note>

        <H2 id="auth">5. API キーと CORS</H2>
        <P>API Gateway は誰でも呼べます。呼べる人を絞るときは、API の画面の「認証」を「API キー」にします（AWS の API Gateway の API キーと同じ考え方）。</P>
        <Steps>
          <li>API の画面で「認証」を「API キー」にして保存します。</li>
          <li>
            下の「API キー」で名前（例: <C>ci</C>）を入れて「キーを作る」を押します。<C>tck_</C> で始まるキーが 1 回だけ出るので、コピーします（あとから見ることはできません）。
          </li>
          <li>呼ぶときに、ヘッダー <C>x-api-key</C> でキーを送ります。</li>
        </Steps>
        <Code lang="sh">{`curl -H "x-api-key: tck_..." https://hello-apigw-cloud.taramanji.com/`}</Code>
        <UL>
          <li>キーが違う・ないときは、API Gateway が関数を起こさずに 401 を返します。</li>
          <li>
            通ったときは、キーの名前が <C>X-Api-Key-Name</C> で関数に届きます（キーそのものは届きません）。YAML にはキーのハッシュだけが残ります。
          </li>
          <li>キーは 5 個まで。入れ替えるときは、新しいキーを作って呼ぶ側を変えてから、古いキーを消します。</li>
          <li>ブラウザの JavaScript に書いたキーは誰でも見られます。ブラウザから呼ぶ API の利用者の確認は、関数側（ログインなど）で行ってください。</li>
        </UL>
        <P>
          ほかのホスト名の画面（公開バケットの <C>https://site-storage-cloud.taramanji.com</C> など）からブラウザで呼ぶときは、「CORS」に画面のオリジンを書きます。
          API Gateway が <C>Access-Control-Allow-Origin</C> を返し、プリフライト（<C>OPTIONS</C>）にも関数を起こさずに答えます。
        </P>

        <H2 id="cold">0 台からの起動について</H2>
        <UL>
          <li>5 分リクエストが来ないと、関数は 0 台に戻ります。メモリと CPU は、ほかの関数や taramanji.com に回ります。</li>
          <li>0 台のときのリクエストは、起動を最長 60 秒待ちます。間に合わなければ 503 を返します。</li>
          <li>今は 1 つの関数につき 1 台までです。負荷に合わせて台数は増えません。</li>
          <li>関数には、利用者が見ているホスト名（Host ヘッダー）と、<C>X-Forwarded-For</C> などがそのまま届きます。</li>
        </UL>
      </>
    ),
  },
  {
    slug: "static-site",
    title: "静的なサイトをバケットと CDN で配る",
    summary: "ビルドしたファイルをバケットに置き、CDN でホスト名とキャッシュを付けて公開します。SPA にも対応します。",
    minutes: 8,
    icon: "cdn",
    kind: "tutorial",
    toc: [
      { id: "bucket", label: "1. バケットを作る" },
      { id: "upload", label: "2. ファイルを置く" },
      { id: "cdn", label: "3. CDN を作る" },
      { id: "paths", label: "4. API を同じホスト名にまとめる" },
      { id: "domain", label: "5. 独自ドメインを付ける" },
      { id: "cache", label: "キャッシュのしくみ" },
      { id: "purge", label: "キャッシュの消去" },
    ],
    body: () => (
      <>
        <H2 id="bucket">1. バケットを作る</H2>
        <Steps>
          <li>
            <To to="/storage">ストレージ</To> を開き、「バケットを作る」を押します。
          </li>
          <li>
            名前（例: <C>site</C>）を入れて「作る」を押します。1 分ほどで状態が「使用可能」になります。
          </li>
        </Steps>

        <H2 id="upload">2. ファイルを置く</H2>
        <P>
          バケットの名前を押して開き、ビルドしたフォルダー（<C>dist</C> など）の中身を、枠にドラッグ&ドロップします。フォルダーの中の構造のまま、今いるフォルダーの下に置かれます。
          「ファイルを選ぶ」「フォルダーを選ぶ」でも置けます。<C>index.html</C> が一番上に来るように置いてください。1 つのファイルは 1 GiB までです。
        </P>
        <Note>
          <C>.</C> で始まるファイル（<C>.env</C>・<C>.git/</C>・<C>.DS_Store</C> など）は置きません（<C>.well-known/</C> だけは置きます）。秘密のファイルを公開バケットに置き間違えないためです。
        </Note>

        <H2 id="cdn">3. CDN を作る</H2>
        <Steps>
          <li>
            <To to="/cdn">CDN</To> を開き、「CDN を作る」を押します。
          </li>
          <li>
            名前（例: <C>www</C>）を入れ、元に「バケット」と <C>site</C> を選びます。
          </li>
          <li>
            画面側でルーティングするサイト（React Router など）なら、「ファイルがないパスに index.html を返す（SPA）」に印を付けます。
          </li>
          <li>キャッシュの長さを選び、「作る」を押します。</li>
        </Steps>
        <P>
          <C>https://www-cdn-cloud.taramanji.com</C> でサイトが見られます（ログインあり）。<C>/</C> で終わるパスは、その下の <C>index.html</C> を返します。
        </P>
        <Note title="誰にでも見せるサイトなら">
          CDN を作らずに、バケットの画面で「公開する」を押す方法もあります。<C>https://site-storage-cloud.taramanji.com/</C> で、ログインなしで配られます（5 分キャッシュ。SPA の設定はありません）。
        </Note>

        <H2 id="paths">4. API を同じホスト名にまとめる（パスごとの元）</H2>
        <P>
          画面（バケット）と API（API Gateway）を、同じ <C>https://www-cdn-cloud.taramanji.com</C> から出せます。CloudFront の behavior と同じ考え方で、パスごとに元を分けます。
          同じホスト名なので、画面から <C>fetch("/api/...")</C> と呼ぶだけで、Cloudflare Access のログインもそのまま使えます（別のホスト名にすると、ログインの Cookie が届きません）。
        </P>
        <Steps>
          <li>CDN の編集画面の「パスごとの元」で「パスを足す」を押します。</li>
          <li>
            パスに <C>/api</C> を入れ、元に「API」と使う API を選びます。キャッシュは「キャッシュしない」にします。
          </li>
          <li>「保存」を押します。15 秒ほどで、<C>/api</C> で始まるパスだけが API に届き、API のルートで関数に渡ります。</li>
        </Steps>
        <UL>
          <li>長いパスが先に当たります。どれにも当たらないパスは、既定の元（上の「元」）に行きます。</li>
          <li>
            パスはそのまま元に渡ります。<C>/api/users</C> なら、API にも <C>/api/users</C> が届きます（<C>/api</C> は取り除きません）。
          </li>
          <li>
            CDN（ログイン済み）を通ったリクエストには、API キーは要りません（API Gateway が、CDN から来たことを署名で確かめます）。<C>-apigw-cloud</C> の URL に直接来たものには、API の設定どおり API キーを求めます。
          </li>
          <li>関数には、ログインした人の JWT（<C>Cf-Access-Jwt-Assertion</C>）と、CDN のホスト名（<C>X-Forwarded-Host</C>）が届きます。</li>
          <li>既定のほかに 15 個まで足せます。行ごとに、元・キャッシュの長さ・SPA を決められます。</li>
        </UL>

        <H2 id="domain">5. 独自ドメインを付ける</H2>
        <P>
          CDN を作ったあとで、<C>https://qa.taramanji.com</C> のような名前でも開けるようにできます（CloudFront の代替ドメイン名と同じ）。CDN の編集画面の「独自ドメイン」でラベル（例:{" "}
          <C>qa</C>）を足して「保存」を押します。
        </P>
        <UL>
          <li>保存すると、先に Cloudflare Access に登録してから DNS を作ります。<C>&lt;名前&gt;-cdn-cloud</C> と同じく、開くとログインが出ます。</li>
          <li>使えるのは <C>&lt;ラベル&gt;.taramanji.com</C>（1 階層）だけです。www・gws・stg・cloud など、taramanji.com が使っている名前や、ほかの DNS レコードがある名前は使えません。</li>
          <li>1 つの CDN に 5 個まで。同じ名前は、ほかの CDN では使えません。外すと DNS を消してから Access から外します。</li>
        </UL>

        <H2 id="cache">キャッシュのしくみ</H2>
        <UL>
          <li>
            CDN は応答に <C>Cache-Control: public, max-age=&lt;秒&gt;</C> を付けます。キャッシュするのは Cloudflare のエッジです。
          </li>
          <li>Cloudflare の既定では、画像・CSS・JS などの拡張子だけがキャッシュされ、HTML はキャッシュされません。</li>
          <li>ないパスの 404 はキャッシュさせません。あとからファイルを置けば、すぐ見えます。</li>
          <li>
            ファイル名にハッシュが付くビルド（Vite など）なら、長め（1 日〜1 年）にして問題ありません。同じ名前で中身を変えるなら、短め（5 分）にします。
          </li>
        </UL>
        <H2 id="purge">キャッシュの消去</H2>
        <UL>
          <li>
            ファイルを置き直したとき・消したとき、バケットの公開をやめたとき、CDN を保存したとき・消したときは、Cloudflare のエッジのキャッシュを自動で消します。
          </li>
          <li>今すぐ全部消したいときは、バケットの画面か CDN の編集画面の「キャッシュを消す」を押します。</li>
          <li>
            消せるのは Cloudflare に残った分だけです。ブラウザが持っている分は、キャッシュの長さが切れるまで見えることがあります（確かめるときはシークレットウィンドウで開きます）。
          </li>
          <li>Cloudflare の無料プランでは、ホスト名ごとの消去は 1 分に 5 回までです。</li>
        </UL>
      </>
    ),
  },
  {
    slug: "connect",
    title: "データベースとバケットをつなぐ",
    summary: "PostgreSQL・Redis・バケットを関数につなぎ、環境変数で受け取った接続先を使うまで。",
    minutes: 10,
    icon: "databases",
    kind: "tutorial",
    toc: [
      { id: "create", label: "1. データベースを作る" },
      { id: "attach", label: "2. 関数につなぐ" },
      { id: "env", label: "入る環境変数" },
      { id: "postgres", label: "PostgreSQL を使う" },
      { id: "redis", label: "Redis を使う" },
      { id: "bucket", label: "バケットを使う" },
      { id: "delete", label: "消すとき" },
    ],
    body: () => (
      <>
        <H2 id="create">1. データベースを作る</H2>
        <Steps>
          <li>
            <To to="/databases">データベース</To> を開き、「データベースを作る」を押します。
          </li>
          <li>
            エンジン（PostgreSQL か Redis）を選び、名前（例: <C>main</C>）を入れて「作る」を押します。
          </li>
          <li>20 秒ほどで状態が「使用可能」になります。</li>
        </Steps>
        <P>サイズは選びません。環境ごとに 1 台ある PostgreSQL / Redis から、そのデータベース専用のユーザーとパスワードを切り出します。</P>

        <H2 id="attach">2. 関数につなぐ</H2>
        <Steps>
          <li>関数の名前を押して開きます。</li>
          <li>「つなぐ」で、データベースやバケットに印を付けます。</li>
          <li>「保存する」を押します。関数が次に起きたときから、接続先が環境変数で入ります。</li>
        </Steps>
        <Note title="パスワードはどこにも出ません">
          接続先は Kubernetes の Secret として関数に渡ります。git の YAML にも、このコンソールにも、パスワードやトークンは出ません。
        </Note>

        <H2 id="env">入る環境変数</H2>
        <P>
          名前は大文字にし、ハイフンを <C>_</C> にしたものが入ります（<C>main-db</C> → <C>MAIN_DB</C>）。
        </P>
        <Table
          rows={[
            ["つないだもの", "環境変数"],
            [
              "PostgreSQL main",
              <>
                <C>DB_MAIN_URL</C>・<C>DB_MAIN_HOST</C>・<C>DB_MAIN_PORT</C>・<C>DB_MAIN_USER</C>・<C>DB_MAIN_PASSWORD</C>・<C>DB_MAIN_NAME</C>
              </>,
            ],
            [
              "Redis cache",
              <>
                <C>DB_CACHE_URL</C>・<C>DB_CACHE_HOST</C>・<C>DB_CACHE_PORT</C>・<C>DB_CACHE_USER</C>・<C>DB_CACHE_PASSWORD</C>・<C>DB_CACHE_PREFIX</C>
              </>,
            ],
            [
              "バケット site",
              <>
                <C>BUCKET_SITE_URL</C>・<C>BUCKET_SITE_TOKEN</C>
              </>,
            ],
          ]}
        />

        <H2 id="postgres">PostgreSQL を使う</H2>
        <P>
          <C>DB_&lt;名前&gt;_URL</C> をそのままドライバーに渡せます。自分のデータベースの中では、表を作るなど何でもできます。
        </P>
        <Code lang="Node.js（pg）">{`
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DB_MAIN_URL });
await pool.query("CREATE TABLE IF NOT EXISTS notes (id serial PRIMARY KEY, body text)");
const { rows } = await pool.query("SELECT * FROM notes ORDER BY id DESC LIMIT 10");
`}</Code>

        <H2 id="redis">Redis を使う</H2>
        <P>
          Redis は共有なので、キーは必ず <C>DB_&lt;名前&gt;_PREFIX</C>（<C>cache:</C> など）で始めます。ほかの接頭辞のキーは読み書きできません。
          <C>KEYS</C>・<C>FLUSHALL</C>・<C>CONFIG</C> などの管理用のコマンドも使えません（一覧は <C>SCAN</C> を使います）。
        </P>
        <Code lang="Node.js（redis）">{`
import { createClient } from "redis";

const redis = createClient({ url: process.env.DB_CACHE_URL });
await redis.connect();
const prefix = process.env.DB_CACHE_PREFIX; // "cache:"
await redis.set(prefix + "greeting", "hello", { EX: 60 });
`}</Code>

        <H2 id="bucket">バケットを使う</H2>
        <P>
          <C>Authorization: Bearer &lt;TOKEN&gt;</C> を付けて、<C>&lt;URL&gt;/&lt;キー&gt;</C> を読み書きします。キーは <C>/</C> で区切ったパスです。
        </P>
        <Table
          rows={[
            ["したいこと", "リクエスト"],
            ["置く", <C>PUT &lt;URL&gt;/&lt;キー&gt;（本文がファイルの中身）</C>],
            ["取り出す", <C>GET &lt;URL&gt;/&lt;キー&gt;</C>],
            ["消す", <C>DELETE &lt;URL&gt;/&lt;キー&gt;</C>],
            ["一覧", <C>GET &lt;URL&gt;?prefix=&lt;先頭&gt;（JSON。1,000 件まで）</C>],
          ]}
        />
        <Code lang="Node.js（fetch）">{`
const base = process.env.BUCKET_SITE_URL;
const auth = { Authorization: \`Bearer \${process.env.BUCKET_SITE_TOKEN}\` };

await fetch(\`\${base}/uploads/hello.txt\`, { method: "PUT", headers: auth, body: "hello" });
const text = await (await fetch(\`\${base}/uploads/hello.txt\`, { headers: auth })).text();
const { objects } = await (await fetch(\`\${base}?prefix=uploads/\`, { headers: auth })).json();
`}</Code>

        <H2 id="delete">消すとき</H2>
        <UL>
          <li>関数がつないでいるデータベース・バケットは消せません。先に関数の「つなぐ」から外します。</li>
          <li>データベースを消しても、ログインを止めるだけで中身は残ります。同じ名前で作り直すと、また使えます。</li>
          <li>バケットは、中身を全部消してからでないと消せません。</li>
        </UL>
        <Note kind="warn" title="バックアップはまだありません">大事なデータは、関数から定期的に書き出すなどして、自分でも残してください。</Note>
      </>
    ),
  },
  {
    slug: "yaml",
    title: "YAML で管理する",
    summary: "コンソールが書く YAML の置き場と形。手で書いて push する方法と、その決まりごと。",
    minutes: 6,
    icon: "guide",
    kind: "reference",
    toc: [
      { id: "where", label: "置き場" },
      { id: "function", label: "関数の YAML" },
      { id: "rules", label: "手で書くときの決まり" },
      { id: "form", label: "フォームで編集できないとき" },
    ],
    body: () => (
      <>
        <H2 id="where">置き場</H2>
        <P>
          リポジトリ <C>JavaLangRuntimeException/taramanji-cloud-apps</C> の、環境ごとのディレクトリに置かれます。<C>main</C> に push すると、
          15 秒ほどでコントローラーがクラスターに入れます。決まりに合わない YAML は入れず、前の版のまま動かして、理由を「デプロイ」に出します。
        </P>
        <Table
          rows={[
            ["リソース", "場所", "中身"],
            ["関数", <C>&lt;環境&gt;/functions/&lt;名前&gt;.yaml</C>, "Deployment・Service"],
            ["API", <C>&lt;環境&gt;/apis/&lt;名前&gt;.yaml</C>, "HTTPRoute"],
            ["バケット", <C>&lt;環境&gt;/buckets/&lt;名前&gt;.yaml</C>, "ConfigMap"],
            ["CDN", <C>&lt;環境&gt;/cdn/&lt;名前&gt;.yaml</C>, "HTTPRoute"],
            ["データベース", <C>&lt;環境&gt;/databases/&lt;名前&gt;.yaml</C>, "ConfigMap"],
          ]}
        />

        <H2 id="function">関数の YAML</H2>
        <P>
          フォームで作ると、次のような YAML になります。1 つ目の ConfigMap は「登録」で、環境の共有の namespace に入ります。コントローラーはこれを見て、
          関数ごとの namespace（<C>taramanji-cloud-fn-&lt;名前&gt;</C>）と、その囲いを作ります。Deployment と Service は、その namespace に入ります。
          監視・つなぐものは、注釈と envFrom に入ります。
        </P>
        <Code lang="prod/functions/hello.yaml">{`
apiVersion: v1
kind: ConfigMap
metadata:
  name: function-hello
  labels:
    cloud.taramanji.com/function: hello
    cloud.taramanji.com/kind: function
data:
  buckets: ""
  cpuMillis: "100"
  databases: main
  memoryMiB: "128"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello
  namespace: taramanji-cloud-fn-hello
  labels:
    app.kubernetes.io/name: hello
    cloud.taramanji.com/app: hello
    cloud.taramanji.com/instance-type: t1.small
    cloud.taramanji.com/kind: function
  annotations:
    cloud.taramanji.com/alerts: cpu-high,errors
spec:
  selector:
    matchLabels:
      cloud.taramanji.com/app: hello
  template:
    metadata:
      labels:
        app.kubernetes.io/name: hello
        cloud.taramanji.com/app: hello
        cloud.taramanji.com/kind: function
    spec:
      priorityClassName: cloud-workload
      automountServiceAccountToken: false
      enableServiceLinks: false
      securityContext:
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: ghcr.io/owner/hello:v1
          ports:
            - name: http
              containerPort: 8080
          envFrom:
            - prefix: DB_MAIN_
              secretRef:
                name: db-main
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 100m
              memory: 128Mi
          securityContext:
            allowPrivilegeEscalation: false
---
apiVersion: v1
kind: Service
metadata:
  name: hello
  namespace: taramanji-cloud-fn-hello
  labels:
    app.kubernetes.io/name: hello
    cloud.taramanji.com/app: hello
    cloud.taramanji.com/kind: function
spec:
  selector:
    cloud.taramanji.com/app: hello
  ports:
    - name: http
      port: 80
      targetPort: http
`}</Code>

        <H2 id="rules">手で書くときの決まり</H2>
        <UL>
          <li>
            GHCR・Docker Hub の非公開のイメージは、<C>image</C> に書くだけで使えます（<C>imagePullSecrets</C> は書きません。関数の namespace に、読み取り専用の認証情報が自動で置かれます）。
          </li>
          <li>
            関数の YAML の Deployment・Service・ConfigMap などは <C>metadata.namespace: taramanji-cloud-fn-&lt;名前&gt;</C> に入れます。登録の ConfigMap（<C>function-&lt;名前&gt;</C>）と、API・CDN・バケット・データベースの YAML には namespace を書きません。
          </li>
          <li>登録の data（CPU・メモリ・つなぐもの）は、Deployment と同じ値にします。ずれていると「YAML に問題」になります。</li>
          <li>
            置けるのは Deployment・Service・ConfigMap・PersistentVolumeClaim（関数）と HTTPRoute（API・CDN）だけです。Secret は置けません。
          </li>
          <li>
            中のオブジェクトの名前は、ファイルの名前か <C>&lt;名前&gt;-…</C> で始めます。
          </li>
          <li>
            関数の Pod には <C>priorityClassName: cloud-workload</C> が要ります。<C>spec.replicas</C> は書きません（台数は API Gateway が決めます）。
          </li>
          <li>メモリは requests と limits を同じ値にします。CPU 1、メモリ 1 GiB までです。</li>
          <li>
            envFrom で読めるのは、つないだデータベース（<C>db-&lt;名前&gt;</C>）とバケット（<C>bucket-&lt;名前&gt;</C>）の Secret だけです。
          </li>
        </UL>
        <P>決まりに合わない YAML は、一覧に「YAML に問題」と出ます。push する前に、コンソールの「YAML」タブに貼って保存すると、その場で確かめられます。</P>

        <H2 id="form">フォームで編集できないとき</H2>
        <P>
          ConfigMap を足すなど、フォームにない項目を手で足した YAML は、フォームで保存すると消えてしまうので、YAML タブでしか編集できません。
          フォームに戻したいときは、足した部分を消して push し直します。
        </P>
      </>
    ),
  },
  {
    slug: "limits",
    title: "大きさ・監視・制限",
    summary: "インスタンスタイプ、置ける量、監視のしくみと、まだできないこと。",
    minutes: 5,
    icon: "capacity",
    kind: "reference",
    toc: [
      { id: "types", label: "インスタンスタイプ" },
      { id: "quota", label: "置ける量" },
      { id: "alerts", label: "監視" },
      { id: "isolation", label: "囲い" },
      { id: "todo", label: "まだできないこと" },
    ],
    body: () => (
      <>
        <H2 id="types">インスタンスタイプ</H2>
        <P>
          名前は EC2 と同じ「系統 + 世代 . サイズ」です。汎用の <C>t1</C>、CPU が多い <C>c1</C>（計算・変換など向け）、メモリが多い <C>r1</C>（データを多く持つ処理・キャッシュ向け）があります。
          型を選ぶと CPU とメモリが入り、そのあと個別に変えられます（CPU 10〜1000 ミリコア、メモリ 16〜1024 MiB）。変えたものは一覧に「カスタム」と出ます。
        </P>
        <Table
          rows={[
            ["名前", "系統", "CPU", "メモリ"],
            [<C>t1.small</C>, "汎用", "0.1", "128 MiB"],
            [<C>t1.medium</C>, "汎用", "0.25", "256 MiB"],
            [<C>t1.large</C>, "汎用", "0.5", "512 MiB"],
            [<C>t1.xlarge</C>, "汎用", "1", "1 GiB"],
            [<C>c1.small</C>, "コンピューティング最適化", "0.25", "128 MiB"],
            [<C>c1.medium</C>, "コンピューティング最適化", "0.5", "256 MiB"],
            [<C>c1.large</C>, "コンピューティング最適化", "1", "512 MiB"],
            [<C>r1.small</C>, "メモリ最適化", "0.05", "256 MiB"],
            [<C>r1.medium</C>, "メモリ最適化", "0.125", "512 MiB"],
            [<C>r1.large</C>, "メモリ最適化", "0.25", "1 GiB"],
          ]}
        />
        <P>メモリの上限に届くと、関数は再起動されます（OOMKilled）。</P>

        <H2 id="quota">置ける量</H2>
        <P>
          関数が使えるメモリの合計は、本番 2.5 GiB です（アプリは本番だけ）。動いている関数だけが数に入るので、0 台の関数は場所を取りません。
          関数を起こすと合計が枠を超えるときは、起こさずに 503 を返します（ほかの関数が 0 台に戻ると、また起こせます）。
          あとどれだけ置けるかは <To to="/capacity">容量</To> で見られます。
        </P>
        <P>
          メモリが足りなくなったときは、taramanji.com より先に、この cloud の関数が止められます（優先度を低くしてあります）。
        </P>

        <H2 id="alerts">監視</H2>
        <P>関数の編集画面の「監視」で、用意した監視を選べます。本番では Datadog のモニターになり、Datadog の画面に出ます。</P>
        <UL>
          <li>CPU の使いすぎ・メモリの使いすぎ・再起動の繰り返し・エラーの増加（5xx が 5% を超えた）</li>
          <li>YAML を手で push したときは、関数の画面の「監視を同期」を押すと、モニターが YAML に合わせて作り直されます。</li>
        </UL>
        <Note kind="warn" title="通知先は空のままにしてください">
          通知先（メール・Discord）の宛先はまだ用意していないので、選ぶとモニターを作れずにエラーになります。今は Datadog の画面で見る形です。
        </Note>

        <H2 id="isolation">囲い</H2>
        <UL>
          <li>CDN（{cdnHost}）は Cloudflare Access の後ろにあり、使えるのは管理者のアカウントだけです。API Gateway と公開バケットはログインなしです。</li>
          <li>
            関数は 1 つずつ別の namespace（<C>taramanji-cloud-fn-&lt;名前&gt;</C>）で動きます。namespace と囲い（量の上限・通信の制限・Pod Security・権限）は
            コントローラーが作り、YAML のリポジトリからは作れません。
          </li>
          <li>データベースとバケットの接続先（パスワード・トークン）は、それをつないだ関数の namespace にだけ置かれます。ほかの関数からは読めません。</li>
          <li>関数は、API Gateway からのリクエストだけを受けます。ほかの関数から直接は呼べません。</li>
          <li>関数から出られるのは、つないだデータベースとバケット、インターネットだけです。taramanji.com のサービス・Kubernetes の API・家の LAN には届きません。</li>
          <li>特権コンテナ・hostPath・NodePort は使えません。</li>
        </UL>

        <H2 id="todo">まだできないこと</H2>
        <UL>
          <li>負荷に合わせて関数の台数を増やす（今は 1 台まで）</li>
          <li>自分で決める秘密の環境変数、GHCR・Docker Hub 以外の非公開のイメージ</li>
          <li>データベースのバックアップ</li>
          <li>公開バケットの署名付き URL（期限付きで非公開のファイルを渡す）</li>
        </UL>
      </>
    ),
  },
];

export const kindLabel: Record<Article["kind"], string> = { concept: "しくみ", tutorial: "チュートリアル", reference: "リファレンス" };

export function articleOf(slug: string | undefined): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
