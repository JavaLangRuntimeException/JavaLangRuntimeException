package gateway

import (
	"context"
	"net/url"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

// 関数ごとの namespace に、コントローラーが付けるラベル
const (
	LabelNamespaceRegistry = "cloud.taramanji.com/registry"
	LabelNamespaceTier     = "cloud.taramanji.com/tier"
	TierFunction           = "function"
)

type fnNamespace struct {
	function  string
	namespace string
}

// functionNamespaces はこの環境の関数ごとの namespace（コントローラーが作ったもの）
func (k *Kube) functionNamespaces(ctx context.Context) ([]fnNamespace, error) {
	var list struct {
		Items []struct {
			Metadata struct {
				Name   string            `json:"name"`
				Labels map[string]string `json:"labels"`
			} `json:"metadata"`
		} `json:"items"`
	}
	sel := LabelNamespaceRegistry + "=" + k.appsNamespace + "," + service.LabelFunction
	if err := k.get(ctx, "/api/v1/namespaces?labelSelector="+url.QueryEscape(sel), &list); err != nil {
		return nil, err
	}
	out := []fnNamespace{}
	for _, it := range list.Items {
		name := it.Metadata.Labels[service.LabelFunction]
		// ほかの環境・手で作ったもの（名前の決まりに合わない）は見ない
		if service.ValidName(name) && it.Metadata.Name == k.functionNamespace(name) {
			out = append(out, fnNamespace{function: name, namespace: it.Metadata.Name})
		}
	}
	return out, nil
}

func (k *Kube) functionNamespace(name string) string { return service.FunctionNamespace(k.env, name) }
