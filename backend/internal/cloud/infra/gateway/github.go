package gateway

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

var repoRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_][A-Za-z0-9_.-]*$`)

// GitHubConfig はアプリ用のリポジトリ（アプリの YAML だけを置く。taramanji.com のリポジトリとは別）
type GitHubConfig struct {
	// API は https://api.github.com（テストでは差し替える）
	API string
	// Repo は owner/name
	Repo   string
	Branch string
	// Dir は環境ごとのディレクトリ（prod / stg / dev）
	Dir string
	// Token はこのリポジトリの Contents の読み書きだけを許した fine-grained PAT
	Token string
}

type github struct {
	http *http.Client
	c    GitHubConfig
}

// NewGitHubResourceStore は GitHub の Contents API で <Dir>/<種類>/<名前>.yaml を読み書きする
func NewGitHubResourceStore(c GitHubConfig) (gateway.ResourceRepo, error) {
	if !repoRe.MatchString(c.Repo) {
		return nil, fmt.Errorf("APPS_REPO must be owner/name")
	}
	if c.Token == "" || c.Branch == "" || c.Dir == "" {
		return nil, fmt.Errorf("apps repository needs a token, a branch and a directory")
	}
	if c.API == "" {
		c.API = "https://api.github.com"
	}
	return &github{http: httpx.New(15 * time.Second), c: c}, nil
}

const yamlExt = ".yaml"

func (g *github) dir(kind string) string {
	return url.PathEscape(g.c.Dir) + "/" + url.PathEscape(kind)
}

func (g *github) path(kind, name string) string {
	return "/repos/" + g.c.Repo + "/contents/" + g.dir(kind) + "/" + url.PathEscape(name+yamlExt)
}

func (g *github) URL(kind, name string) string {
	return "https://github.com/" + g.c.Repo + "/blob/" + url.PathEscape(g.c.Branch) + "/" + g.dir(kind) + "/" + url.PathEscape(name+yamlExt)
}

// do は status と本文を返す。本文は 2xx のとき out に入れる
func (g *github) do(ctx context.Context, method, path string, in, out any) (int, error) {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return 0, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, g.c.API+path, body)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+g.c.Token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := g.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		if out != nil {
			return res.StatusCode, json.Unmarshal(b, out)
		}
		return res.StatusCode, nil
	}
	if len(b) > 300 {
		b = b[:300]
	}
	return res.StatusCode, fmt.Errorf("github %s %s: HTTP %d: %s", method, path, res.StatusCode, b)
}

type contentEntry struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	SHA      string `json:"sha"`
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
}

var _ gateway.ResourceSource = (*github)(nil)

// Head はブランチの今のコミットの SHA
func (g *github) Head(ctx context.Context) (string, error) {
	var out struct {
		Commit struct {
			SHA string `json:"sha"`
		} `json:"commit"`
	}
	if _, err := g.do(ctx, http.MethodGet, "/repos/"+g.c.Repo+"/branches/"+url.PathEscape(g.c.Branch), nil, &out); err != nil {
		return "", err
	}
	return out.Commit.SHA, nil
}

func (g *github) List(ctx context.Context, kind string) ([]gateway.ResourceFile, error) {
	var entries []contentEntry
	status, err := g.do(ctx, http.MethodGet, "/repos/"+g.c.Repo+"/contents/"+g.dir(kind)+"?ref="+url.QueryEscape(g.c.Branch), nil, &entries)
	if status == http.StatusNotFound {
		// まだ 1 つもない（ディレクトリがない）
		return []gateway.ResourceFile{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []gateway.ResourceFile{}
	for _, e := range entries {
		name, ok := strings.CutSuffix(e.Name, yamlExt)
		if e.Type != "file" || !ok {
			continue
		}
		// 一覧には中身が入らないので、1 つずつ読む（多くても Pod の枠の 30 個ほど）
		f, err := g.Get(ctx, kind, name)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}

func (g *github) Get(ctx context.Context, kind, name string) (gateway.ResourceFile, error) {
	var e contentEntry
	status, err := g.do(ctx, http.MethodGet, g.path(kind, name)+"?ref="+url.QueryEscape(g.c.Branch), nil, &e)
	if status == http.StatusNotFound {
		return gateway.ResourceFile{}, gateway.ErrResourceNotFound
	}
	if err != nil {
		return gateway.ResourceFile{}, err
	}
	if e.Encoding != "base64" {
		return gateway.ResourceFile{}, fmt.Errorf("github: unexpected encoding %q for %s", e.Encoding, name)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(e.Content, "\n", ""))
	if err != nil {
		return gateway.ResourceFile{}, err
	}
	return gateway.ResourceFile{Name: name, YAML: string(raw), Revision: e.SHA}, nil
}

func (g *github) Put(ctx context.Context, kind, name, yaml, revision, message string) (string, error) {
	in := map[string]string{"message": message, "branch": g.c.Branch, "content": base64.StdEncoding.EncodeToString([]byte(yaml))}
	if revision != "" {
		in["sha"] = revision
	}
	var out struct {
		Content struct {
			SHA string `json:"sha"`
		} `json:"content"`
	}
	status, err := g.do(ctx, http.MethodPut, g.path(kind, name), in, &out)
	// 409: 版が古い。422: sha なしで既にあるファイルを作ろうとした
	if status == http.StatusConflict || status == http.StatusUnprocessableEntity {
		return "", gateway.ErrResourceConflict
	}
	if err != nil {
		return "", err
	}
	return out.Content.SHA, nil
}

func (g *github) Delete(ctx context.Context, kind, name, revision, message string) error {
	in := map[string]string{"message": message, "branch": g.c.Branch, "sha": revision}
	status, err := g.do(ctx, http.MethodDelete, g.path(kind, name), in, nil)
	switch status {
	case http.StatusNotFound:
		return gateway.ErrResourceNotFound
	case http.StatusConflict, http.StatusUnprocessableEntity:
		return gateway.ErrResourceConflict
	}
	return err
}
