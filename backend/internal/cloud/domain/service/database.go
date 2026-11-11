package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"reflect"
	"slices"
	"strings"
)

// データベースの YAML で使う値
const (
	KindDatabase = "database"
	// LabelDatabase・LabelEngine はデータベースの ConfigMap に付ける名前とエンジン（コントローラーがこのラベルの ConfigMap を見て切り出す）
	LabelDatabase = "cloud.taramanji.com/database"
	LabelEngine   = "cloud.taramanji.com/engine"
	// AnnotationStatus はコントローラーが ConfigMap に書く状態（ready か、エラーの理由）
	AnnotationStatus = "cloud.taramanji.com/status"
	StatusReady      = "ready"

	EnginePostgres = "postgres"
	EngineRedis    = "redis"
)

var Engines = []string{EnginePostgres, EngineRedis}

// DatabaseObjectName はデータベースの ConfigMap と、接続先の Secret の名前
func DatabaseObjectName(name string) string { return "db-" + name }

// BucketSecretName はバケットの接続先の Secret の名前（ConfigMap と同じ）
func BucketSecretName(name string) string { return BucketObjectName(name) }

// RenderDatabaseYAML はデータベースを Kubernetes の YAML（ConfigMap 1 つ）にする
func RenderDatabaseYAML(name, engine string) (string, error) {
	var c k8sConfigMap
	c.APIVersion, c.Kind = "v1", "ConfigMap"
	c.Metadata = objectMeta{Name: DatabaseObjectName(name), Labels: map[string]string{LabelKind: KindDatabase, LabelDatabase: name, LabelEngine: engine}}
	return encodeDocs(c)
}

// ParseDatabaseYAML はデータベースの YAML が決まった形の ConfigMap 1 つであることを確かめ、エンジンを返す
func ParseDatabaseYAML(name, src string) (engine string, err error) {
	if !ValidName(name) {
		return "", fieldErr("name", "名前は英小文字で始め、英小文字・数字・ハイフンで 40 文字までにしてください")
	}
	docs, err := parseDocs(src)
	if err != nil {
		return "", err
	}
	for _, e := range Engines {
		want, _ := RenderDatabaseYAML(name, e)
		if wantDocs, _ := splitDocs(want); reflect.DeepEqual(docs, wantDocs) {
			return e, nil
		}
	}
	return "", fieldErr("yaml", "データベースの YAML は、ラベル %s: %s と %s: postgres か redis の付いた ConfigMap %s だけにしてください", LabelDatabase, name, LabelEngine, DatabaseObjectName(name))
}

// envToken は名前を環境変数に使える形にする（main-db → MAIN_DB）
func envToken(name string) string {
	return strings.ToUpper(strings.ReplaceAll(name, "-", "_"))
}

// DatabaseEnvPrefix・BucketEnvPrefix は、つないだ関数に入る環境変数の接頭辞（DB_MAIN_ / BUCKET_SITE_）
func DatabaseEnvPrefix(name string) string { return "DB_" + envToken(name) + "_" }
func BucketEnvPrefix(name string) string   { return "BUCKET_" + envToken(name) + "_" }

// 接続先の Secret のキー（関数には接頭辞を付けて入る: DB_MAIN_URL など）
var (
	PostgresKeys = []string{"URL", "HOST", "PORT", "USER", "PASSWORD", "NAME"}
	RedisKeys    = []string{"URL", "HOST", "PORT", "USER", "PASSWORD", "PREFIX"}
	BucketKeys   = []string{"URL", "TOKEN"}
)

// DatabaseEnvNames は、データベースをつないだ関数に入る環境変数の名前
func DatabaseEnvNames(name, engine string) []string {
	keys := PostgresKeys
	if engine == EngineRedis {
		keys = RedisKeys
	}
	out := make([]string, len(keys))
	for i, k := range keys {
		out[i] = DatabaseEnvPrefix(name) + k
	}
	return out
}

// DatabasePassword はデータベースのパスワード（マスターキーから導く。保存しない）。
// 同じ名前で作り直すと同じパスワードになるので、コントローラーは何度実行しても同じ結果になる
func DatabasePassword(masterKey []byte, engine, name string) string {
	m := hmac.New(sha256.New, masterKey)
	m.Write([]byte("database:" + engine + ":" + name))
	return hex.EncodeToString(m.Sum(nil))
}

// PostgresIdent はデータベース名・ロール名（ハイフンは使えないので _ にする。名前に _ は使えないので、ぶつからない）
func PostgresIdent(name string) string { return strings.ReplaceAll(name, "-", "_") }

// RedisPrefix は、この Redis のユーザーが触れるキーの接頭辞（main → main:）
func RedisPrefix(name string) string { return name + ":" }

// connections は名前の並びをそろえる（重複を除き、名前の順）
func connections(names []string) []string {
	out := []string{}
	for _, n := range names {
		if n = strings.TrimSpace(n); n != "" && !slices.Contains(out, n) {
			out = append(out, n)
		}
	}
	slices.Sort(out)
	return out
}
