package gateway

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/url"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

var _ gateway.ResourceCluster = (*Kube)(nil)

func (k *Kube) appsPath(resource string) string {
	return "/api/v1/namespaces/" + url.PathEscape(k.appsNamespace) + "/" + resource
}

type objectList struct {
	Items []struct {
		Metadata struct {
			Name        string            `json:"name"`
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
		} `json:"metadata"`
	} `json:"items"`
}

func (l objectList) objects() []gateway.LabeledObject {
	out := make([]gateway.LabeledObject, 0, len(l.Items))
	for _, it := range l.Items {
		out = append(out, gateway.LabeledObject{Name: it.Metadata.Name, Labels: it.Metadata.Labels, Annotations: it.Metadata.Annotations})
	}
	return out
}

func (k *Kube) ConfigMaps(ctx context.Context, labelKey string) ([]gateway.LabeledObject, error) {
	var list objectList
	if err := k.get(ctx, k.appsPath("configmaps")+"?labelSelector="+url.QueryEscape(labelKey), &list); err != nil {
		return nil, err
	}
	return list.objects(), nil
}

func (k *Kube) AnnotateConfigMap(ctx context.Context, name, key, value string) error {
	return k.patch(ctx, k.appsPath("configmaps")+"/"+url.PathEscape(name), map[string]any{"metadata": map[string]any{"annotations": map[string]string{key: value}}}, nil)
}

func (k *Kube) Secrets(ctx context.Context, labelSelector string) ([]gateway.LabeledObject, error) {
	var list objectList
	if err := k.get(ctx, k.appsPath("secrets")+"?labelSelector="+url.QueryEscape(labelSelector), &list); err != nil {
		return nil, err
	}
	return list.objects(), nil
}

// PutSecret は Secret を作る。既にあれば中身を入れ替える
func (k *Kube) PutSecret(ctx context.Context, name string, labels, data map[string]string) error {
	enc := map[string]string{}
	for key, v := range data {
		enc[key] = base64.StdEncoding.EncodeToString([]byte(v))
	}
	body := map[string]any{"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
		"metadata": map[string]any{"name": name, "labels": labels}, "data": enc}
	err := k.send(ctx, http.MethodPut, k.appsPath("secrets")+"/"+url.PathEscape(name), body)
	if isNotFound(err) {
		return k.send(ctx, http.MethodPost, k.appsPath("secrets"), body)
	}
	return err
}

func (k *Kube) DeleteSecret(ctx context.Context, name string) error {
	err := k.send(ctx, http.MethodDelete, k.appsPath("secrets")+"/"+url.PathEscape(name), nil)
	if isNotFound(err) {
		return nil
	}
	return err
}
