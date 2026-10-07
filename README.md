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

- PR → dev、main にマージ → stg、タグ（`v*`）→ 本番
- 本番はカナリア：10% で止まって Promote を待ち、25% → 50% → 100%。Datadog で 5xx 率と p95 を見て、悪ければ自動で元に戻す

### バックエンド（`backend/`：Go・Connect / gRPC）

<img alt="バックエンドのサービス" src="docs/images/backend-services.png" width="100%" />

各サービスは同じ層の形（DDD ＋ クリーンアーキテクチャ）です。

<img alt="バックエンドの層" src="docs/images/backend-layers.png" width="100%" />

### フロントエンド（`frontend/`：React ＋ Vite ＋ TypeScript）

<img alt="フロントエンドの構成" src="docs/images/frontend.png" width="100%" />
