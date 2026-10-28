// Package service は taramanji cloud のコンソールの判断（メトリクスの問い合わせの組み立て・版の取り出し）。
package service

import (
	"fmt"
	"strings"
	"time"
)

// Ranges はコンソールで選べる期間
var Ranges = map[string]time.Duration{"1h": time.Hour, "1d": 24 * time.Hour, "7d": 7 * 24 * time.Hour}

// MetricQuery は 1 つのグラフの問い合わせ
type MetricQuery struct {
	ID    string
	Unit  string
	Query string
	// Scale は Datadog の値に掛ける数（ナノコア → ミリコア、秒 → ミリ秒）
	Scale float64
	// GroupTag は by {...} で分けたタグ。空なら全体で 1 本
	GroupTag string
}

// MetricsScope は見る範囲
type MetricsScope struct {
	// Cluster は Datadog の kube_cluster_name
	Cluster string
	// Namespaces はコンソールとデプロイしたアプリの namespace
	Namespaces []string
	// Gateway は cloud の Gateway の Envoy に付けた gateway タグの値
	Gateway string
	// APMEnv・APMServices は p95 を見る APM のサービス
	APMEnv      string
	APMServices []string
}

func or(tag string, values []string, suffix string) string {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = tag + ":" + v + suffix
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " OR ") + ")"
}

// Queries は概要のグラフの問い合わせ。リクエストは cloud の Gateway（Envoy）、CPU・メモリはコンテナ、p95 は APM から取る
func Queries(s MetricsScope) []MetricQuery {
	// Envoy の上流クラスター名は httproute/<namespace>/<HTTPRoute 名>/rule/<n>
	routes := fmt.Sprintf("gateway:%s AND %s", s.Gateway, or("envoy_cluster_name", prefixed("httproute/", s.Namespaces), "/*"))
	containers := fmt.Sprintf("kube_cluster_name:%s AND %s", s.Cluster, or("kube_namespace", s.Namespaces, ""))
	apm := fmt.Sprintf("env:%s AND %s", s.APMEnv, or("service", s.APMServices, ""))
	rq := "sum:envoy.cluster.upstream_rq.count"
	return []MetricQuery{
		{ID: "requests", Unit: "req/s", Scale: 1, GroupTag: "envoy_cluster_name",
			Query: fmt.Sprintf("%s{%s} by {envoy_cluster_name}.as_rate()", rq, routes)},
		{ID: "errors_5xx", Unit: "%", Scale: 1,
			Query: fmt.Sprintf("100 * %s{%s AND envoy_response_code_class:5}.as_count() / %s{%s}.as_count()", rq, routes, rq, routes)},
		{ID: "latency_p95", Unit: "ms", Scale: 1000, GroupTag: "service",
			Query: fmt.Sprintf("p95:trace.http.server.request{%s} by {service}", apm)},
		{ID: "cpu", Unit: "mcores", Scale: 1e-6, GroupTag: "kube_deployment",
			Query: fmt.Sprintf("sum:container.cpu.usage{%s} by {kube_deployment}", containers)},
		{ID: "memory", Unit: "bytes", Scale: 1, GroupTag: "kube_deployment",
			Query: fmt.Sprintf("sum:container.memory.usage{%s} by {kube_deployment}", containers)},
	}
}

func prefixed(p string, values []string) []string {
	out := make([]string, len(values))
	for i, v := range values {
		out[i] = p + v
	}
	return out
}

// GroupLabel は時系列のタグから画面に出す名前を作る（HTTPRoute は「namespace/名前」だけにする）
func GroupLabel(groupTag string, tags []string) string {
	if groupTag == "" {
		return ""
	}
	for _, t := range tags {
		v, ok := strings.CutPrefix(t, groupTag+":")
		if !ok {
			continue
		}
		if groupTag == "envoy_cluster_name" {
			if p := strings.Split(v, "/"); len(p) >= 3 && p[0] == "httproute" {
				return p[1] + "/" + p[2]
			}
		}
		return v
	}
	return ""
}

// Version はイメージのタグ（ghcr.io/…/taramanji-cloud:sha-abc1234 → sha-abc1234）。digest 付きなら digest を外す
func Version(image string) string {
	image, _, _ = strings.Cut(image, "@")
	i := strings.LastIndex(image, ":")
	if i < 0 || strings.Contains(image[i:], "/") {
		return "latest"
	}
	return image[i+1:]
}
