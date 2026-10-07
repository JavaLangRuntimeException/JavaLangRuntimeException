# overlays/gke（未適用）

kind（`../kind`）と同じ base を GKE に載せるときの差分。`kubectl kustomize .` で中身を確認できる。

| kind（Mac mini） | GKE |
| --- | --- |
| GHCR（ghcr.io/javalangruntimeexception） | Artifact Registry |
| Envoy Gateway（GatewayClass `eg`）+ cloud-provider-kind | GKE Gateway（`gke-l7-global-external-managed`） |
| Cloudflare Tunnel + Cloudflare の証明書 | Google のグローバル LB + Certificate Manager |
| StorageClass `standard-rwo`（local-path） | `standard-rwo`（PD balanced） |
| Secret（make-secrets.sh） | Secret Manager + External Secrets、Workload Identity |
| Datadog Agent（Helm） | 同じ（Autopilot なら `providers.gke.autopilot: true`） |

使う前に `PROJECT_ID` と `VERSION` を置き換え、Secret（`*-env`・`redis-acl`）を用意する。
