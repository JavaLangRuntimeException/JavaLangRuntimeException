package gateway

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

var _ gateway.ResourceCluster = (*Kube)(nil)

// nsPath は namespace の中のリソースのパス。ns が空なら、この環境の共有の namespace
func (k *Kube) nsPath(ns, resource string) string {
	if ns == "" {
		ns = k.appsNamespace
	}
	prefix := "/api/v1"
	switch resource {
	case "networkpolicies":
		prefix = "/apis/networking.k8s.io/v1"
	case "rolebindings":
		prefix = "/apis/rbac.authorization.k8s.io/v1"
	}
	return prefix + "/namespaces/" + url.PathEscape(ns) + "/" + resource
}

type objectList struct {
	Items []struct {
		Metadata struct {
			Name        string            `json:"name"`
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
		} `json:"metadata"`
		Data map[string]string `json:"data"`
	} `json:"items"`
}

func (l objectList) objects() []gateway.LabeledObject {
	out := make([]gateway.LabeledObject, 0, len(l.Items))
	for _, it := range l.Items {
		out = append(out, gateway.LabeledObject{Name: it.Metadata.Name, Labels: it.Metadata.Labels, Annotations: it.Metadata.Annotations, Data: it.Data})
	}
	return out
}

func (k *Kube) list(ctx context.Context, path, labelSelector string) ([]gateway.LabeledObject, error) {
	var list objectList
	if err := k.get(ctx, path+"?labelSelector="+url.QueryEscape(labelSelector), &list); err != nil {
		return nil, err
	}
	return list.objects(), nil
}

// ConfigMaps は共有の namespace の、ラベル labelKey が付いた ConfigMap（中身も）
func (k *Kube) ConfigMaps(ctx context.Context, labelKey string) ([]gateway.LabeledObject, error) {
	objs, err := k.list(ctx, k.nsPath("", "configmaps"), labelKey)
	if err != nil {
		return nil, err
	}
	// Secret ではないが、data は使う人（コントローラー）にだけ渡す
	return objs, nil
}

func (k *Kube) AnnotateConfigMap(ctx context.Context, name, key, value string) error {
	return k.patch(ctx, k.nsPath("", "configmaps")+"/"+url.PathEscape(name), map[string]any{"metadata": map[string]any{"annotations": map[string]string{key: value}}}, nil)
}

func (k *Kube) Namespaces(ctx context.Context, labelSelector string) ([]gateway.LabeledObject, error) {
	return k.list(ctx, "/api/v1/namespaces", labelSelector)
}

// put はオブジェクトを丸ごと置き換える。なければ作る
func (k *Kube) put(ctx context.Context, collection, name string, body map[string]any) error {
	err := k.send(ctx, http.MethodPut, collection+"/"+url.PathEscape(name), body)
	if isNotFound(err) {
		return k.send(ctx, http.MethodPost, collection, body)
	}
	return err
}

func (k *Kube) PutNamespace(ctx context.Context, name string, labels map[string]string) error {
	return k.put(ctx, "/api/v1/namespaces", name, map[string]any{"apiVersion": "v1", "kind": "Namespace",
		"metadata": map[string]any{"name": name, "labels": labels}})
}

func (k *Kube) DeleteNamespace(ctx context.Context, name string) error {
	err := k.send(ctx, http.MethodDelete, "/api/v1/namespaces/"+url.PathEscape(name), nil)
	if isNotFound(err) {
		return nil
	}
	return err
}

var objectAPIVersion = map[string]string{
	"resourcequotas": "v1", "limitranges": "v1", "serviceaccounts": "v1",
	"networkpolicies": "networking.k8s.io/v1", "rolebindings": "rbac.authorization.k8s.io/v1",
}

var objectKind = map[string]string{
	"resourcequotas": "ResourceQuota", "limitranges": "LimitRange", "serviceaccounts": "ServiceAccount",
	"networkpolicies": "NetworkPolicy", "rolebindings": "RoleBinding",
}

// Put は namespace ns に、囲いのオブジェクト（ResourceQuota・LimitRange・NetworkPolicy・ServiceAccount・RoleBinding）を置く。
// obj は apiVersion・kind・metadata.name/namespace 以外（spec・roleRef など）
func (k *Kube) Put(ctx context.Context, ns, resource, name string, labels map[string]string, obj map[string]any) error {
	api, ok := objectAPIVersion[resource]
	if !ok || ns == "" {
		return fmt.Errorf("unsupported resource %q", resource)
	}
	body := map[string]any{"apiVersion": api, "kind": objectKind[resource], "metadata": map[string]any{"name": name, "namespace": ns, "labels": labels}}
	for key, v := range obj {
		body[key] = v
	}
	return k.put(ctx, k.nsPath(ns, resource), name, body)
}

func (k *Kube) Secrets(ctx context.Context, ns, labelSelector string) ([]gateway.LabeledObject, error) {
	objs, err := k.list(ctx, k.nsPath(ns, "secrets"), labelSelector)
	for i := range objs {
		// Secret の中身は読み戻さない
		objs[i].Data = nil
	}
	return objs, err
}

// PutSecret は Secret を作る。既にあれば中身を入れ替える
func (k *Kube) PutSecret(ctx context.Context, ns, name string, labels, data map[string]string) error {
	enc := map[string]string{}
	for key, v := range data {
		enc[key] = base64.StdEncoding.EncodeToString([]byte(v))
	}
	return k.put(ctx, k.nsPath(ns, "secrets"), name, map[string]any{"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
		"metadata": map[string]any{"name": name, "labels": labels}, "data": enc})
}

func (k *Kube) DeleteSecret(ctx context.Context, ns, name string) error {
	err := k.send(ctx, http.MethodDelete, k.nsPath(ns, "secrets")+"/"+url.PathEscape(name), nil)
	if isNotFound(err) {
		return nil
	}
	return err
}
