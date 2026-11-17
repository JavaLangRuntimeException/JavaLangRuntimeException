package gateway

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// unseal は Sealed Secrets の HybridDecrypt（コントローラーがすること）
func unseal(t *testing.T, priv *rsa.PrivateKey, label, sealed string) ([]byte, error) {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		return nil, err
	}
	n := int(binary.BigEndian.Uint16(b))
	key, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, priv, b[2:2+n], []byte(label))
	if err != nil {
		return nil, err
	}
	block, _ := aes.NewCipher(key)
	aead, _ := cipher.NewGCM(block)
	return aead.Open(nil, make([]byte, aead.NonceSize()), b[2+n:], nil)
}

func handlerKube(t *testing.T, h http.HandlerFunc) *Kube {
	t.Helper()
	srv := httptest.NewTLSServer(h)
	t.Cleanup(srv.Close)
	token := filepath.Join(t.TempDir(), "token")
	_ = os.WriteFile(token, []byte("tok"), 0o600)
	return &Kube{http: srv.Client(), base: srv.URL, namespace: "taramanji-cloud", appsNamespace: "taramanji-cloud-apps", tokenPath: token}
}

func TestSeal(t *testing.T) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "sealed-secret"}, NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		t.Fatal(err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	var path string
	k := handlerKube(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write(certPEM)
	})

	sealed, err := k.Seal(context.Background(), "secret-anthropic", []byte("sk-test-値"))
	if err != nil {
		t.Fatal(err)
	}
	if path != "/api/v1/namespaces/kube-system/services/http:sealed-secrets-controller:/proxy/v1/cert.pem" {
		t.Fatalf("公開鍵の読み先 %s", path)
	}
	got, err := unseal(t, priv, "taramanji-cloud-apps/secret-anthropic", sealed)
	if err != nil || string(got) != "sk-test-値" {
		t.Fatalf("復号: %q %v", got, err)
	}
	// 別の名前・namespace では復号できない（strict スコープ）
	if _, err := unseal(t, priv, "taramanji-cloud-apps/secret-other", sealed); err == nil {
		t.Error("別の名前で復号できてはいけない")
	}
	// 同じ値でも毎回違う暗号文（使い捨ての鍵）
	again, _ := SealValue(rand.Reader, &priv.PublicKey, "taramanji-cloud-apps", "secret-anthropic", []byte("sk-test-値"))
	if again == sealed {
		t.Error("毎回違う暗号文になる")
	}

	bad := handlerKube(t, func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "not a pem") })
	if _, err := bad.Seal(context.Background(), "secret-x", []byte("v")); err == nil {
		t.Error("PEM でなければ失敗する")
	}
}

func TestSealedStatus(t *testing.T) {
	k := handlerKube(t, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/apis/bitnami.com/v1alpha1/namespaces/taramanji-cloud-apps/sealedsecrets") ||
			r.URL.Query().Get("labelSelector") != "cloud.taramanji.com/secret" {
			http.NotFound(w, r)
			return
		}
		_, _ = io.WriteString(w, `{"items":[
			{"metadata":{"name":"secret-ok","generation":2},"status":{"observedGeneration":2,"conditions":[{"type":"Synced","status":"True"}]}},
			{"metadata":{"name":"secret-bad","generation":1},"status":{"observedGeneration":1,"conditions":[{"type":"Synced","status":"False","message":"no key could decrypt secret (value)"}]}},
			{"metadata":{"name":"secret-new","generation":3},"status":{"observedGeneration":2,"conditions":[{"type":"Synced","status":"True"}]}}
		]}`)
	})
	got, err := k.Sealed(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !got["secret-ok"].Synced || got["secret-bad"].Synced || got["secret-bad"].Message == "" || got["secret-new"].Synced || got["secret-new"].Message != "" {
		t.Fatalf("%+v", got)
	}
}

func TestSharedSecretsAndPodAnnotation(t *testing.T) {
	var patched map[string]any
	var patchQuery string
	k := handlerKube(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/namespaces/taramanji-cloud-apps/secrets":
			_, _ = io.WriteString(w, `{"items":[{"metadata":{"name":"secret-a","labels":{"cloud.taramanji.com/secret":"a"}},"data":{"value":"`+
				base64.StdEncoding.EncodeToString([]byte("v1"))+`"}}]}`)
		case r.URL.Path == "/apis/apps/v1/namespaces/taramanji-cloud-fn-blog/deployments/blog" && r.Method == http.MethodGet:
			_, _ = io.WriteString(w, `{"spec":{"template":{"metadata":{"annotations":{"k":"old"}}}}}`)
		case r.URL.Path == "/apis/apps/v1/namespaces/taramanji-cloud-fn-blog/deployments/blog" && r.Method == http.MethodPatch:
			patchQuery = r.URL.RawQuery
			_ = json.NewDecoder(r.Body).Decode(&patched)
			_, _ = io.WriteString(w, `{}`)
		default:
			http.NotFound(w, r)
		}
	})
	ctx := context.Background()
	objs, err := k.SharedSecrets(ctx, "cloud.taramanji.com/secret")
	if err != nil || len(objs) != 1 || objs[0].Data["value"] != "v1" {
		t.Fatalf("%+v %v", objs, err)
	}

	// 同じ値なら書かない
	if err := k.SetPodAnnotation(ctx, "taramanji-cloud-fn-blog", "blog", "k", "old"); err != nil || patched != nil {
		t.Fatalf("同じ値: %v %v", patched, err)
	}
	if err := k.SetPodAnnotation(ctx, "taramanji-cloud-fn-blog", "blog", "k", "new"); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(patched)
	if string(b) != `{"spec":{"template":{"metadata":{"annotations":{"k":"new"}}}}}` || patchQuery != "fieldManager=cloud-ctl" {
		t.Fatalf("patch %s ?%s", b, patchQuery)
	}
	// Deployment がまだなければ何もしない
	if err := k.SetPodAnnotation(ctx, "taramanji-cloud-fn-none", "none", "k", "v"); err != nil {
		t.Fatal(err)
	}
}
