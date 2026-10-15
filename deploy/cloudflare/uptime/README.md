# taramanji-uptime（落ち始めをメールで知らせる）

kind（Mac の OrbStack）の外、Cloudflare Workers で動く外形監視。

- 1 分ごとに `TARGETS`（taramanji.com・gws.taramanji.com/admin）を見て、**2 分続けて** 5xx・つながらない・10 秒で返らないなら「落ちています」、戻ったら「戻りました」をメールする
- Datadog のモニターの通知（Webhook `taramanji-mail`）も受けてメールにする（VM のメモリ不足・再起動の繰り返しなど、落ちる前の兆し）
- 送り方は予約のメールと同じ: SES の `SendRawEmail`、送信元 `noreply@taramanji.com`、宛先 `shuta.tanahashi@taramanji.com`

Datadog の HTTP Check は kind の中の Agent が動かしているので、クラスターごと落ちると「No Data」になって知らせられない。
2026-10-14 の障害では 0:16 に検知していたが、どのモニターにも通知先がなく、誰にも届かなかった。

## 入れ方（最初の 1 回）

API トークン（Cloudflare › My Profile › API Tokens）。権限: Account › Workers Scripts › Edit、Account › Workers KV Storage › Edit、Account › Account Settings › Read（アカウントは taramanji.com の f952fdc8…）

```sh
cd deploy/cloudflare/uptime
export CLOUDFLARE_API_TOKEN="$(cat ~/Downloads/cf-workers-token.txt)"
npm ci

# 1. 状態を置く KV を作り、出てきた id を wrangler.toml の REPLACE_WITH_KV_ID に書いてコミットする
npx wrangler kv namespace create STATE

# 2. secrets（notification と同じ SES のキー。表示しない）
S=../../k8s/secrets/prod
grep '^AWS_ACCESS_KEY_ID=' $S/notification.env | cut -d= -f2- | npx wrangler secret put AWS_ACCESS_KEY_ID
grep '^AWS_SECRET_ACCESS_KEY=' $S/notification.env | cut -d= -f2- | npx wrangler secret put AWS_SECRET_ACCESS_KEY
openssl rand -hex 24 > $S/uptime-webhook-token
npx wrangler secret put WEBHOOK_TOKEN < $S/uptime-webhook-token

# 3. 出す（URL が表示される: https://taramanji-uptime.<サブドメイン>.workers.dev）
npx wrangler deploy

# 4. テストメール（届けば SES まで通っている）
curl -fsS -X POST "$URL/datadog" -H "X-Webhook-Token: $(cat $S/uptime-webhook-token)" \
  -H 'Content-Type: application/json' -d '{"title":"テスト","message":"Worker からのテストです"}'

# 5. Datadog のモニターの通知先にする
cd ../../..
python3 deploy/cloudflare/uptime/datadog-webhook.py "$URL" deploy/k8s/secrets/prod/uptime-webhook-token
NOTIFY="@webhook-taramanji-mail" python3 deploy/k8s/observability/monitors.py
```

## 変えるとき

- 見る URL・しきい値・宛先は `wrangler.toml` の `[vars]`。変えたら `npx wrangler deploy`
- 動きを見る: `npx wrangler tail`
- テスト: `npm test`（状態の進み方・5xx の判定・メールの組み立て）
