// Package gateway は taramanji cloud のコンソールの外部実装（Kubernetes API・Datadog）。
package gateway

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

const (
	saDir = "/var/run/secrets/kubernetes.io/serviceaccount"
	// コンソールの部品に付けるラベル（Role もこの namespace の読み取りだけ）
	partOfSelector = "app.kubernetes.io/part-of=taramanji-cloud"
)

// Kube は Pod の ServiceAccount で Kubernetes API を呼ぶ最小のクライアント。
// client-go は依存が大きく、全 Go サービスの go.mod に入ってしまうので、使う API だけを REST で叩く
type Kube struct {
	http      *http.Client
	base      string
	namespace string
	// appsNamespace はこの環境のアプリを置く namespace（ResourceQuota で枠を決めてある）
	appsNamespace string
	tokenPath     string
}

var (
	_ gateway.Cluster  = (*Kube)(nil)
	_ gateway.Capacity = (*Kube)(nil)
)

// NewInClusterKube は Pod の中から、自分の namespace とアプリ用 namespace の API を読む
func NewInClusterKube(namespace, appsNamespace string) (*Kube, error) {
	host, port := os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		return nil, errors.New("not running in a Kubernetes pod (KUBERNETES_SERVICE_HOST is empty)")
	}
	ca, err := os.ReadFile(saDir + "/ca.crt")
	if err != nil {
		return nil, err
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		return nil, errors.New("invalid service account CA")
	}
	hc := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}}}
	return &Kube{http: hc, base: "https://" + net.JoinHostPort(host, port), namespace: namespace, appsNamespace: appsNamespace,
		tokenPath: saDir + "/token"}, nil
}

func (k *Kube) get(ctx context.Context, path string, out any) error {
	return k.do(ctx, http.MethodGet, path, "", nil, out)
}

// send は JSON の本文で POST / PUT / DELETE する
func (k *Kube) send(ctx context.Context, method, path string, body any) error {
	var b []byte
	if body != nil {
		var err error
		if b, err = json.Marshal(body); err != nil {
			return err
		}
	}
	return k.do(ctx, method, path, "application/json", b, nil)
}

// patch は JSON Merge Patch（RFC 7386）を送る
func (k *Kube) patch(ctx context.Context, path string, body, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	return k.do(ctx, http.MethodPatch, path, "application/merge-patch+json", b, out)
}

func (k *Kube) do(ctx context.Context, method, path, contentType string, body []byte, out any) error {
	// 投影されたトークンは kubelet が入れ替えるので、毎回読む
	token, err := os.ReadFile(k.tokenPath)
	if err != nil {
		return err
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, k.base+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))
	req.Header.Set("Accept", "application/json")
	res, err := k.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, _ = io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusCreated {
		if len(body) > 300 {
			body = body[:300]
		}
		return &apiError{method: method, path: path, status: res.StatusCode, body: string(body)}
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(body, out)
}

type apiError struct {
	method string
	path   string
	status int
	body   string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("kubernetes %s %s: HTTP %d: %s", e.method, e.path, e.status, e.body)
}

func isNotFound(err error) bool {
	var e *apiError
	return errors.As(err, &e) && e.status == http.StatusNotFound
}

type workloadList struct {
	Items []struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
		Spec struct {
			Replicas *int32 `json:"replicas"`
			Template struct {
				Spec struct {
					Containers []struct {
						Image string `json:"image"`
					} `json:"containers"`
				} `json:"spec"`
			} `json:"template"`
		} `json:"spec"`
		Status struct {
			ReadyReplicas int32 `json:"readyReplicas"`
		} `json:"status"`
	} `json:"items"`
}

func (k *Kube) Workloads(ctx context.Context) ([]gateway.Workload, error) {
	var out []gateway.Workload
	q := "?labelSelector=" + url.QueryEscape(partOfSelector)
	// nonprod は Argo Rollouts の Rollout で動かすこともあるが、コンソールの部品は Deployment / StatefulSet に限る
	for _, kind := range []string{"deployments", "statefulsets"} {
		var list workloadList
		if err := k.get(ctx, "/apis/apps/v1/namespaces/"+url.PathEscape(k.namespace)+"/"+kind+q, &list); err != nil {
			return nil, err
		}
		out = append(out, list.workloads()...)
	}
	return out, nil
}

func (l workloadList) workloads() []gateway.Workload {
	out := make([]gateway.Workload, 0, len(l.Items))
	for _, it := range l.Items {
		w := gateway.Workload{Name: it.Metadata.Name, Ready: it.Status.ReadyReplicas, Desired: 1}
		if it.Spec.Replicas != nil {
			w.Desired = *it.Spec.Replicas
		}
		if c := it.Spec.Template.Spec.Containers; len(c) > 0 {
			w.Image = c[0].Image
		}
		out = append(out, w)
	}
	return out
}

// AppWorkloads はアプリ用 namespace の Deployment（Argo CD がアプリのリポジトリから入れたもの）
func (k *Kube) AppWorkloads(ctx context.Context) ([]gateway.Workload, error) {
	var list workloadList
	if err := k.get(ctx, "/apis/apps/v1/namespaces/"+url.PathEscape(k.appsNamespace)+"/deployments", &list); err != nil {
		return nil, err
	}
	return list.workloads(), nil
}

// LabeledConfigMaps はアプリ用 namespace の、ラベル key が付いた ConfigMap の、そのラベルの値（バケット名など）
func (k *Kube) LabeledConfigMaps(ctx context.Context, key string) ([]string, error) {
	var list struct {
		Items []struct {
			Metadata struct {
				Labels map[string]string `json:"labels"`
			} `json:"metadata"`
		} `json:"items"`
	}
	path := "/api/v1/namespaces/" + url.PathEscape(k.appsNamespace) + "/configmaps?labelSelector=" + url.QueryEscape(key)
	if err := k.get(ctx, path, &list); err != nil {
		return nil, err
	}
	out := []string{}
	for _, it := range list.Items {
		out = append(out, it.Metadata.Labels[key])
	}
	return out, nil
}
