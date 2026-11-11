package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

var _ gateway.Applier = (*Kube)(nil)

// デプロイヤーが入れたオブジェクトに付けるラベル（自分が入れたものだけを消す）
const (
	LabelDeployManaged = "cloud.taramanji.com/deployed-by"
	DeployManagedValue = "cloud-deployer"
	LabelDeployEnv     = "cloud.taramanji.com/deploy-env"
	LabelDeploySource  = "cloud.taramanji.com/source"
	deployFieldManager = "cloud-deployer"
)

type kindAPI struct {
	group    string // "" は core（/api/v1）
	version  string
	resource string
}

// deployKinds はデプロイヤーが扱う種類だけ（ほかの種類はそもそも入れられない）
var deployKinds = map[string]kindAPI{
	"Deployment":            {"apps", "v1", "deployments"},
	"Service":               {"", "v1", "services"},
	"ConfigMap":             {"", "v1", "configmaps"},
	"PersistentVolumeClaim": {"", "v1", "persistentvolumeclaims"},
	"HTTPRoute":             {"gateway.networking.k8s.io", "v1", "httproutes"},
}

func (a kindAPI) prefix() string {
	if a.group == "" {
		return "/api/" + a.version
	}
	return "/apis/" + a.group + "/" + a.version
}

func (a kindAPI) objectPath(ns, name string) string {
	return a.prefix() + "/namespaces/" + url.PathEscape(ns) + "/" + a.resource + "/" + url.PathEscape(name)
}

func (k *Kube) Apply(ctx context.Context, obj map[string]any) error {
	kind, _ := obj["kind"].(string)
	api, ok := deployKinds[kind]
	if !ok {
		return fmt.Errorf("%q は入れられません", kind)
	}
	meta, _ := obj["metadata"].(map[string]any)
	ns, _ := meta["namespace"].(string)
	name, _ := meta["name"].(string)
	if ns == "" || name == "" {
		return fmt.Errorf("namespace と名前が要ります")
	}
	b, err := json.Marshal(obj)
	if err != nil {
		return err
	}
	q := "?fieldManager=" + deployFieldManager + "&force=true"
	return k.do(ctx, http.MethodPatch, api.objectPath(ns, name)+q, "application/apply-patch+yaml", b, nil)
}

func (k *Kube) Managed(ctx context.Context, env string) ([]gateway.ManagedObject, error) {
	sel := url.QueryEscape(LabelDeployManaged + "=" + DeployManagedValue + "," + LabelDeployEnv + "=" + env)
	out := []gateway.ManagedObject{}
	for kind, api := range deployKinds {
		var list struct {
			Items []struct {
				Metadata struct {
					Name      string            `json:"name"`
					Namespace string            `json:"namespace"`
					Labels    map[string]string `json:"labels"`
				} `json:"metadata"`
			} `json:"items"`
		}
		if err := k.get(ctx, api.prefix()+"/"+api.resource+"?labelSelector="+sel, &list); err != nil {
			return nil, err
		}
		for _, it := range list.Items {
			out = append(out, gateway.ManagedObject{Kind: kind, Namespace: it.Metadata.Namespace, Name: it.Metadata.Name, Source: it.Metadata.Labels[LabelDeploySource]})
		}
	}
	return out, nil
}

func (k *Kube) Delete(ctx context.Context, o gateway.ManagedObject) error {
	api, ok := deployKinds[o.Kind]
	if !ok {
		return fmt.Errorf("%q は扱えません", o.Kind)
	}
	err := k.send(ctx, http.MethodDelete, api.objectPath(o.Namespace, o.Name), nil)
	if isNotFound(err) {
		return nil
	}
	return err
}

func (k *Kube) NamespaceExists(ctx context.Context, ns string) (bool, error) {
	var out map[string]any
	err := k.get(ctx, "/api/v1/namespaces/"+url.PathEscape(ns), &out)
	if isNotFound(err) {
		return false, nil
	}
	return err == nil, err
}

func (k *Kube) PutConfigMap(ctx context.Context, name string, labels, data map[string]string) error {
	return k.put(ctx, k.nsPath("", "configmaps"), name, map[string]any{"apiVersion": "v1", "kind": "ConfigMap",
		"metadata": map[string]any{"name": name, "labels": labels}, "data": data})
}
