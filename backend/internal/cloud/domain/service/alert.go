package service

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// AlertPreset は用意してある監視。関数ごとに選ぶと、Datadog のモニターになる
type AlertPreset struct {
	ID          string
	Label       string
	Description string
	// query はスコープを入れて Datadog のモニターの式にする
	query func(s AlertScope, app string) string
	// message は通知の本文（{{value}} は Datadog が値に置き換える）
	message string
}

// AlertScope はモニターが見る範囲
type AlertScope struct {
	// Environment は prod / stg / dev（モニターのタグに入れる）
	Environment string
	// Cluster は Datadog の kube_cluster_name
	Cluster string
	// Namespace はアプリ用 namespace
	Namespace string
	// APMEnv・InvokerService は、関数の呼び出しを見る APM（API Gateway）の env と service
	APMEnv         string
	InvokerService string
}

func (s AlertScope) containers(app string) string {
	return fmt.Sprintf("kube_cluster_name:%s,kube_namespace:%s,kube_deployment:%s", s.Cluster, s.Namespace, app)
}

// AlertPresets は選べる監視（画面に出す順）
var AlertPresets = []AlertPreset{
	{ID: "cpu-high", Label: "CPU の使いすぎ", Description: "CPU の使用量が上限の 80% を 10 分続けて超えた",
		message: "CPU の使用量が上限の {{value}}% です。インスタンスタイプを上げるか、台数を増やしてください。",
		query: func(s AlertScope, app string) string {
			return fmt.Sprintf("avg(last_10m):100 * sum:container.cpu.usage{%[1]s} / sum:container.cpu.limit{%[1]s} > 80", s.containers(app))
		}},
	{ID: "memory-high", Label: "メモリの使いすぎ", Description: "メモリの使用量が上限の 90% を 5 分続けて超えた（上限に届くと再起動される）",
		message: "メモリの使用量が上限の {{value}}% です。上限に届くと OOMKilled で再起動されます。",
		query: func(s AlertScope, app string) string {
			return fmt.Sprintf("avg(last_5m):100 * sum:container.memory.usage{%[1]s} / sum:container.memory.limit{%[1]s} > 90", s.containers(app))
		}},
	{ID: "restarts", Label: "再起動の繰り返し", Description: "15 分で 3 回を超えて再起動した（CrashLoopBackOff・OOMKilled）",
		message: "15 分で {{value}} 回再起動しました（CrashLoopBackOff・OOMKilled を確認）。",
		query: func(s AlertScope, app string) string {
			return fmt.Sprintf("change(sum(last_15m),last_15m):sum:kubernetes_state.container.restarts{%s} > 3", s.containers(app))
		}},
	{ID: "errors", Label: "エラーの増加", Description: "10 分の呼び出しのうち、5xx（関数のエラー・起動の失敗）が 5% を超えた",
		message: "呼び出しの {{value}}% が 5xx です。",
		query: func(s AlertScope, app string) string {
			// API Gateway（cloud-gw）の APM。リソース名は関数名
			apm := fmt.Sprintf("env:%s,service:%s,resource_name:%s", s.APMEnv, s.InvokerService, app)
			return fmt.Sprintf("sum(last_10m):100 * sum:trace.http.server.request.errors{%[1]s}.as_count() / sum:trace.http.server.request.hits{%[1]s}.as_count() > 5", apm)
		}},
}

func alertIDs() []string {
	ids := make([]string, len(AlertPresets))
	for i, p := range AlertPresets {
		ids[i] = p.ID
	}
	return ids
}

// AlertPresetOf は ID から監視を探す
func AlertPresetOf(id string) (AlertPreset, bool) {
	for _, p := range AlertPresets {
		if p.ID == id {
			return p, true
		}
	}
	return AlertPreset{}, false
}

// モニターのタグ。managed-by とこの環境のタグが付いたものだけを、このコンソールが作り直す・消す
const (
	tagManaged  = "managed-by:taramanji-cloud"
	tagEnvKey   = "cloud-env:"
	tagAppKey   = "cloud-app:"
	tagAlertKey = "cloud-alert:"
)

// 通知先ごとの Datadog の Webhook（deploy/cloudflare/uptime/datadog-webhook.py が作る）。
// どちらも Cloudflare Worker（taramanji-uptime）に届き、Worker が SES のメール / Discord に送る
var notifyHandles = map[string]string{
	NotifyMail:    "@webhook-taramanji-cloud-mail",
	NotifyDiscord: "@webhook-taramanji-cloud-discord",
}

// ManagedMonitorTags はこの環境のモニターを探すタグ
func ManagedMonitorTags(s AlertScope) []string {
	return []string{tagManaged, tagEnvKey + s.Environment}
}

// DesiredMonitors はアプリの定義から、あるべき Datadog のモニターを作る
func DesiredMonitors(s AlertScope, apps []FunctionSpec) []gateway.Monitor {
	out := []gateway.Monitor{}
	for _, app := range apps {
		handles := []string{}
		for _, n := range app.Notify {
			if h, ok := notifyHandles[n]; ok {
				handles = append(handles, h)
			}
		}
		for _, id := range app.Alerts {
			p, ok := AlertPresetOf(id)
			if !ok {
				continue
			}
			msg := fmt.Sprintf("%s（%s）: %s", app.Name, s.Environment, p.message)
			if len(handles) > 0 {
				msg += "\n\n" + strings.Join(handles, " ")
			}
			out = append(out, gateway.Monitor{
				Name:    fmt.Sprintf("[taramanji cloud %s] %s: %s", s.Environment, app.Name, p.Label),
				Query:   p.query(s, app.Name),
				Message: msg,
				Tags:    append(ManagedMonitorTags(s), tagAppKey+app.Name, tagAlertKey+id),
			})
		}
	}
	return out
}

// MonitorPlan は Datadog にある状態をあるべき状態にそろえる手順
type MonitorPlan struct {
	Create []gateway.Monitor
	Update []gateway.Monitor
	Delete []gateway.Monitor
}

func monitorKey(m gateway.Monitor) string {
	var app, alert string
	for _, t := range m.Tags {
		if v, ok := strings.CutPrefix(t, tagAppKey); ok {
			app = v
		}
		if v, ok := strings.CutPrefix(t, tagAlertKey); ok {
			alert = v
		}
	}
	return app + "/" + alert
}

// PlanMonitors は「アプリ + 監視」で突き合わせる。同じ組が 2 つあれば（同時に保存したときなど）余りを消す
func PlanMonitors(existing, desired []gateway.Monitor) MonitorPlan {
	var plan MonitorPlan
	have := map[string]gateway.Monitor{}
	for _, m := range existing {
		k := monitorKey(m)
		if _, dup := have[k]; dup {
			plan.Delete = append(plan.Delete, m)
			continue
		}
		have[k] = m
	}
	for _, want := range desired {
		k := monitorKey(want)
		cur, ok := have[k]
		if !ok {
			plan.Create = append(plan.Create, want)
			continue
		}
		delete(have, k)
		if cur.Name != want.Name || cur.Query != want.Query || cur.Message != want.Message || !sameTags(cur.Tags, want.Tags) {
			want.ID = cur.ID
			plan.Update = append(plan.Update, want)
		}
	}
	for _, m := range have {
		plan.Delete = append(plan.Delete, m)
	}
	sort.Slice(plan.Delete, func(i, j int) bool { return plan.Delete[i].ID < plan.Delete[j].ID })
	return plan
}

func sameTags(a, b []string) bool {
	a, b = slices.Clone(a), slices.Clone(b)
	slices.Sort(a)
	slices.Sort(b)
	return slices.Equal(a, b)
}
