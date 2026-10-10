<!-- 1. GitHub usernameを変更 -->
<div align="right">
  <img src="https://komarev.com/ghpvc/?username=JavaLangRuntimeException" />
</div>


<!-- 2. プロフィールや連絡先を変更 -->
## <img src="https://media.giphy.com/media/hvRJCLFzcasrR4ia7z/giphy.gif" width="28"> Hi there

- 🧑‍💻 I'm a backend engineer.
- 📫 How to reach me: [taramanji.com](https://taramanji.com)
<br>


<!-- 3. 好きな技術スタックに変更 -->
<!-- ライトモート：theme=light, ダークモート：theme=dark -->
<!-- アイコンの選択肢一覧：https://arc.net/l/quote/zizyykfh -->
## 🌱 Skills
<img alt="my skills" src="https://skillicons.dev/icons?theme=dark&perline=7&i=html,css,js,ts,react,next,vue,nuxt,kotlin,python,java,unity,go,docker,kubernetes,aws,gcp" />
<br>


<!-- 4. GitHub usernameを変更, 2箇所 -->
<!-- ライトモート：theme=light, ダークモート：theme=vue-dark  -->
## 🏃‍♀️ Activities
<div align="left">
  <img alt="Top Langs" height="170px" src="https://github-readme-stats.vercel.app/api?username=JavaLangRuntimeException&theme=vue-dark&layout=compact" />
  <img alt="github stats" height="170px" src="https://github-readme-stats.vercel.app/api/top-langs/?username=JavaLangRuntimeException&theme=vue-dark&layout=compact" />
</div>

<br>

---

## 🏠 taramanji.com の構成

ポートフォリオサイト [taramanji.com](https://taramanji.com) は、自宅の Mac mini（M4）1 台の中の Kubernetes（kind）で動いています。

### インフラ・使っている技術

<img alt="使っている技術" src="docs/images/tech.png" width="100%" />

- 利用者のアクセスは Cloudflare Tunnel を通って家に届く。ルーターのポートは 1 つも開けていない
- dev・stg・Argo Rollouts の画面は Cloudflare Access で管理者だけに制限。外からの作業は Tailscale ＋ SSH

### リリースの流れ（CI / CD）

<img alt="CI / CD" src="docs/images/cicd.png" width="100%" />

- PR → dev01〜03 のどれか（その PR が入っている dev、なければ一番前に使われた dev）、main にマージ → stg、タグ（`v*`）→ 本番
- 本番はカナリア：10% で止まって Promote を待ち、25% → 50% → 100%。Datadog で 5xx 率と p95 を見て、悪ければ自動で元に戻す
- **変わったサービスだけ**ビルドして入れ替える。Go は依存関係（`go list -deps`）で判定するので、共通部分を変えたら使っている全サービスが対象になる（判定は CI でテスト）

### 環境と管理画面

| 環境 | URL（サイト / 管理画面） | namespace | Argo CD のアプリ | 出るきっかけ |
| --- | --- | --- | --- | --- |
| 本番 | [taramanji.com](https://taramanji.com) / [gws.taramanji.com](https://gws.taramanji.com) | `taramanji` | `taramanji-prod` | タグ `v*` の push（カナリア） |
| stg | [stg.taramanji.com](https://stg.taramanji.com) / [stg-gws.taramanji.com](https://stg-gws.taramanji.com) | `taramanji-stg` | `taramanji-stg` | main へのマージ |
| dev01 | [dev01.taramanji.com](https://dev01.taramanji.com) / [dev01-gws.taramanji.com](https://dev01-gws.taramanji.com) | `taramanji-dev01` | `taramanji-dev01` | PR（空いている dev を自動で選ぶ） |
| dev02 | [dev02.taramanji.com](https://dev02.taramanji.com) / [dev02-gws.taramanji.com](https://dev02-gws.taramanji.com) | `taramanji-dev02` | `taramanji-dev02` | 〃 |
| dev03 | [dev03.taramanji.com](https://dev03.taramanji.com) / [dev03-gws.taramanji.com](https://dev03-gws.taramanji.com) | `taramanji-dev03` | `taramanji-dev03` | 〃 |

- stg・dev01〜03 は Cloudflare Access で管理者だけ。タブのタイトルの先頭に `[STG]` / `[DEV01]` などが付く
- PR がどの dev に出たかは、PR に付くコメント（「dev02 に出しました」）で分かる。選び方の図は [deploy/k8s/README.md](deploy/k8s/README.md#dev-環境dev0103)

| 管理画面 | 開き方 | 見られるもの |
| --- | --- | --- |
| Argo CD | `kubectl --context kind-taramanji -n argocd port-forward svc/argocd-server 8080:80` → http://localhost:8080 | 各環境のアプリ（root・taramanji-prod・taramanji-stg・taramanji-dev01〜03）の同期の状態 |
| Argo Rollouts | [rollouts.taramanji.com](https://rollouts.taramanji.com)（Cloudflare Access） | 各環境の Rollout と入れ替えの様子。上部の名前空間で `taramanji` / `taramanji-stg` / `taramanji-dev01〜03` を切り替える。本番のカナリアの Promote / Abort |
| Datadog | us5.datadoghq.com | 本番のメトリクス・APM・ログ（stg・dev は対象外） |

### バックエンド（`backend/`：Go・Connect / gRPC）

<img alt="バックエンドのサービス" src="docs/images/backend-services.png" width="100%" />

各サービスは同じ層の形（DDD ＋ クリーンアーキテクチャ）です。

<img alt="バックエンドの層" src="docs/images/backend-layers.png" width="100%" />

### フロントエンド（`frontend/`：React ＋ Vite ＋ TypeScript）

<img alt="フロントエンドの構成" src="docs/images/frontend.png" width="100%" />
