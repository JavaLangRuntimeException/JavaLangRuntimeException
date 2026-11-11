package controller

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

type fakeCluster struct {
	configMaps []gateway.LabeledObject
	secrets    map[string]gateway.LabeledObject
	data       map[string]map[string]string
	annotated  int
}

func (f *fakeCluster) ConfigMaps(_ context.Context, key string) ([]gateway.LabeledObject, error) {
	out := []gateway.LabeledObject{}
	for _, cm := range f.configMaps {
		if _, ok := cm.Labels[key]; ok {
			out = append(out, cm)
		}
	}
	return out, nil
}

func (f *fakeCluster) AnnotateConfigMap(_ context.Context, name, key, value string) error {
	for i := range f.configMaps {
		if f.configMaps[i].Name == name {
			f.configMaps[i].Annotations = map[string]string{key: value}
			f.annotated++
		}
	}
	return nil
}

func (f *fakeCluster) Secrets(context.Context, string) ([]gateway.LabeledObject, error) {
	out := []gateway.LabeledObject{}
	for _, s := range f.secrets {
		out = append(out, s)
	}
	return out, nil
}

func (f *fakeCluster) PutSecret(_ context.Context, name string, labels, data map[string]string) error {
	f.secrets[name] = gateway.LabeledObject{Name: name, Labels: labels}
	f.data[name] = data
	return nil
}

func (f *fakeCluster) DeleteSecret(_ context.Context, name string) error {
	delete(f.secrets, name)
	delete(f.data, name)
	return nil
}

type fakeEngine struct {
	users    map[string]string
	disabled []string
	err      error
}

func (f *fakeEngine) Ensure(_ context.Context, name, password string) error {
	if f.err != nil {
		return f.err
	}
	f.users[name] = password
	return nil
}

func (f *fakeEngine) Disable(_ context.Context, name string) error {
	f.disabled = append(f.disabled, name)
	return nil
}

func cm(name string, labels map[string]string) gateway.LabeledObject {
	return gateway.LabeledObject{Name: name, Labels: labels}
}

func TestReconcile(t *testing.T) {
	cluster := &fakeCluster{secrets: map[string]gateway.LabeledObject{}, data: map[string]map[string]string{}, configMaps: []gateway.LabeledObject{
		cm("db-main", map[string]string{service.LabelDatabase: "main", service.LabelEngine: "postgres"}),
		cm("db-cache-1", map[string]string{service.LabelDatabase: "cache-1", service.LabelEngine: "redis"}),
		cm("db-old", map[string]string{service.LabelDatabase: "old", service.LabelEngine: "mysql"}),
		cm("wrong-name", map[string]string{service.LabelDatabase: "main", service.LabelEngine: "postgres"}),
		cm("bucket-site", map[string]string{service.LabelBucket: "site"}),
	}}
	pg, rd := &fakeEngine{users: map[string]string{}}, &fakeEngine{users: map[string]string{}}
	key := []byte("0123456789abcdef0123456789abcdef")
	ctl := New(Config{Cluster: cluster, MasterKey: key, Engines: map[string]gateway.DatabaseEngine{"postgres": pg, "redis": rd},
		Endpoints:  map[string]Endpoint{"postgres": {Host: "cloud-postgres.cloud.svc.cluster.local", Port: 5432}, "redis": {Host: "cloud-redis.cloud.svc.cluster.local", Port: 6379}},
		StorageURL: "http://cloud-storage.cloud.svc.cluster.local:8080"})
	ctx := context.Background()
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	main := cluster.data["db-main"]
	pw := service.DatabasePassword(key, "postgres", "main")
	if pg.users["main"] != pw || main["URL"] != "postgres://main:"+pw+"@cloud-postgres.cloud.svc.cluster.local:5432/main?sslmode=disable" || main["NAME"] != "main" {
		t.Fatalf("postgres: %v", main)
	}
	cache := cluster.data["db-cache-1"]
	if cache["PREFIX"] != "cache-1:" || !strings.HasPrefix(cache["URL"], "redis://cache-1:") || rd.users["cache-1"] == pw {
		t.Fatalf("redis: %v", cache)
	}
	if b := cluster.data["bucket-site"]; b["URL"] != "http://cloud-storage.cloud.svc.cluster.local:8080/b/site" || len(b["TOKEN"]) != 64 {
		t.Fatalf("bucket: %v", b)
	}
	// 使えないエンジンは Secret を作らず、理由を状態に書く。名前の合わない ConfigMap は見ない
	if _, ok := cluster.data["db-old"]; ok || len(cluster.secrets) != 3 {
		t.Fatalf("secrets: %v", cluster.secrets)
	}
	status := map[string]string{}
	for _, c := range cluster.configMaps {
		status[c.Name] = c.Annotations[service.AnnotationStatus]
	}
	if status["db-main"] != "ready" || !strings.Contains(status["db-old"], "mysql") || status["wrong-name"] != "" {
		t.Fatalf("status: %v", status)
	}
	// 2 回目は何も変わらない（状態も書き直さない）
	n := cluster.annotated
	if err := ctl.Reconcile(ctx); err != nil || cluster.annotated != n {
		t.Fatalf("2 回目: %v %d→%d", err, n, cluster.annotated)
	}

	// 定義が消えたら Secret を消し、ログインを止める（中身は消さない）
	cluster.configMaps = cluster.configMaps[1:2]
	if err := ctl.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if len(cluster.secrets) != 1 || len(pg.disabled) != 1 || pg.disabled[0] != "main" || len(rd.disabled) != 0 {
		t.Fatalf("消したあと: %v %v", cluster.secrets, pg.disabled)
	}
	// エンジンが落ちているあいだは、理由を状態に書く
	rd.err = errors.New("connection refused")
	_ = ctl.Reconcile(ctx)
	if s := cluster.configMaps[0].Annotations[service.AnnotationStatus]; !strings.Contains(s, "connection refused") {
		t.Fatalf("status: %s", s)
	}
}
