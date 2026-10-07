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

### インフラ

```mermaid
flowchart LR
    user["利用者"] --> cf["Cloudflare<br/>DNS・HTTPS"]
    cf -- "本番" --> t1["Tunnel<br/>taramanji-onprem"]
    cf -- "dev / stg / rollouts" --> access["Cloudflare Access<br/>管理者だけ"] --> t2["Tunnel<br/>taramanji-kind"]
    me["自分の端末"] -- "Tailscale + SSH" --> mac

    subgraph mac["Mac mini（kind：control-plane + worker × 2）"]
        cfd["cloudflared × 2"] --> gw["Envoy Gateway<br/>Gateway API"]
        gw --> prod["taramanji（本番）<br/>web + 8 サービス × 2<br/>Argo Rollouts でカナリア"]
        gw --> stg["taramanji-stg"]
        gw --> dev["taramanji-dev"]
        prod --> redis[("Redis<br/>namespace: data")]
        argocd["Argo CD"]
        dd["Datadog Agent"]
    end

    t1 --> cfd
    t2 --> cfd
    github["GitHub<br/>Actions・GHCR"] -. "Git を見て同期" .- argocd
    dd -. "メトリクス・トレース・ログ" .-> datadog["Datadog"]
```

- ルーターのポートは開けていない（cloudflared・Argo CD・Datadog Agent はすべて家の中から外へ接続）
- 秘密は Sealed Secrets で暗号化して Git に置く。Pod 同士の通信は NetworkPolicy で必要な分だけ許可

### リリースの流れ（CI / CD）

```mermaid
flowchart LR
    pr["PR を出す"] --> ci["CI<br/>lint・test・security・build"]
    merge["main にマージ"] --> ci
    ci --> ghcr["GHCR<br/>イメージ"]
    ci --> cd["CD<br/>版を書き換えて main にコミット"]
    tag["タグ v*"] --> cd
    cd --> argocd["Argo CD<br/>Git に合わせる"]
    argocd -- "PR" --> dev["dev"]
    argocd -- "マージ" --> stg["stg"]
    argocd -- "タグ" --> prod["本番<br/>10% で止まり Promote 待ち<br/>→ 25% → 50% → 100%"]
    prod -. "5xx 率・p95 を判定" .- datadog["Datadog"]
```

### バックエンド（`backend/`：Go・Connect / gRPC）

```mermaid
flowchart LR
    gw["Envoy Gateway"] --> identity & content & reservation & worklocation & inquiry & calendarsync & analytics
    reservation -- "gRPC" --> worklocation
    inquiry -- "gRPC" --> notification["notification<br/>（内部専用）"]

    identity["identity<br/>管理者ログイン"] -.-> google["Google OAuth"]
    content["content<br/>記事・イベント・論文"] -.-> ext["Qiita・connpass・ORCID"]
    reservation["reservation<br/>予約・空き時間"] -.-> gas["Google Apps Script・iCal"]
    notification -.-> ses["Amazon SES"]
    calendarsync["calendarsync<br/>カレンダー同期（5 分ごと）"] -.-> gcal["Google Calendar API"]
    analytics["analytics<br/>ページビュー"] -.-> dogstatsd["DogStatsD"]
    worklocation["worklocation<br/>勤務場所"]

    worklocation & content & calendarsync --> redis[("Redis<br/>サービスごとに DB を分ける")]
```

各サービスは同じ層の形（DDD + クリーンアーキテクチャ）で、`proto/` から型とハンドラーを生成しています。

```mermaid
flowchart LR
    handler["handler<br/>Connect / gRPC・HTTP"] --> usecase["usecase<br/>アプリケーションの処理"] --> domain["domain<br/>エンティティ・ルール"]
    infra["infra<br/>Redis・外部 API"] -- "インターフェースを実装" --> domain
    di["di<br/>組み立て"] --> handler & usecase & infra
```

### フロントエンド（`frontend/`：React + Vite + TypeScript・FSD）

```mermaid
flowchart LR
    app["app<br/>ルーター・Provider・スタイル"] --> pages["pages<br/>URL ごとの画面（13）"]
    pages --> widgets["widgets<br/>ヘッダー・プロフィール<br/>記事一覧・週の予定…"]
    widgets --> features["features<br/>予約・お問い合わせ<br/>ブログ検索・同期の管理…"]
    features --> entities["entities<br/>記事・イベント<br/>勤務場所・予約枠…"]
    entities --> shared["shared<br/>API クライアント（connect-es）<br/>UI（BoardUI）・設定"]
    shared -- "Connect（HTTP）" --> gw["Envoy Gateway → backend"]
```

- 上の層は下の層だけを使う（Feature-Sliced Design。`npm run lint:fsd` で確認）
- ビルドした静的ファイルを nginx のコンテナで配る。リリースで JS のファイル名が変わっても、古いタブは 1 回だけ読み直して新しい版に切り替わる
