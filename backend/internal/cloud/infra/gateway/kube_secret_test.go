package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

func TestPutSecretType(t *testing.T) {
	var got map[string]any
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)
	token := filepath.Join(t.TempDir(), "token")
	_ = os.WriteFile(token, []byte("tok"), 0o600)
	k := &Kube{http: srv.Client(), base: srv.URL, namespace: "taramanji-cloud", appsNamespace: "taramanji-cloud-apps", tokenPath: token}

	// イメージを読むための Secret は kubelet が読める型にする
	if err := k.PutSecret(context.Background(), "taramanji-cloud-fn-blog", "cloud-registry", nil, map[string]string{gateway.DockerConfigKey: `{"auths":{}}`}); err != nil {
		t.Fatal(err)
	}
	if got["type"] != "kubernetes.io/dockerconfigjson" {
		t.Fatalf("type %v", got["type"])
	}
	// ほかは Opaque のまま
	if err := k.PutSecret(context.Background(), "taramanji-cloud-fn-blog", "db-main", nil, map[string]string{"URL": "x"}); err != nil {
		t.Fatal(err)
	}
	if got["type"] != "Opaque" {
		t.Fatalf("type %v", got["type"])
	}
}
