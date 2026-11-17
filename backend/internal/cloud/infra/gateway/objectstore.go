package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

type objectStore struct {
	http  *http.Client
	base  *url.URL
	token string
}

// NewObjectStore の base は http://cloud-storage:8080、token は管理用のトークン
func NewObjectStore(base, token string) (gateway.ObjectStore, error) {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("STORAGE_URL is not a URL")
	}
	return &objectStore{http: &http.Client{Timeout: 30 * time.Second}, base: u, token: token}, nil
}

func (o *objectStore) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, o.base.String()+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+o.token)
	res, err := o.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return gateway.ErrObjectNotFound
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("storage GET %s: HTTP %d", path, res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(out)
}

func (o *objectStore) Buckets(ctx context.Context) ([]gateway.BucketUsage, error) {
	var out struct {
		Buckets []gateway.BucketUsage `json:"buckets"`
	}
	if err := o.get(ctx, "/b/", &out); err != nil {
		return nil, err
	}
	return out.Buckets, nil
}

func (o *objectStore) List(ctx context.Context, bucket, prefix string) ([]gateway.StoredObject, bool, error) {
	var out struct {
		Objects   []gateway.StoredObject `json:"objects"`
		Truncated bool                   `json:"truncated"`
	}
	if err := o.get(ctx, "/b/"+url.PathEscape(bucket)+"?prefix="+url.QueryEscape(prefix), &out); err != nil {
		return nil, false, err
	}
	return out.Objects, out.Truncated, nil
}

// objectURL はストレージの /b/<バケット>/<キー>。STORAGE_URL にパスがない（http://cloud-storage:8080）と JoinPath は先頭の / を付けないので、
// ReverseProxy がそのまま送ると「PUT b/...」という不正な要求になり、ストレージが 400 で切る。必ず / から始める
func (o *objectStore) objectURL(bucket, key string) *url.URL {
	u := o.base.JoinPath("b", bucket, key)
	if !strings.HasPrefix(u.Path, "/") {
		u.Path = "/" + u.Path
		if u.RawPath != "" {
			u.RawPath = "/" + u.RawPath
		}
	}
	return u
}

func (o *objectStore) Delete(ctx context.Context, bucket, key string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, o.objectURL(bucket, key).String(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+o.token)
	res, err := o.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusNoContent:
		return nil
	case http.StatusNotFound, http.StatusBadRequest:
		return gateway.ErrObjectNotFound
	}
	return fmt.Errorf("storage DELETE: HTTP %d", res.StatusCode)
}

func (o *objectStore) Proxy(w http.ResponseWriter, r *http.Request, bucket, key string) {
	target := o.objectURL(bucket, key)
	(&httputil.ReverseProxy{Rewrite: func(pr *httputil.ProxyRequest) {
		pr.Out.URL = target
		pr.Out.Host = target.Host
		// 利用者の Cookie（Access のセッション）はストレージに渡さない
		pr.Out.Header.Del("Cookie")
		pr.Out.Header.Set("Authorization", "Bearer "+o.token)
	}}).ServeHTTP(w, r)
}
