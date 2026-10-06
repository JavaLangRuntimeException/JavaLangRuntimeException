# taramanji.com の DNS を Cloudflare へ移す

ドメインの登録（更新・支払い）はお名前.comのまま、ネームサーバーだけを Cloudflare に切り替えます。
レコードの中身は変えないので、Web（Vercel）とメール（Google Workspace / Amazon SES）はそのまま動きます。DNSSEC は使っていない（DS レコードなし）ので、引き継ぎ作業はありません。

| ファイル | 内容 |
| --- | --- |
| `taramanji.com.zone` | 移行するレコード（お名前.comから取得した値） |
| `cloudflare-import.sh` | Cloudflare にゾーンを作り、レコードを取り込む（API） |
| `verify.sh` | 旧・新のネームサーバーの回答が一致するか確認する |

## 手順

1. **レコードの漏れをなくす**：お名前.comの「DNS レコード設定」を開き、`taramanji.com.zone` にないレコードを追記します。
   特に Amazon SES の DKIM（`xxxx._domainkey` の CNAME 3 本）は外から確認できないので、必ず確認してください。追記したら `; TODO` の行を消します。
2. **Cloudflare に取り込む**（どちらか一方）
   - API: `CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./dns/cloudflare-import.sh`
   - 画面: Cloudflare に taramanji.com を追加（Free）→「DNS」→「インポートとエクスポート」で `taramanji.com.zone` を取り込み、すべてのレコードを「DNS のみ」（グレーの雲）にする
3. **照合する**：`./dns/verify.sh <Cloudflare のネームサーバー>`。すべて OK になるまで Cloudflare 側を直します。
4. **切り替える**：お名前.com Navi の「ネームサーバーの変更」→「他のネームサーバーを利用」で、Cloudflare の 2 つを設定します。
5. **待つ**：Cloudflare のゾーンが Active になるまで待ちます。古いネームサーバーの情報は最大 2 日ほどキャッシュに残るので、その間は**お名前.com側のレコードを消さない**でください。
6. **公開**：`cloudflared tunnel login` のあと `./k8s/cloudflared/setup.sh gws.taramanji.com`（`k8s/README.md` 参照）

戻すときは、お名前.comでネームサーバーを `01〜04.dnsv.jp` に戻します。お名前.com側のレコードを残しておけば、すぐ元に戻ります。
