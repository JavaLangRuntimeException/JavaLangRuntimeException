// Package argoview は、Argo CD の画面で関数の Pod を見るためのもの（見るだけ。Argo CD は関数を入れない）。
//
//   - Handler: ApplicationSet の plugin ジェネレーターに、今ある関数の名前を返す。
//     ApplicationSet（deploy/gitops/apps/taramanji-cloud-functions.yaml）が関数ごとに 1 つ Application を作る
//   - TrackingID: デプロイヤーが入れるオブジェクトに付ける印。Argo CD はこの印で、そのオブジェクトをどのアプリのものか判断する
//     （印がないと、同じものが入っていても「同期していない」と出る）
package argoview

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

// TrackingAnnotation は Argo CD のリソースの印（annotation 方式）
const TrackingAnnotation = "argocd.argoproj.io/tracking-id"

// AppName は関数を見る Application の名前（関数の namespace と同じ）
func AppName(functionNamespace string) string { return functionNamespace }

// TrackingID は <アプリ>:<グループ>/<種類>:<namespace>/<名前>
func TrackingID(app, apiVersion, kind, namespace, name string) string {
	group := ""
	if i := strings.Index(apiVersion, "/"); i >= 0 {
		group = apiVersion[:i]
	}
	return app + ":" + group + "/" + kind + ":" + namespace + "/" + name
}

// Path は plugin ジェネレーターが呼ぶパス
const Path = "/api/v1/getparams.execute"

// Handler は {"output":{"parameters":[{"name":"<関数>"}, ...]}} を返す。token は Authorization: Bearer で確かめる
func Handler(token string, functions func(ctx context.Context) ([]string, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		names, err := functions(r.Context())
		if err != nil {
			http.Error(w, "cannot list functions", http.StatusServiceUnavailable)
			return
		}
		sort.Strings(names)
		params := make([]map[string]string, 0, len(names))
		for _, n := range names {
			params = append(params, map[string]string{"name": n})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"output": map[string]any{"parameters": params}})
	})
}
