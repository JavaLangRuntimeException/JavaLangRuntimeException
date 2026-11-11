// Package controller は taramanji cloud のコントローラー（cloud-ctl）。
// アプリ用 namespace の ConfigMap（データベース・バケットの定義。Argo CD がリポジトリから入れる）を見て、
//   - 共有の PostgreSQL / Redis から、データベースとユーザーを切り出す
//   - 接続先（URL・パスワード・トークン）の Secret をアプリ用 namespace に作る。関数はそれを環境変数として読む
//
// パスワードとトークンはマスターキーから導くので、どこにも保存しない（git にも、コンソールにも出ない）。
// 定義が消えたら、Secret を消してログインを止める。データベースの中身は消さない
package controller

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/storage"
)

// Secret に付けるラベル（自分が作ったものだけを消す）
const (
	labelManaged = "cloud.taramanji.com/managed-by"
	managedValue = "cloud-ctl"
)

// Endpoint は関数から見た接続先（Service の DNS 名とポート）
type Endpoint struct {
	Host string
	Port int
}

type Config struct {
	Cluster   gateway.ResourceCluster
	MasterKey []byte
	// Engines はエンジン名（postgres / redis）→ 切り出し方と接続先。ないエンジンのデータベースは「使えない」と状態に書く
	Engines   map[string]gateway.DatabaseEngine
	Endpoints map[string]Endpoint
	// StorageURL は関数から見たオブジェクトストレージ（http://cloud-storage.<namespace>.svc.cluster.local:8080）
	StorageURL string
	Log        *slog.Logger
}

type Controller struct{ c Config }

func New(c Config) *Controller {
	if c.Log == nil {
		c.Log = slog.Default()
	}
	return &Controller{c: c}
}

// Run は ctx が終わるまで、定義と実際をそろえ続ける
func (c *Controller) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if err := c.Reconcile(ctx); err != nil {
			c.c.Log.Warn("reconcile failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func secretLabels(kind, name, engine string) map[string]string {
	l := map[string]string{labelManaged: managedValue, service.LabelKind: kind}
	if kind == service.KindDatabase {
		l[service.LabelDatabase], l[service.LabelEngine] = name, engine
	} else {
		l[service.LabelBucket] = name
	}
	return l
}

// DatabaseSecret はデータベースの接続先の Secret の中身
func DatabaseSecret(engine, name, password string, ep Endpoint) map[string]string {
	port := strconv.Itoa(ep.Port)
	hostPort := ep.Host + ":" + port
	if engine == service.EngineRedis {
		// Redis はユーザーごとに、接頭辞（<名前>:）で始まるキーだけを触れる
		return map[string]string{"HOST": ep.Host, "PORT": port, "USER": name, "PASSWORD": password, "PREFIX": service.RedisPrefix(name),
			"URL": (&url.URL{Scheme: "redis", User: url.UserPassword(name, password), Host: hostPort}).String()}
	}
	ident := service.PostgresIdent(name)
	return map[string]string{"HOST": ep.Host, "PORT": port, "USER": ident, "PASSWORD": password, "NAME": ident,
		"URL": (&url.URL{Scheme: "postgres", User: url.UserPassword(ident, password), Host: hostPort, Path: "/" + ident, RawQuery: "sslmode=disable"}).String()}
}

// Reconcile は 1 回そろえる。1 つのリソースの失敗で、ほかを止めない
func (c *Controller) Reconcile(ctx context.Context) error {
	dbs, err := c.c.Cluster.ConfigMaps(ctx, service.LabelDatabase)
	if err != nil {
		return err
	}
	buckets, err := c.c.Cluster.ConfigMaps(ctx, service.LabelBucket)
	if err != nil {
		return err
	}
	want := map[string]bool{}
	for _, cm := range dbs {
		name, engine := cm.Labels[service.LabelDatabase], cm.Labels[service.LabelEngine]
		if !service.ValidName(name) || cm.Name != service.DatabaseObjectName(name) {
			continue
		}
		want[cm.Name] = true
		status := service.StatusReady
		if err := c.ensureDatabase(ctx, name, engine); err != nil {
			c.c.Log.Warn("database failed", "database", name, "engine", engine, "error", err)
			status = err.Error()
		}
		// 変わったときだけ書く（毎回書くと、ConfigMap の版が増え続ける）
		if cm.Annotations[service.AnnotationStatus] != status {
			if err := c.c.Cluster.AnnotateConfigMap(ctx, cm.Name, service.AnnotationStatus, status); err != nil {
				c.c.Log.Warn("status failed", "database", name, "error", err)
			}
		}
	}
	for _, cm := range buckets {
		name := cm.Labels[service.LabelBucket]
		if !service.ValidName(name) || cm.Name != service.BucketObjectName(name) {
			continue
		}
		want[cm.Name] = true
		data := map[string]string{"URL": c.c.StorageURL + "/b/" + name, "TOKEN": storage.Token(c.c.MasterKey, name)}
		if err := c.c.Cluster.PutSecret(ctx, service.BucketSecretName(name), secretLabels(service.KindBucket, name, ""), data); err != nil {
			c.c.Log.Warn("bucket secret failed", "bucket", name, "error", err)
		}
	}

	// 定義が消えたもの: Secret を消し、データベースはログインを止める
	secrets, err := c.c.Cluster.Secrets(ctx, labelManaged+"="+managedValue)
	if err != nil {
		return err
	}
	for _, s := range secrets {
		if want[s.Name] {
			continue
		}
		if s.Labels[service.LabelKind] == service.KindDatabase {
			if eng, ok := c.c.Engines[s.Labels[service.LabelEngine]]; ok {
				if err := eng.Disable(ctx, s.Labels[service.LabelDatabase]); err != nil {
					// 止められなかったら Secret を残し、次の回にやり直す
					c.c.Log.Warn("disable failed", "database", s.Labels[service.LabelDatabase], "error", err)
					continue
				}
			}
		}
		if err := c.c.Cluster.DeleteSecret(ctx, s.Name); err != nil {
			c.c.Log.Warn("delete secret failed", "secret", s.Name, "error", err)
		}
	}
	return nil
}

func (c *Controller) ensureDatabase(ctx context.Context, name, engine string) error {
	eng, ok := c.c.Engines[engine]
	if !ok {
		return fmt.Errorf("この環境では %s を使えません", engine)
	}
	password := service.DatabasePassword(c.c.MasterKey, engine, name)
	if err := eng.Ensure(ctx, name, password); err != nil {
		return fmt.Errorf("%s に作れませんでした: %w", engine, err)
	}
	if err := c.c.Cluster.PutSecret(ctx, service.DatabaseObjectName(name), secretLabels(service.KindDatabase, name, engine),
		DatabaseSecret(engine, name, password, c.c.Endpoints[engine])); err != nil {
		return fmt.Errorf("接続先の Secret を作れませんでした: %w", err)
	}
	return nil
}
