# taramanji cloud

自分だけが使う小さなクラウド（マネジメントコンソール・ストレージ・コンテナ / 関数 / インスタンス）。
taramanji.com・gws.taramanji.com と同じクラスター（kind）で動くが、セキュリティの境界は分けてある。

| 環境 | コンソール | 名前空間 | メトリクス |
|---|---|---|---|
| prod | https://cloud.taramanji.com | `taramanji-cloud` | あり（Datadog） |
| stg | https://cloud-stg.taramanji.com | `taramanji-cloud-stg` | なし |
| dev | https://cloud-dev.taramanji.com | `taramanji-cloud-dev` | なし |

公開する URL は 1 階層のサブドメイン（Universal SSL がそのまま使える）。サービスごとに印を付けて分け、入口ごとにログインの有無を決める:

| 入口 | ホスト名 | ログイン |
|---|---|---|
| CDN | `<名前>-cdn-cloud.taramanji.com` | あり（Cloudflare Access。自分だけ） |
| API Gateway | `<名前>-apigw-cloud.taramanji.com` | なし（認証は関数か API キー） |
| 公開バケット | `<バケット>-storage-cloud.taramanji.com` | なし（公開をオンにしたバケットだけ。既定はオフ） |

印が違えばホスト名はぶつからない（末尾が -cdn・-apigw・-storage のどれかに決まる）。Access は `*-cdn-cloud` だけを守るので、ワイルドカード同士の優先順位に頼らない。

**アプリ（関数・API・CDN・バケット・データベース）は本番だけ**。stg・dev には基盤（コンソール・cloud-api・cloud-gw・コントローラー・ストレージ・PostgreSQL・Redis）だけを置き、基盤そのものを試すのに使う（アプリ用のリポジトリを渡さないので、コンソールからアプリは作れず、デプロイヤーも動かない。`components/nonprod`）。

Argo CD の使い方は taramanji の stg・dev と同じ: stg（`taramanji-cloud-stg`）は main を出していつも動かし、dev（`taramanji-cloud-dev`）は PR を出すと 1 台にして、その PR を閉じると 0 台に戻す（`dev-park`）。stg・dev は Rollout（カナリアなし、1 台ずつ入れ替え）で、Rollouts の画面に本番と同じように出る。

## taramanji.com から切り離しているところ

- **入口**: 専用のトンネル（`taramanji-cloud`、名前空間 `taramanji-cloud-cloudflared`）→ 専用の Gateway（`taramanji-cloud-gateway/cloud`、Envoy の Pod も別）。
  cloudflared の送信先は NetworkPolicy で cloud の Envoy とクラスターの外だけに絞り、taramanji の Gateway の Envoy からは
  cloud の Pod に届かない（`from-cloud-gateway`）。逆に taramanji のサービス（`from-gateway`）も taramanji の Envoy からしか受けない
- **ログイン**: Cloudflare Access の専用アプリ（`taramanji-cloud`）。API（cloud-api）は `Cf-Access-Jwt-Assertion` の署名・
  `iss`・`aud`（このアプリの Audience タグ）・メールアドレスを毎回確かめる（`backend/pkg/util/cfaccess`）。
  taramanji.com のセッション（`AUTH_SECRET`）や Redis は使わない
- **Secret**: taramanji の Secret は使わず、`deploy/cloud/secrets/`（git に入らない）から SealedSecret を作る
- **Argo CD**: 専用の AppProject（`taramanji-cloud`）。同期できる名前空間は taramanji-cloud の 6 つだけ、クラスター全体のリソースは Namespace だけ
- **権限**: cloud-api の ServiceAccount は読むだけ（リソースはリポジトリにコミットするだけで、入れるのはデプロイヤー）（自分の名前空間の Deployment・StatefulSet、アプリ用名前空間の枠と Pod、ノードの容量と使用量）

## アプリの容量（taramanji.com・gws に影響させない）

関数は本番のアプリ用名前空間（`taramanji-cloud-apps`）に登録し、`workloads/` で次の 3 つを縛る。

| | 縛り方 |
|---|---|
| 量 | ResourceQuota `apps`。メモリは LimitRange で requests = limits にそろえ、予約した分がそのまま実際に使える上限になる |
| 順番 | PriorityClass `cloud-workload`（-100・他を押しのけない）。メモリが足りなくなったら taramanji より先に追い出される。付けていない Pod は作れない（ResourceQuota `require-cloud-priority`） |
| 通信 | taramanji・data（Redis）・Kubernetes API・LAN には届かない。受けるのは cloud の Gateway からだけ。NodePort・LoadBalancer は作れない。Pod Security は baseline（hostPath・特権コンテナ不可） |

枠の大きさ（Mac mini の OrbStack VM は 11.7 GiB。taramanji.com・gws・基盤がおよそ 5.5 GiB を使う）:

| 環境 | メモリ | CPU（limits） | Pod | ディスク |
|---|---|---|---|---|
| prod | 2.5 GiB | 4 | 30 | 50 GiB |

2.5 GiB をアプリに渡し、2 GiB を taramanji.com・gws の伸びしろに残す（cloud-api の `CAPACITY_RESERVE_MIB`）。
VM のメモリを増やしたら `overlays/prod/workloads` の枠を広げる。

コンソールの「容量」は、この枠の残りと Mac mini 全体の実際の空き（予約分を除く）の、先に尽きる方で「S / M / L / XL のアプリがあと何個置けるか」を出す。
ストレージ（バケット）の容量は ③ で足す。

## ログイン（Cloudflare Access）

コンソールと CDN は Cloudflare Access の後ろに置く（stg・dev と同じ。`deploy/cloudflare/access.py`）。API Gateway と公開バケットは、AWS の API Gateway・S3 のように単体で使えるよう、ログインなしにする。

| Access のアプリ | ホスト名 |
|---|---|
| `taramanji-cloud` | `cloud`・`cloud-stg`・`cloud-dev`.taramanji.com（コンソール。API は JWT の aud も確かめる） |
| `taramanji-cloud-apps` | `*-cdn-cloud`・`*-cdn-cloud-stg`・`*-cdn-cloud-dev`.taramanji.com（CDN だけ。API Gateway・公開バケットは守らない） |

- ブラウザで開くと Google のログインが出て、`ADMIN_EMAIL` のアカウントだけが通る。セッションは 24 時間
- CDN をブラウザ以外（curl・スクリプト）から呼ぶときは `cloudflared access curl https://<名前>-cdn-cloud.taramanji.com/`（最初にブラウザでログインする）
- API Gateway（`-apigw-cloud`）はログインなしなので、Webhook も受けられる。その代わり誰でも呼べる。自分だけの API は API キーで守り、ブラウザからは CDN の「パスごとの元」で `/api` をその API に向ける（CDN を通ったものには API キーが要らない）
- 公開バケット（`-storage-cloud`）は 1 ファイルずつの取得だけ（一覧・書き込みはできない）。5 分キャッシュ
- **レート制限**: cloud-gw が利用者（`Cf-Connecting-Ip`）ごとに 1 秒 20 回・続けて 60 回まで（`GATEWAY_RATE_PER_SEC`・`GATEWAY_RATE_BURST`）。超えたら関数を起こさずに 429。
  Pod ごとに数える（2 台なら最大で 2 倍）。Cloudflare の無料プランのレート制限はホスト名で絞れない（パスだけ）ので、cloud-gw で絞る
- **API キー**（API ごと。認証を「API キー」にしたとき）: HTTPRoute が `X-Cloud-Auth: api_key` と `X-Cloud-Api-Keys: <名前>=<SHA-256>,...` を set し、
  cloud-gw が `x-api-key` のハッシュを比べる。違えば関数を起こさずに 401。通れば `X-Api-Key-Name` を関数に渡し、`x-api-key` は渡さない。
  キーそのものは作ったときに 1 回だけ返し、どこにも保存しない（YAML の注釈 `cloud.taramanji.com/api-keys` に名前・頭・ハッシュだけ）。キーは 160 ビットの乱数なので、ハッシュから戻せない
- **CORS**（API ごと）: `X-Cloud-Cors` に許すオリジンを空白区切りで set し、cloud-gw が `Access-Control-Allow-Origin` を返す（関数の値は使わない）。プリフライトは関数を起こさずに 204
- 認証・CORS のヘッダーは、API 以外のルート（CDN・公開バケット）と、設定していない API では必ず remove する（利用者が付けてきても効かない）

### CDN の独自ドメイン（代替ドメイン名）

CDN を作ったあとで `<ラベル>.taramanji.com` を足せる（CloudFront の代替ドメイン名）。CDN の HTTPRoute の hostnames に足すだけで、トンネルは全部のホスト名を cloud の Envoy に送る。

- **ログインあり**: `*-cdn-cloud` のワイルドカードでは守れないので、cloud-api が Access のアプリ `taramanji-cloud-domains` に登録する。
  ログインの方法とポリシーは `taramanji-cloud-apps`（access.py が作る）と同じにする。cloud-api が触るのはこのアプリだけ
- **順番**: 足すときは Access に登録 → YAML を保存 → DNS。Access に登録できなければ保存しない（ログインなしで出る瞬間を作らない）。外すときは DNS を消してから Access から外す
- **使えない名前**: www・gws・stg・dev01〜03・rollouts・cloud・api などの予約した名前、`cloud` で始まる・`-cloud` を含む名前（taramanji cloud のホスト名の形）、2 階層。
  DNS は、レコードがないか、自分が作った印のあるレコードのときだけ扱う（コンソールの `cloud.taramanji.com` のように、手でトンネルに向けたレコードも乗っ取らない）
- **トークン**: `deploy/cloud/secrets/cloudflare.env` の `CF_ACCESS_API_TOKEN`（Account › Access: Apps and Policies › Edit だけ）を `seal.sh prod` で cloud-api-env に入れる。
  なければ独自ドメインは足せない（コンソールに「この環境では使えません」と出る）

## 関数と API Gateway

Lambda と API Gateway にあたるもの。リソースの正は、**アプリ専用のリポジトリ**（`JavaLangRuntimeException/taramanji-cloud-apps`）にある Kubernetes の YAML。

| リソース | YAML の場所 | 中身 |
|---|---|---|
| 関数 | `<環境>/functions/<名前>.yaml` | 登録の ConfigMap と、関数ごとの namespace に入る Deployment・Service。コンテナイメージを、リクエストが来たときだけ動かす |
| API | `<環境>/apis/<名前>.yaml` | HTTPRoute 1 つ。`<名前>-apigw-cloud.taramanji.com` のパスごとに、渡し先の関数を決める |

- コンソール（関数・API Gateway）のフォームか YAML で作る・変える・消すと、cloud-api がそのファイルをコミットする。クラスターには書かない
- **デプロイヤー**（cloud-ctl の中で動く）が 15 秒ごとにリポジトリを見て、変わっていたら入れる（関数は関数ごとの namespace、ほかは環境の共有の namespace）。**Argo CD は使わない**。YAML を手で書いて push しても同じ
  - 入れる前に、コンソールと同じ決まり（種類・namespace・名前・登録とのずれ）で確かめる。合わない YAML は入れず、前の版のまま動かす
  - server-side apply で入れる（関数の台数には触れない）。リポジトリから消えたものは、クラスターからも消す（自分が入れた、この環境のものだけ）
  - 結果（反映した版・コミット・時刻・状態・直近 10 件の履歴）を、共有の namespace の ConfigMap `cloud-deployments` に書く。コンソールの各画面と「Console Home」の「デプロイ」に出る
  - 5 分ごとに、変わっていなくても入れ直す（手で消された・書き換えられたものを戻す）
- 手で書き足した YAML は、フォームでは編集できない（保存すると消えるため）
- API の名前（＝ホスト名）は、同じ環境の中で重複できない（ファイル名が同じになるので、2 つ目は作れない）

**呼び出しの流れ**: Cloudflare → トンネル → cloud の Envoy → API（HTTPRoute）が `X-Cloud-Function: <関数名>` を付ける →
API Gateway（`cloud-gw`。cloud-api と同じイメージを `CLOUD_MODE=gateway` で動かす）→ 関数。

- 関数が 0 台なら、cloud-gw が 1 台にして、応答できるようになるまでリクエストを待たせる（最長 60 秒）
- 5 分（`FUNCTION_IDLE_TIMEOUT`）リクエストが来なければ、cloud-gw が 0 台に戻す。台数は YAML に書かない（デプロイヤーは台数に触れない）
- 関数は cloud-gw からしか受けない（NetworkPolicy）。`X-Cloud-Function` は HTTPRoute が上書きするので、利用者は渡し先を偽れない
- 関数の同時実行は 1 台まで（負荷に合わせて台数を増やすことは、まだしない）

リポジトリを分けているのは、コンソールのトークンが漏れても taramanji.com のマニフェスト（このリポジトリ）を書き換えられないようにするため。
プロジェクト `taramanji-cloud-apps` は、入れ先を環境の共有の namespace と関数ごとの namespace（`taramanji-cloud-fn-*` など）に、種類を Deployment・Service・ConfigMap・PersistentVolumeClaim・HTTPRoute に限る。

**インスタンスタイプ**（EC2 と同じ「系統 + 世代 . サイズ」。汎用 `t1`・コンピューティング最適化 `c1`・メモリ最適化 `r1`。`backend/internal/cloud/domain/service/instancetype.go`）:

| 名前 | 系統 | CPU | メモリ |
|---|---|---|---|
| `t1.small` | 汎用 | 0.1 | 128 MiB |
| `t1.medium` | 汎用 | 0.25 | 256 MiB |
| `t1.large` | 汎用 | 0.5 | 512 MiB |
| `t1.xlarge` | 汎用 | 1 | 1 GiB |
| `c1.small` | コンピューティング最適化 | 0.25 | 128 MiB |
| `c1.medium` | コンピューティング最適化 | 0.5 | 256 MiB |
| `c1.large` | コンピューティング最適化 | 1 | 512 MiB |
| `r1.small` | メモリ最適化 | 0.05 | 256 MiB |
| `r1.medium` | メモリ最適化 | 0.125 | 512 MiB |
| `r1.large` | メモリ最適化 | 0.25 | 1 GiB |

型を選ぶと CPU・メモリが入り、そのあと個別に変えられる（CPU 10〜1000 ミリコア、メモリ 16〜1024 MiB。上限は LimitRange の max）。
YAML ではラベル `cloud.taramanji.com/instance-type` が型、`resources` が実際の値（requests = limits）。

**監視**: 関数の Deployment の注釈で、用意した監視と通知先を選ぶ。

```yaml
metadata:
  annotations:
    cloud.taramanji.com/alerts: cpu-high,memory-high,restarts,errors
    cloud.taramanji.com/notify: mail,discord
```

本番では cloud-api がこれを Datadog のモニター（タグ `managed-by:taramanji-cloud`）にする。Datadog には必ず出て、
`mail` は SES のメール、`discord` は Discord に飛ぶ（Datadog の Webhook `taramanji-cloud-mail`・`taramanji-cloud-discord` →
Cloudflare Worker `taramanji-uptime`）。コンソールで保存・削除したときにそろえる。YAML を手で push したときは、コンソールの「監視を同期」を押す。

まだないもの: 自分で決める秘密の環境変数・非公開イメージは扱えない（データベースとバケットの接続先は「つなぐ」で入る）。

## オブジェクトストレージと CDN

S3 と CloudFront にあたるもの。

| リソース | YAML の場所 | 中身 |
|---|---|---|
| バケット | `<環境>/buckets/<名前>.yaml` | ConfigMap `bucket-<名前>`（ラベル `cloud.taramanji.com/bucket`）。あることがバケットの定義。公開するときは HTTPRoute `bucket.<名前>`（`<名前>-storage-cloud.taramanji.com` の全パスをこのバケットへ）も |
| CDN | `<環境>/cdn/<名前>.yaml` | HTTPRoute 1 つ。`<名前>-cdn-cloud.taramanji.com` を、バケットか API（API Gateway）に向ける。パスごとに別の元にも向けられる（behavior） |

- **ストレージ**（`cloud-storage`。cloud のイメージを `CLOUD_MODE=storage` で動かす StatefulSet）: バケットは PVC の上のディレクトリ。
  ラベル付きの ConfigMap を 15 秒ごとに見て、バケットを作る。ConfigMap が消えても、中身のあるバケットは消さない
  - 8080（読み書き）: Bearer のトークンが要る。トークンはマスターキー（`cloud-storage-key`）から導く。届くのは cloud-api だけ
  - 8081（読むだけ）: トークンなし。届くのは CDN（cloud-gw）だけ
- **ファイルの出し入れ**: コンソールのストレージの画面から。`PUT / GET /_objects/<バケット>/<キー>` を cloud-api がストレージに渡す（Access の JWT を確かめる）。
  ダウンロードは必ずファイルとして保存させる（置いた HTML がコンソールのオリジンで動かないように）。1 つ 1 GiB まで
- **CDN**: HTTPRoute が、元（`X-Cloud-Bucket` か `X-Cloud-Api`）・キャッシュの秒数・SPA をヘッダーに付けて cloud-gw に送る。
  元が API のときは、cloud-gw がその API のホスト名（`<API>-apigw-cloud`）で cloud の Envoy（`GATEWAY_URL`）に渡し直し、API のルート・認証・CORS をそのまま当てる（CloudFront の元を API Gateway にするのと同じ）。
  そのとき `X-Cloud-Cdn`（UNIX 秒と HMAC-SHA256。鍵は `GATEWAY_INTERNAL_SECRET`、`seal.sh` が環境ごとに作る）を付け、2 回目の cloud-gw はこれが合えば API キーを求めない（CDN は Access のログインの後ろなので）。1 分より古い・ほかのホスト名宛ての署名は使わない
- 関数を CDN の元に直接はできない（API を通す）。どのルートも、自分が set しない `X-Cloud-*` のヘッダーは全部 remove する
- **パスごとの元（behavior）**: CloudFront の behavior にあたる。HTTPRoute のルールをパス（PathPrefix）ごとに分け、ルールごとに元・キャッシュ・SPA のヘッダーを付ける。
  長いパスから順に並べ、最後が既定の `/`。既定のほかに 15 個まで（rules は 16 まで）。パスは取り除かずに元に渡す。画面と API を同じホスト名にまとめると、Access のログインがそのまま使える
  - バケットが元: パスをキーにして返す（GET・HEAD だけ）。`/` で終わるパスは `index.html`。SPA にすると、ファイルがないパスに `/index.html` を返す
  - 関数が元: 関数が `Cache-Control` を付けていない GET の 200 に、キャッシュの長さを付ける
  - キャッシュするのは Cloudflare のエッジ。応答に `Cache-Control: public, max-age=<秒>` を付ける。Cloudflare の既定では、
    画像・CSS・JS などの拡張子だけがキャッシュされる（HTML もキャッシュするなら Cloudflare の Cache Rule が要る）。キャッシュの消去（パージ）はまだない
- **ホスト名**: API と CDN は同じ名前（＝同じホスト名）を使えない
- **DNS**: API・CDN を作ると、cloud-api が Cloudflare に CNAME（`<ホスト名>` → `<トンネル ID>.cfargotunnel.com`、プロキシあり）を登録し、消すと削除する。
  扱うのは `-cloud.taramanji.com` で終わるホスト名だけ（DNS の登録は本番だけ）。消すのは自分が作った印（コメント）のあるレコードだけ。
  トークンがなければ登録せず、コンソールに手で実行するコマンドを出す

## 関数ごとの namespace（囲い）

関数は 1 つずつ別の namespace で動く（`taramanji-cloud-fn-<名前>`。アプリは本番だけ）。

- 関数の YAML は、**登録**の ConfigMap `function-<名前>`（環境の共有の namespace。CPU・メモリ・つなぐもの）と、関数の namespace に入る Deployment・Service
- コントローラー（cloud-ctl）が登録を見て、namespace と囲いを作る。**アプリ用のリポジトリからは作れない**（デプロイヤーは Deployment・Service・ConfigMap・PVC・HTTPRoute しか入れない）
  - Pod Security: baseline（特権コンテナ・hostPath 不可）
  - ResourceQuota: 登録した CPU・メモリの 2 台分（入れ替えのあいだだけ 2 台）、NodePort・LoadBalancer は 0。優先度 `cloud-workload` のない Pod は作れない
  - LimitRange: コンテナ 1 つは登録した量まで
  - NetworkPolicy: 受けるのは API Gateway（cloud-gw）からだけ。出られるのは DNS・この環境の PostgreSQL / Redis / ストレージ・インターネット（LAN 不可）
  - default の ServiceAccount はトークンを持たない。cloud-gw は台数だけ、cloud-api は読むだけ（RoleBinding を namespace ごとに作る）
  - つないだデータベース・バケットの接続先の Secret は、その関数の namespace にだけ置く
- 登録が消えたら、namespace ごと消す（自分が作った、この環境の、名前の決まりに合うものだけ）
- 関数のメモリの合計（本番 2.5 GiB）は、API Gateway が関数を起こすときに確かめる（`FUNCTION_MEMORY_CAP_MIB`）。
  超えるなら起こさず 503。コンソールの「容量」も同じ枠で数える
- 環境の共有の namespace（`taramanji-cloud-apps` など）には、API・CDN の HTTPRoute と、登録・バケット・データベースの定義（ConfigMap）だけを置く。Pod は 0 個

## 非公開のイメージ（GHCR・Docker Hub）

関数のイメージは、公開のものに加えて GHCR と Docker Hub の非公開のものも使える（YAML には `image` を書くだけ）。

- 認証情報は `deploy/cloud/secrets/registry-ghcr.env`・`registry-dockerhub.env`（`USERNAME=`・`TOKEN=`、git に入らない）に置き、`scripts/seal.sh prod` で SealedSecret `cloud-registry` にする
  - GHCR: classic PAT で `read:packages` だけ（fine-grained PAT はパッケージに使えない）
  - Docker Hub: Personal access token の Read-only
- コントローラーが関数の namespace ごとに Secret `cloud-registry`（`kubernetes.io/dockerconfigjson`）を置き、default の ServiceAccount の `imagePullSecrets` にする。
  使うのは kubelet だけで、関数の Pod には Kubernetes のトークンがないので Secret は読めない
- 本番だけ（アプリは本番だけ）。トークンを変えたら seal.sh prod をやり直してコミットし、同期のあと cloud-ctl を再起動する（環境変数で読むため）。全部の関数の namespace の Secret が入れ替わる

## Argo CD の画面で関数を見る（見るだけ）

関数は Argo CD を通さずにデプロイヤーが入れるが、Pod が動いているかは Argo CD の画面（いつもの画面）で見られる。

- 関数ごとに Application `taramanji-cloud-fn-<名前>`（プロジェクト `taramanji-cloud-functions`）ができ、Deployment → ReplicaSet → Pod と、登録の ConfigMap・Service が並ぶ
- 作るのは ApplicationSet `taramanji-cloud-functions`（`deploy/gitops/apps/taramanji-cloud-functions.yaml`）。関数の一覧は plugin ジェネレーターがコントローラー（cloud-ctl の `/api/v1/getparams.execute`。トークンと NetworkPolicy で Argo CD の ApplicationSet コントローラーだけ）に聞く
- Argo CD は同期しない: 自動同期なし、手での Sync もプロジェクトの sync window で止めてある。カナリア・監視もしない
- デプロイヤーは関数の YAML のものに `argocd.argoproj.io/tracking-id` を付ける（これがないと「同期していない」と出る）。台数（0 ⇄ 1）は比べない
- 関数がまだ 1 台も起きていない（0 台）ときは Pod は出ないが、Deployment は Healthy
- アプリは本番だけなので、本番だけ。トークンは `deploy/cloud/secrets/argocd-plugin-token`（`scripts/seal.sh prod` が作る）

## データベースと、関数へのつなぎ込み

サーバーレスのデータベースにあたるもの。環境ごとに共有の PostgreSQL と Redis を 1 台ずつ動かし、そこからデータベースを切り出す（サイズは選ばない）。

| リソース | YAML の場所 | 中身 |
|---|---|---|
| データベース | `<環境>/databases/<名前>.yaml` | ConfigMap `db-<名前>`（ラベル `cloud.taramanji.com/database` と `cloud.taramanji.com/engine: postgres` か `redis`） |

- **コントローラー**（`cloud-ctl`。cloud のイメージを `CLOUD_MODE=controller` で動かす）が 20 秒ごとに定義を見て、
  - PostgreSQL: ロールとデータベースを作る（ほかのデータベースのユーザーからはつなげない）
  - Redis: ACL のユーザーを作る。触れるのは `<名前>:` で始まるキーだけで、`KEYS`・`FLUSHALL`・`CONFIG` などは使えない
  - 接続先の Secret（`db-<名前>`、バケットは `bucket-<名前>`）を、それをつないだ関数の namespace にだけ作る
  - 状態（`ready` か、エラーの理由）を ConfigMap の注釈 `cloud.taramanji.com/status` に書く。コンソールはこれを読む
- **パスワードとトークン**は、マスターキー（`cloud-storage-key`）から導く。git にも、コンソールにも出ない。cloud-api は Secret を読めない
- **つなぎ方**: 関数の「つなぐ」で選ぶ（YAML では `envFrom` の `secretRef`）。接頭辞の付いた環境変数になる
  - データベース `main`: `DB_MAIN_URL`・`DB_MAIN_HOST`・`DB_MAIN_PORT`・`DB_MAIN_USER`・`DB_MAIN_PASSWORD` と、PostgreSQL は `DB_MAIN_NAME`、Redis は `DB_MAIN_PREFIX`
  - バケット `site`: `BUCKET_SITE_URL`（`http://cloud-storage.<namespace>.svc.cluster.local:8080/b/site`）と `BUCKET_SITE_TOKEN`。
    `Authorization: Bearer <TOKEN>` を付けて、`GET / PUT / DELETE <URL>/<キー>`、一覧は `GET <URL>?prefix=`
- **消すとき**: どの関数にもつながれていないものだけ消せる。定義を消すと、Secret を消してログインを止める。**中身は消さない**
  （同じ名前で作り直すと、また使える。本当に消すには、管理者で `DROP DATABASE` する）
- **メモリ**: PostgreSQL は上限 256 MiB、Redis は上限 128 MiB（`maxmemory` 96 MB。満杯になると書き込みがエラーになる）。
  関数の合計の枠とは別に、コンソールの namespace で使う。3 環境で 6 台動く
- バックアップは、まだない


## 構成

```
deploy/cloud/
  platform/        全環境で 1 つ（prod の Application が持つ）: 名前空間・Gateway（cloud）・トンネル（cloudflared）
  cluster/         クラスター全体のもの（PriorityClass・ノードを読む ClusterRole）。taramanji-cloud-cluster アプリ（default プロジェクト）が持つ
  base/            1 環境ぶん: cloud-api・cloud-gw（Go、backend/cmd/cloud）・console（console/ の画面）・HTTPRoute・NetworkPolicy
  workloads/       1 環境ぶんのアプリ用名前空間の枠と囲い（ResourceQuota・LimitRange・NetworkPolicy）
  overlays/
    prod/          platform + app（base）+ workloads + sealed
    stg/ dev/      app（base。ホスト名・環境名だけ変える）+ workloads + sealed
  scripts/seal.sh  SealedSecret を作る
  secrets/         平文の入力（git に入らない）
```

`/taramanji.cloud.v1.*` は cloud-api、それ以外は console（nginx）に送る。

## はじめて動かすとき

1. **トンネル**（1 本を全環境で使う）

   ```sh
   cloudflared tunnel create taramanji-cloud
   cp ~/.cloudflared/<トンネルの ID>.json deploy/cloud/secrets/tunnel-cloud.json
   for h in cloud cloud-stg cloud-dev; do cloudflared tunnel route dns taramanji-cloud $h.taramanji.com; done
   ```

2. **Access**（`taramanji-cloud` アプリを作り、Audience タグを `deploy/cloud/secrets/access.env` に書く）

   ```sh
   python3 deploy/cloudflare/access.py
   ```

3. **Datadog**（prod のメトリクス用。なくてもコンソールはメトリクスなしで動く）
   - API キーを `deploy/cloud/secrets/datadog-api-key` に置く
   - アプリケーションキーは、スコープを `metrics_read` と `timeseries_query` だけにして作り、`deploy/cloud/secrets/datadog-app-key` に置く
   - `deploy/k8s/observability/datadog-values.yaml` を変えたので、Agent を入れ直す（taramanji-cloud-dev・taramanji-cloud-stg を監視から外し、taramanji-cloud・taramanji-cloud-apps のログを送る）

4. **SealedSecret** を作ってコミットする

   ```sh
   deploy/cloud/scripts/seal.sh prod
   deploy/cloud/scripts/seal.sh stg
   deploy/cloud/scripts/seal.sh dev
   ```

5. **DNS の自動登録とストレージ**
   - Cloudflare で API トークンを作る（権限は「ゾーン → DNS → 編集」、対象は taramanji.com だけ）。`deploy/cloud/secrets/cloudflare.env` に書く:
     `CF_DNS_API_TOKEN=...` と `CF_ZONE_ID=...`（ゾーン ID はダッシュボードの概要にある）
   - ストレージのマスターキーは `seal.sh` が環境ごとに 1 回だけ作る（`secrets/storage-master-key-<環境>`。なくすとトークンが変わるので消さない）
   - 共有の PostgreSQL / Redis の管理者のパスワードも `seal.sh` が環境ごとに 1 回だけ作る（`cloud-data-admin`。PostgreSQL は最初の起動のときの値を覚えるので、あとから変えない）
   - どれも 4 の `seal.sh` で SealedSecret になる。`cloud-storage-key`・`cloud-data-admin` がないと、cloud-storage・cloud-postgres・cloud-redis・cloud-ctl の Pod は起動しない

6. **アプリ用のリポジトリ**（関数と API を使うとき。なくてもコンソールのほかの画面は動く）
   - GitHub に private の `JavaLangRuntimeException/taramanji-cloud-apps` を作り、`prod/`・`stg/`・`dev/` に空のファイル（`.gitkeep`）を置く
   - トークン（コンソールが書き、デプロイヤーが読む）: そのリポジトリだけ・Contents の Read and write だけの fine-grained PAT を `deploy/cloud/secrets/apps-repo-token` に置き、4 の `seal.sh` を実行し直す
   - 監視を使うなら、Datadog のアプリケーションキーのスコープに `monitors_read`・`monitors_write` を足し、
     `python3 deploy/cloudflare/uptime/datadog-webhook.py <Worker の URL> <トークンのファイル>` で Webhook を作り、Worker を `npx wrangler deploy` し直す

7. **リリース**: main にマージすると build が `taramanji-cloud`・`taramanji-console` を作り、cd が stg に出す。
   本番は今までどおり `v*` のタグで出る（それまで prod のイメージは `unreleased` で、Pod は起動しない）。

## カナリア（本番）

本番の cloud-api・cloud-gw・console は、taramanji のサービスと同じく Argo Rollouts のカナリアで入れ替える（`overlays/prod/app/rollouts.yaml`）。

- `v*` のタグで新しい版が来ると、2 台のうち 1 台だけを新しい版にして止まる。rollouts.taramanji.com の画面で namespace を `taramanji-cloud` にして Promote すると、全部入れ替わる
- cloud-api は、その間ずっと Datadog で新しい版の 5xx 率を見て、5% を超えたら自動で元に戻す（AnalysisTemplate `cloud-canary-health`）
- cloud-gw は関数の応答（関数自身の 5xx・起動待ち）をそのまま返すので自動判定はしない。console は APM がないので手動の判定だけ
- 振り分けは Pod の数の比（HTTPRoute の重みは使わない）
- cloud-ctl（1 台・Recreate）、cloud-storage・cloud-postgres・cloud-redis（StatefulSet）、関数（taramanji-cloud-fn-*）はカナリアにしない
- stg・dev はカナリアにしない（Rollout で 1 台ずつ入れ替えるだけ。taramanji の stg・dev と同じ。`components/nonprod`）

## CI / CD

- build: `backend/` の Go の変更で `cloud`、`console/` の変更で `console` のイメージを作る（`deploy/k8s/scripts/changed-services.py`）
- cd: PR → taramanji-cloud-dev（dev は 1 つだけ。1 台にして出し、PR を閉じると 0 台に戻す）、main → taramanji-cloud-stg、タグ → taramanji-cloud（prod）。
  版を書き換えるのは `deploy/k8s/scripts/set-version.sh`（cloud・console は `deploy/cloud/overlays/` を書き換える）
- lint: 3 環境のマニフェストを kubeconform で確かめ、console の生成コード・型・lint を見る。test: console の vitest
