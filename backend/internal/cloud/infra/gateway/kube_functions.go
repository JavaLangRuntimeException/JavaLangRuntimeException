package gateway

import (
	"context"
	"net/url"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

var _ gateway.FunctionScaler = (*Kube)(nil)

type functionDeployment struct {
	Metadata struct {
		Name        string            `json:"name"`
		Annotations map[string]string `json:"annotations"`
	} `json:"metadata"`
	Spec struct {
		Replicas *int32 `json:"replicas"`
	} `json:"spec"`
	Status struct {
		ReadyReplicas int32 `json:"readyReplicas"`
	} `json:"status"`
}

func (d functionDeployment) state() gateway.FunctionState {
	s := gateway.FunctionState{Name: d.Metadata.Name, Replicas: 1, Ready: d.Status.ReadyReplicas}
	if d.Spec.Replicas != nil {
		s.Replicas = *d.Spec.Replicas
	}
	if t, err := time.Parse(time.RFC3339, d.Metadata.Annotations[service.AnnotationLastRequest]); err == nil {
		s.LastRequest = t
	}
	return s
}

func (k *Kube) functionPath(name string) string {
	return "/apis/apps/v1/namespaces/" + url.PathEscape(k.appsNamespace) + "/deployments/" + url.PathEscape(name)
}

func (k *Kube) Function(ctx context.Context, name string) (gateway.FunctionState, error) {
	var d functionDeployment
	if err := k.get(ctx, k.functionPath(name), &d); err != nil {
		if isNotFound(err) {
			return gateway.FunctionState{}, gateway.ErrFunctionNotFound
		}
		return gateway.FunctionState{}, err
	}
	return d.state(), nil
}

func (k *Kube) Running(ctx context.Context) ([]gateway.FunctionState, error) {
	var list struct {
		Items []functionDeployment `json:"items"`
	}
	if err := k.get(ctx, "/apis/apps/v1/namespaces/"+url.PathEscape(k.appsNamespace)+"/deployments", &list); err != nil {
		return nil, err
	}
	out := []gateway.FunctionState{}
	for _, d := range list.Items {
		if s := d.state(); s.Replicas > 0 {
			out = append(out, s)
		}
	}
	return out, nil
}

// Scale は scale サブリソースだけを書き換える（Deployment の中身には触れない）
func (k *Kube) Scale(ctx context.Context, name string, replicas int32) error {
	err := k.patch(ctx, k.functionPath(name)+"/scale", map[string]any{"spec": map[string]any{"replicas": replicas}}, nil)
	if isNotFound(err) {
		return gateway.ErrFunctionNotFound
	}
	return err
}

func (k *Kube) Touch(ctx context.Context, name string, at time.Time) error {
	err := k.patch(ctx, k.functionPath(name), map[string]any{"metadata": map[string]any{
		"annotations": map[string]string{service.AnnotationLastRequest: at.UTC().Format(time.RFC3339)}}}, nil)
	if isNotFound(err) {
		return gateway.ErrFunctionNotFound
	}
	return err
}
