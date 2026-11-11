package gateway

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

// appsQuotaName はアプリ用 namespace の枠（deploy/cloud/workloads/quota.yaml）
const appsQuotaName = "apps"

type quantities map[string]string

type resourceQuota struct {
	Status struct {
		Hard quantities `json:"hard"`
		Used quantities `json:"used"`
	} `json:"status"`
}

func (k *Kube) AppsNamespace() string { return k.appsNamespace }

func (k *Kube) AppQuota(ctx context.Context) (gateway.QuotaStatus, error) {
	var q resourceQuota
	err := k.get(ctx, "/api/v1/namespaces/"+url.PathEscape(k.appsNamespace)+"/resourcequotas/"+appsQuotaName, &q)
	if isNotFound(err) {
		return gateway.QuotaStatus{}, nil
	}
	if err != nil {
		return gateway.QuotaStatus{}, err
	}
	hard, err := resourcesOf(q.Status.Hard)
	if err != nil {
		return gateway.QuotaStatus{}, err
	}
	used, err := resourcesOf(q.Status.Used)
	if err != nil {
		return gateway.QuotaStatus{}, err
	}
	return gateway.QuotaStatus{Found: true, Hard: hard, Used: used}, nil
}

// resourcesOf は ResourceQuota の値を読む。メモリと CPU は limits を見る（アプリ用 namespace は requests = limits にそろえてある）
func resourcesOf(q quantities) (gateway.Resources, error) {
	var r gateway.Resources
	var err error
	if r.MemoryBytes, err = parseQuantity(q["limits.memory"], 1); err != nil {
		return r, err
	}
	if r.CPUMillis, err = parseQuantity(q["limits.cpu"], 1000); err != nil {
		return r, err
	}
	if r.Pods, err = parseQuantity(q["pods"], 1); err != nil {
		return r, err
	}
	if r.StorageBytes, err = parseQuantity(q["requests.storage"], 1); err != nil {
		return r, err
	}
	return r, nil
}

type podList struct {
	Items []struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
		Spec struct {
			Containers []struct {
				Resources struct {
					Limits quantities `json:"limits"`
				} `json:"resources"`
			} `json:"containers"`
		} `json:"spec"`
		Status struct {
			Phase string `json:"phase"`
		} `json:"status"`
	} `json:"items"`
}

type podMetricsList struct {
	Items []struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
		Containers []struct {
			Usage quantities `json:"usage"`
		} `json:"containers"`
	} `json:"items"`
}

func (k *Kube) AppPods(ctx context.Context) ([]gateway.PodUsage, error) {
	ns := url.PathEscape(k.appsNamespace)
	var pods podList
	if err := k.get(ctx, "/api/v1/namespaces/"+ns+"/pods", &pods); err != nil {
		return nil, err
	}
	var metrics podMetricsList
	if err := k.get(ctx, "/apis/metrics.k8s.io/v1beta1/namespaces/"+ns+"/pods", &metrics); err != nil {
		return nil, err
	}
	usage := map[string]gateway.PodUsage{}
	for _, m := range metrics.Items {
		var u gateway.PodUsage
		for _, c := range m.Containers {
			mem, err := parseQuantity(c.Usage["memory"], 1)
			if err != nil {
				return nil, err
			}
			cpu, err := parseQuantity(c.Usage["cpu"], 1000)
			if err != nil {
				return nil, err
			}
			u.MemoryUsed += mem
			u.CPUUsed += cpu
		}
		usage[m.Metadata.Name] = u
	}
	out := []gateway.PodUsage{}
	for _, p := range pods.Items {
		// 終わった Pod（Job の完了など）は枠を使っていない
		if p.Status.Phase == "Succeeded" || p.Status.Phase == "Failed" {
			continue
		}
		u := usage[p.Metadata.Name]
		u.Name = p.Metadata.Name
		for _, c := range p.Spec.Containers {
			lim, err := parseQuantity(c.Resources.Limits["memory"], 1)
			if err != nil {
				return nil, err
			}
			u.MemoryLimit += lim
		}
		out = append(out, u)
	}
	return out, nil
}

type nodeList struct {
	Items []struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
		Status struct {
			Capacity quantities `json:"capacity"`
		} `json:"status"`
	} `json:"items"`
}

type nodeMetricsList struct {
	Items []struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
		Usage quantities `json:"usage"`
	} `json:"items"`
}

func (k *Kube) Nodes(ctx context.Context) ([]gateway.NodeStatus, error) {
	var nodes nodeList
	if err := k.get(ctx, "/api/v1/nodes", &nodes); err != nil {
		return nil, err
	}
	var metrics nodeMetricsList
	if err := k.get(ctx, "/apis/metrics.k8s.io/v1beta1/nodes", &metrics); err != nil {
		return nil, err
	}
	usage := map[string]quantities{}
	for _, m := range metrics.Items {
		usage[m.Metadata.Name] = m.Usage
	}
	out := make([]gateway.NodeStatus, 0, len(nodes.Items))
	for _, n := range nodes.Items {
		s := gateway.NodeStatus{Name: n.Metadata.Name}
		var err error
		if s.MemoryCapacity, err = parseQuantity(n.Status.Capacity["memory"], 1); err != nil {
			return nil, err
		}
		if s.CPUCapacity, err = parseQuantity(n.Status.Capacity["cpu"], 1000); err != nil {
			return nil, err
		}
		u := usage[n.Metadata.Name]
		if s.MemoryUsed, err = parseQuantity(u["memory"], 1); err != nil {
			return nil, err
		}
		if s.CPUUsed, err = parseQuantity(u["cpu"], 1000); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

var quantityRe = regexp.MustCompile(`^([+-]?[0-9]*\.?[0-9]+)(?:[eE]([+-]?[0-9]+))?(Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E)?$`)

var quantitySuffix = map[string]float64{
	"": 1, "n": 1e-9, "u": 1e-6, "m": 1e-3, "k": 1e3, "M": 1e6, "G": 1e9, "T": 1e12, "P": 1e15, "E": 1e18,
	"Ki": 1 << 10, "Mi": 1 << 20, "Gi": 1 << 30, "Ti": 1 << 40, "Pi": 1 << 50, "Ei": 1 << 60,
}

// parseQuantity は Kubernetes の量（"12304172Ki"・"950m"・"1.5"・"1e3"）を、scale 倍した整数にする
// （メモリは scale=1 でバイト、CPU は scale=1000 でミリコア）。空なら 0
func parseQuantity(s string, scale float64) (int64, error) {
	if s == "" {
		return 0, nil
	}
	m := quantityRe.FindStringSubmatch(s)
	if m == nil {
		return 0, fmt.Errorf("invalid quantity %q", s)
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0, fmt.Errorf("invalid quantity %q: %w", s, err)
	}
	if m[2] != "" {
		exp, err := strconv.Atoi(m[2])
		if err != nil {
			return 0, fmt.Errorf("invalid quantity %q: %w", s, err)
		}
		v *= math.Pow10(exp)
	}
	return int64(math.Round(v * quantitySuffix[m[3]] * scale)), nil
}
