package gateway

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/url"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
)

var _ gateway.SecretSealer = (*Kube)(nil)

// Sealed Secrets のコントローラー（kube-system）。公開鍵は Kubernetes API の Service プロキシから読む
// （Sealed Secrets が system:authenticated に渡している権限。TLS と ServiceAccount のトークンで、途中で差し替えられない）
const sealedCertPath = "/api/v1/namespaces/kube-system/services/http:sealed-secrets-controller:/proxy/v1/cert.pem"

// Seal は値を、Sealed Secrets の公開鍵で暗号化する（kubeseal の strict スコープと同じ形。共有の namespace と名前に結びつく）
func (k *Kube) Seal(ctx context.Context, objectName string, value []byte) (string, error) {
	var pemBytes []byte
	if err := k.do(ctx, "GET", sealedCertPath, "", nil, &pemBytes); err != nil {
		return "", fmt.Errorf("Sealed Secrets の公開鍵を読めません: %w", err)
	}
	pub, err := parseSealingKey(pemBytes)
	if err != nil {
		return "", err
	}
	return SealValue(rand.Reader, pub, k.appsNamespace, objectName, value)
}

func parseSealingKey(pemBytes []byte) (*rsa.PublicKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, errors.New("Sealed Secrets の公開鍵が PEM の証明書ではありません")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("Sealed Secrets の証明書を読めません: %w", err)
	}
	pub, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("Sealed Secrets の公開鍵が RSA ではありません")
	}
	return pub, nil
}

// SealValue は Sealed Secrets の HybridEncrypt（strict スコープ）:
// 使い捨ての AES-256 鍵を RSA-OAEP（SHA-256、ラベル = "<namespace>/<名前>"）で包み、
// 「包んだ鍵の長さ（2 バイト）・包んだ鍵・AES-GCM（nonce は 0。鍵が使い捨てなので使い回しにならない）の暗号文」を base64 にする
func SealValue(rnd io.Reader, pub *rsa.PublicKey, namespace, name string, value []byte) (string, error) {
	sessionKey := make([]byte, 32)
	if _, err := io.ReadFull(rnd, sessionKey); err != nil {
		return "", err
	}
	block, err := aes.NewCipher(sessionKey)
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	wrapped, err := rsa.EncryptOAEP(sha256.New(), rnd, pub, sessionKey, []byte(namespace+"/"+name))
	if err != nil {
		return "", err
	}
	out := binary.BigEndian.AppendUint16(nil, uint16(len(wrapped)))
	out = append(out, wrapped...)
	out = aead.Seal(out, make([]byte, aead.NonceSize()), value, nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

// Sealed は共有の namespace の SealedSecret（シークレットのラベルが付いたもの）の状態
func (k *Kube) Sealed(ctx context.Context) (map[string]gateway.SealedState, error) {
	var list struct {
		Items []struct {
			Metadata struct {
				Name       string `json:"name"`
				Generation int64  `json:"generation"`
			} `json:"metadata"`
			Status struct {
				ObservedGeneration int64 `json:"observedGeneration"`
				Conditions         []struct {
					Type    string `json:"type"`
					Status  string `json:"status"`
					Message string `json:"message"`
				} `json:"conditions"`
			} `json:"status"`
		} `json:"items"`
	}
	path := "/apis/bitnami.com/v1alpha1/namespaces/" + url.PathEscape(k.appsNamespace) + "/sealedsecrets?labelSelector=" + url.QueryEscape(service.LabelSecret)
	if err := k.get(ctx, path, &list); err != nil {
		return nil, err
	}
	out := map[string]gateway.SealedState{}
	for _, it := range list.Items {
		st := gateway.SealedState{}
		// 新しい版をまだ見ていなければ、待っている（Synced = false・理由なし）
		if it.Status.ObservedGeneration >= it.Metadata.Generation {
			for _, c := range it.Status.Conditions {
				if c.Type == "Synced" {
					st.Synced, st.Message = c.Status == "True", c.Message
				}
			}
		}
		out[it.Metadata.Name] = st
	}
	return out, nil
}

// SharedSecrets は共有の namespace の、ラベル labelKey が付いた Secret（中身を base64 から戻して）
func (k *Kube) SharedSecrets(ctx context.Context, labelKey string) ([]gateway.LabeledObject, error) {
	objs, err := k.list(ctx, k.nsPath("", "secrets"), labelKey)
	if err != nil {
		return nil, err
	}
	for i, o := range objs {
		data := make(map[string]string, len(o.Data))
		for key, v := range o.Data {
			b, err := base64.StdEncoding.DecodeString(v)
			if err != nil {
				return nil, fmt.Errorf("secret %s: %s を読めません", o.Name, key)
			}
			data[key] = string(b)
		}
		objs[i].Data = data
	}
	return objs, nil
}

// SetPodAnnotation は Deployment の Pod テンプレートの注釈を、違うときだけ書く（台数・ほかの項目には触れない）
func (k *Kube) SetPodAnnotation(ctx context.Context, ns, name, key, value string) error {
	path := "/apis/apps/v1/namespaces/" + url.PathEscape(ns) + "/deployments/" + url.PathEscape(name)
	var d struct {
		Spec struct {
			Template struct {
				Metadata struct {
					Annotations map[string]string `json:"annotations"`
				} `json:"metadata"`
			} `json:"template"`
		} `json:"spec"`
	}
	if err := k.get(ctx, path, &d); err != nil {
		if isNotFound(err) {
			return nil
		}
		return err
	}
	if d.Spec.Template.Metadata.Annotations[key] == value {
		return nil
	}
	body := map[string]any{"spec": map[string]any{"template": map[string]any{"metadata": map[string]any{"annotations": map[string]string{key: value}}}}}
	return k.patch(ctx, path+"?fieldManager=cloud-ctl", body, nil)
}
