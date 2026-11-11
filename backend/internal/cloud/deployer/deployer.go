// Package deployer は taramanji cloud のデプロイヤー（cloud-ctl の中で動く）。
// アプリ用のリポジトリ（taramanji-cloud-apps）の <環境>/<種類>/<名前>.yaml を読み、Kubernetes に入れる（Argo CD は使わない）。
//
//   - 入れる前に、コンソールと同じ決まり（種類・namespace・名前・登録とのずれ）で確かめる。合わないものは入れない（前の版のまま）
//   - 入れ方は server-side apply。関数の台数（API Gateway が動かす）には触れない
//   - リポジトリから消えたものは、クラスターからも消す（自分が入れた、この環境のものだけ）
//   - デプロイの様子（反映した版・時刻・結果・履歴）を、共有の namespace の ConfigMap に書く。コンソールはそれを読む
package deployer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sort"
	"strings"
	"time"

	"go.yaml.in/yaml/v3"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/argoview"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

// 変わっていなくても、この間隔で入れ直す（手で消された・書き換えられたものを戻す）。履歴に残す件数
const (
	resyncEvery  = 5 * time.Minute
	historyLimit = 10
)

// Kinds はリポジトリのディレクトリ（入れる順）
var Kinds = []string{gateway.KindDatabases, gateway.KindBuckets, gateway.KindFunctions, gateway.KindAPIs, gateway.KindCDN}

type (
	Status = service.DeployStatus
	Event  = service.DeployEvent
)

const (
	StatusConfigMap = service.DeployStatusConfigMap
	LabelStatus     = service.LabelDeployStatus
	StateApplied    = service.DeployApplied
	StateWaiting    = service.DeployWaiting
	StateInvalid    = service.DeployInvalid
	StateFailed     = service.DeployFailed
)

// Key は ConfigMap の data のキー
func Key(kind, name string) string { return service.DeployKey(kind, name) }

type Config struct {
	Source  gateway.ResourceSource
	Applier gateway.Applier
	// Env は環境（prod / stg / dev）、Registry は環境の共有の namespace（taramanji-cloud-apps など）
	Env      string
	Registry string
	Target   service.APITarget
	// Reconcile はコントローラーの 1 回分（関数の namespace・囲い・接続先を作る）。登録を入れたあと、関数を入れる前に呼ぶ
	Reconcile func(ctx context.Context) error
	Clock     func() time.Time
	Log       *slog.Logger
}

type Deployer struct {
	c        Config
	lastHead string
	lastFull time.Time
	pending  bool
	statuses map[string]Status
	// applied は「種類.名前」→ 最後に入れたオブジェクトの識別子（読めない YAML になっても、前に入れたものを消さないため）
	applied map[string][]string
}

func New(c Config) *Deployer {
	if c.Clock == nil {
		c.Clock = time.Now
	}
	if c.Log == nil {
		c.Log = slog.Default()
	}
	return &Deployer{c: c, statuses: map[string]Status{}, applied: map[string][]string{}}
}

// Run は ctx が終わるまで、リポジトリとクラスターをそろえ続ける
func (d *Deployer) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		if err := d.Sync(ctx); err != nil {
			d.c.Log.Warn("deploy failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// LoadStatuses は前の様子（再起動の前に書いたもの）を読み戻す。履歴を続けるため
func (d *Deployer) LoadStatuses(data map[string]string) {
	for k, v := range data {
		var s Status
		if json.Unmarshal([]byte(v), &s) == nil {
			d.statuses[k] = s
		}
	}
}

// object は入れる 1 オブジェクト
type object struct {
	source string
	ns     string
	body   map[string]any
}

// Sync は 1 回そろえる
func (d *Deployer) Sync(ctx context.Context) error {
	head, err := d.c.Source.Head(ctx)
	if err != nil {
		return err
	}
	now := d.c.Clock()
	// リポジトリが変わっておらず、待っているもの（namespace の作成など）もなければ、コントローラーだけ回す
	if head == d.lastHead && !d.pending && now.Sub(d.lastFull) < resyncEvery {
		return d.c.Reconcile(ctx)
	}

	var registry, namespaced []object
	desired := map[string]bool{}
	results := map[string]Status{}
	for _, kind := range Kinds {
		files, err := d.c.Source.List(ctx, kind)
		if err != nil {
			return err
		}
		for _, f := range files {
			key := Key(kind, f.Name)
			st := Status{Kind: kind, Name: f.Name, Revision: short(f.Revision), Commit: short(head), At: now}
			objs, err := d.objects(kind, f)
			if err != nil {
				st.State, st.Message = StateInvalid, err.Error()
				// 読めない YAML は入れない。前に入れたものは消さずに残す
				if prev, ok := d.statuses[key]; ok && prev.State == StateApplied {
					st.Message += "（前の版 " + prev.Revision + " のまま動いています）"
				}
				for _, o := range d.previous(key) {
					desired[o] = true
				}
				results[key] = st
				continue
			}
			for _, o := range objs {
				desired[ident(o)] = true
				if o.ns == d.c.Registry {
					registry = append(registry, o)
				} else {
					namespaced = append(namespaced, o)
				}
			}
			st.State = StateApplied
			results[key] = st
		}
	}

	// 1. 共有の namespace（関数の登録・API・CDN・バケット・データベースの定義）
	for _, o := range registry {
		d.apply(ctx, o, results)
	}
	// 2. コントローラー: 登録を見て、関数の namespace と囲い・接続先を作る
	if err := d.c.Reconcile(ctx); err != nil {
		d.c.Log.Warn("reconcile failed", "error", err)
	}
	// 3. 関数の namespace の中（Deployment・Service など）
	d.pending = false
	for _, o := range namespaced {
		ok, err := d.c.Applier.NamespaceExists(ctx, o.ns)
		if err == nil && !ok {
			st := results[o.source]
			if st.State == StateApplied {
				st.State, st.Message = StateWaiting, "関数の namespace を作っています（数十秒で入ります）"
				results[o.source] = st
			}
			d.pending = true
			continue
		}
		d.apply(ctx, o, results)
	}

	// 4. リポジトリから消えたもの
	managed, err := d.c.Applier.Managed(ctx, d.c.Env)
	if err != nil {
		return err
	}
	for _, m := range managed {
		if desired[m.Kind+"/"+m.Namespace+"/"+m.Name] {
			continue
		}
		if err := d.c.Applier.Delete(ctx, m); err != nil {
			d.c.Log.Warn("delete failed", "kind", m.Kind, "namespace", m.Namespace, "name", m.Name, "error", err)
			continue
		}
		d.c.Log.Info("deleted", "kind", m.Kind, "namespace", m.Namespace, "name", m.Name)
	}

	if err := d.writeStatuses(ctx, results); err != nil {
		return err
	}
	d.lastHead, d.lastFull = head, now
	return nil
}

func (d *Deployer) apply(ctx context.Context, o object, results map[string]Status) {
	if err := d.c.Applier.Apply(ctx, o.body); err != nil {
		st := results[o.source]
		st.State = StateFailed
		kind, _ := o.body["kind"].(string)
		st.Message = fmt.Sprintf("%s を入れられませんでした: %v", kind, err)
		results[o.source] = st
		d.pending = true
	}
}

func ident(o object) string {
	kind, _ := o.body["kind"].(string)
	meta, _ := o.body["metadata"].(map[string]any)
	name, _ := meta["name"].(string)
	return kind + "/" + o.ns + "/" + name
}

// previous は前に入れたものの識別子（読めない YAML の分は消さないため）
func (d *Deployer) previous(key string) []string {
	return d.applied[key]
}

// objects は YAML を確かめて、入れるオブジェクトにする（namespace とラベルを付ける）
func (d *Deployer) objects(kind string, f gateway.ResourceFile) ([]object, error) {
	ns := service.FunctionNamespace(d.c.Env, f.Name)
	var err error
	switch kind {
	case gateway.KindFunctions:
		_, err = service.ParseFunctionYAML(f.Name, f.YAML, ns)
	case gateway.KindAPIs:
		_, err = service.ParseAPIYAML(f.Name, f.YAML, d.c.Target)
	case gateway.KindCDN:
		_, err = service.ParseDistributionYAML(f.Name, f.YAML, d.c.Target)
	case gateway.KindBuckets:
		err = service.ParseBucketYAML(f.Name, f.YAML)
	case gateway.KindDatabases:
		_, err = service.ParseDatabaseYAML(f.Name, f.YAML)
	default:
		err = fmt.Errorf("知らない種類 %q", kind)
	}
	if err != nil {
		return nil, err
	}
	docs, err := decode(f.YAML)
	if err != nil {
		return nil, err
	}
	source := Key(kind, f.Name)
	out := make([]object, 0, len(docs))
	for _, doc := range docs {
		meta, _ := doc["metadata"].(map[string]any)
		if meta == nil {
			meta = map[string]any{}
			doc["metadata"] = meta
		}
		target, _ := meta["namespace"].(string)
		if target == "" {
			target = d.c.Registry
		}
		meta["namespace"] = target
		labels, _ := meta["labels"].(map[string]any)
		if labels == nil {
			labels = map[string]any{}
		}
		labels["cloud.taramanji.com/deployed-by"] = "cloud-deployer"
		labels["cloud.taramanji.com/deploy-env"] = d.c.Env
		labels["cloud.taramanji.com/source"] = source
		meta["labels"] = labels
		// 関数は Argo CD の画面で Pod を見られるように、関数ごとの Application（見るだけ）の印を付ける
		if kind == gateway.KindFunctions {
			annotations, _ := meta["annotations"].(map[string]any)
			if annotations == nil {
				annotations = map[string]any{}
			}
			apiVersion, _ := doc["apiVersion"].(string)
			objKind, _ := doc["kind"].(string)
			name, _ := meta["name"].(string)
			annotations[argoview.TrackingAnnotation] = argoview.TrackingID(argoview.AppName(ns), apiVersion, objKind, target, name)
			meta["annotations"] = annotations
		}
		out = append(out, object{source: source, ns: target, body: doc})
	}
	ids := make([]string, 0, len(out))
	for _, o := range out {
		ids = append(ids, ident(o))
	}
	d.applied[source] = ids
	return out, nil
}

// decode は YAML の各ドキュメントを、JSON にできる形（キーが文字列の map）にする
func decode(src string) ([]map[string]any, error) {
	dec := yaml.NewDecoder(strings.NewReader(src))
	var out []map[string]any
	for {
		var doc map[string]any
		err := dec.Decode(&doc)
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		if doc != nil {
			out = append(out, doc)
		}
	}
}

// writeStatuses は様子を ConfigMap に書く。版か状態が変わったものだけ履歴に足す
func (d *Deployer) writeStatuses(ctx context.Context, results map[string]Status) error {
	next := map[string]Status{}
	for key, st := range results {
		prev, ok := d.statuses[key]
		st.History = prev.History
		if !ok || prev.Revision != st.Revision || prev.State != st.State || prev.Message != st.Message {
			st.History = append([]Event{{At: st.At, Commit: st.Commit, Revision: st.Revision, State: st.State, Message: st.Message}}, st.History...)
			if len(st.History) > historyLimit {
				st.History = st.History[:historyLimit]
			}
		} else {
			// 変わっていなければ、最後に反映した時刻と版はそのまま
			st.At, st.Commit = prev.At, prev.Commit
		}
		next[key] = st
	}
	// リポジトリから消えたものは「消した」を 1 回だけ残す
	for key, prev := range d.statuses {
		if _, ok := next[key]; ok || prev.State == service.DeployDeleted {
			continue
		}
		prev.State, prev.Message, prev.At = service.DeployDeleted, "リポジトリから消えたので、クラスターからも消しました", d.c.Clock()
		prev.History = append([]Event{{At: prev.At, Commit: short(d.lastHead), State: prev.State, Message: prev.Message}}, prev.History...)
		if len(prev.History) > historyLimit {
			prev.History = prev.History[:historyLimit]
		}
		next[key] = prev
	}
	data := map[string]string{}
	keys := make([]string, 0, len(next))
	for k := range next {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		b, err := json.Marshal(next[k])
		if err != nil {
			return err
		}
		data[k] = string(b)
	}
	if err := d.c.Applier.PutConfigMap(ctx, StatusConfigMap, map[string]string{LabelStatus: "true"}, data); err != nil {
		return err
	}
	d.statuses = next
	return nil
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}
