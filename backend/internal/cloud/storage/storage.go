// Package storage は taramanji cloud のオブジェクトストレージ（S3 にあたるもの）のサーバー。
// バケットは PVC の上のディレクトリ、オブジェクトはその下のファイル。cloud のイメージを CLOUD_MODE=storage で動かす。
//
// ポートを 2 つ開ける:
//   - 読み書き（8080）: Bearer のトークンが要る。コンソールの API（cloud-api）と、バケットをつないだ関数が使う
//   - 読むだけ（8081）: トークンなし。CDN（cloud-gw）だけが届く（NetworkPolicy で絞る）
//
// バケットを作る・消すのは、アプリ用 namespace の ConfigMap（ラベル cloud.taramanji.com/kind=bucket）に合わせる
// （Reconcile）。中身が残っているバケットは、ConfigMap が消えても消さない
package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var bucketRe = regexp.MustCompile(`^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$`)

const (
	maxKeyLen = 1024
	// 書きかけのファイルを置く場所（バケットの一覧・オブジェクトの一覧には出さない）
	tmpDir     = ".tmp"
	objectsDir = "objects"
	// 一覧で返す上限
	MaxList = 1000
)

// Token はバケットのトークン（マスターキーから導く。保存しない）。bucket が "*" なら全バケットを扱える管理用
func Token(masterKey []byte, bucket string) string {
	m := hmac.New(sha256.New, masterKey)
	m.Write([]byte("bucket:" + bucket))
	return hex.EncodeToString(m.Sum(nil))
}

// ValidKey はオブジェクトのキーとして使えるか（/ 区切りのパス。空の区切り・. ・.. は使えない）
func ValidKey(key string) bool {
	if key == "" || len(key) > maxKeyLen || strings.HasPrefix(key, "/") || strings.HasSuffix(key, "/") || strings.ContainsAny(key, "\x00\\") {
		return false
	}
	for _, seg := range strings.Split(key, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return false
		}
	}
	return true
}

type Store struct {
	dir       string
	masterKey []byte
	// MaxObjectBytes は 1 つのオブジェクトの上限
	MaxObjectBytes int64
}

func New(dir string, masterKey []byte) (*Store, error) {
	if len(masterKey) < 16 {
		return nil, errors.New("storage master key must be at least 16 bytes")
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	return &Store{dir: dir, masterKey: masterKey, MaxObjectBytes: 1 << 30}, nil
}

// root はバケットのオブジェクトを置くディレクトリ。os.Root の外には出られない（シンボリックリンクや .. でも）
func (s *Store) root(bucket string) (*os.Root, error) {
	if !bucketRe.MatchString(bucket) {
		return nil, fs.ErrNotExist
	}
	return os.OpenRoot(filepath.Join(s.dir, bucket, objectsDir))
}

// Bucket はバケットと、その使用量
type Bucket struct {
	Name    string `json:"name"`
	Objects int64  `json:"objects"`
	Bytes   int64  `json:"bytes"`
}

func (s *Store) Buckets() ([]Bucket, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, err
	}
	out := []Bucket{}
	for _, e := range entries {
		if !e.IsDir() || !bucketRe.MatchString(e.Name()) {
			continue
		}
		b := Bucket{Name: e.Name()}
		_ = filepath.WalkDir(filepath.Join(s.dir, e.Name(), objectsDir), func(_ string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			if info, err := d.Info(); err == nil {
				b.Objects++
				b.Bytes += info.Size()
			}
			return nil
		})
		out = append(out, b)
	}
	return out, nil
}

// Reconcile はバケットを want（ConfigMap にあるバケット名）に合わせる。ないものは作り、
// want にないものは空のときだけ消す（中身があるバケットは残す）
func (s *Store) Reconcile(want []string) error {
	keep := map[string]bool{}
	for _, name := range want {
		if !bucketRe.MatchString(name) {
			continue
		}
		keep[name] = true
		for _, d := range []string{objectsDir, tmpDir} {
			if err := os.MkdirAll(filepath.Join(s.dir, name, d), 0o750); err != nil {
				return err
			}
		}
	}
	have, err := s.Buckets()
	if err != nil {
		return err
	}
	for _, b := range have {
		if !keep[b.Name] && b.Objects == 0 {
			if err := os.RemoveAll(filepath.Join(s.dir, b.Name)); err != nil {
				return err
			}
		}
	}
	return nil
}

// Object は一覧の 1 件
type Object struct {
	Key      string    `json:"key"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

// List は prefix で始まるキーを、キーの順に MaxList 件まで返す。truncated は続きがあるか
func (s *Store) List(bucket, prefix string) (objects []Object, truncated bool, err error) {
	root, err := s.root(bucket)
	if err != nil {
		return nil, false, err
	}
	defer root.Close()
	objects = []Object{}
	err = fs.WalkDir(root.FS(), ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasPrefix(p, prefix) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		objects = append(objects, Object{Key: p, Size: info.Size(), Modified: info.ModTime().UTC()})
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	sort.Slice(objects, func(i, j int) bool { return objects[i].Key < objects[j].Key })
	if len(objects) > MaxList {
		return objects[:MaxList], true, nil
	}
	return objects, false, nil
}

// Put は一時ファイルに書いてから名前を変える（書きかけのオブジェクトが読まれない）
func (s *Store) Put(bucket, key string, r io.Reader) error {
	if !ValidKey(key) {
		return errInvalidKey
	}
	root, err := s.root(bucket)
	if err != nil {
		return err
	}
	defer root.Close()
	tmp, err := os.CreateTemp(filepath.Join(s.dir, bucket, tmpDir), "put-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	n, err := io.Copy(tmp, io.LimitReader(r, s.MaxObjectBytes+1))
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return err
	}
	if n > s.MaxObjectBytes {
		return errTooLarge
	}
	if dir := path.Dir(key); dir != "." {
		if err := root.MkdirAll(dir, 0o750); err != nil {
			// 途中の区切りと同じ名前のオブジェクトがある（a があるのに a/b を置こうとした）
			return errInvalidKey
		}
	}
	// 一時ファイルは同じ PVC の上にあるので、rename は 1 回で入れ替わる
	if err := os.Rename(tmp.Name(), filepath.Join(root.Name(), filepath.FromSlash(key))); err != nil {
		return errInvalidKey
	}
	return nil
}

// Delete はオブジェクトを消し、空になった途中のディレクトリも消す
func (s *Store) Delete(bucket, key string) error {
	if !ValidKey(key) {
		return errInvalidKey
	}
	root, err := s.root(bucket)
	if err != nil {
		return err
	}
	defer root.Close()
	if info, err := root.Stat(key); err != nil || info.IsDir() {
		return fs.ErrNotExist
	}
	if err := root.Remove(key); err != nil {
		return err
	}
	for dir := path.Dir(key); dir != "."; dir = path.Dir(dir) {
		if root.Remove(dir) != nil {
			break
		}
	}
	return nil
}

var (
	errInvalidKey = errors.New("invalid object key")
	errTooLarge   = errors.New("object is too large")
)

// serve はオブジェクトを返す（Range・If-None-Match などは http.ServeContent に任せる）
func (s *Store) serve(w http.ResponseWriter, r *http.Request, bucket, key string) {
	if !ValidKey(key) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	root, err := s.root(bucket)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer root.Close()
	f, err := root.Open(key)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	ctype := mime.TypeByExtension(path.Ext(key))
	if ctype == "" {
		// 中身から種類を推測させない（アップロードした HTML がスクリプトとして動くのを防ぐ）
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("ETag", fmt.Sprintf(`"%x-%x"`, info.ModTime().UnixNano(), info.Size()))
	http.ServeContent(w, r, "", info.ModTime(), f)
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		http.Error(w, "not found", http.StatusNotFound)
	case errors.Is(err, errInvalidKey):
		http.Error(w, "invalid object key", http.StatusBadRequest)
	case errors.Is(err, errTooLarge):
		http.Error(w, "object is too large", http.StatusRequestEntityTooLarge)
	default:
		http.Error(w, "storage error", http.StatusInternalServerError)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// allowed は Bearer のトークンが、このバケットのものか管理用か
func (s *Store) allowed(r *http.Request, bucket string) bool {
	got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return false
	}
	for _, scope := range []string{bucket, "*"} {
		if subtle.ConstantTimeCompare([]byte(got), []byte(Token(s.masterKey, scope))) == 1 {
			return true
		}
	}
	return false
}

// Handler は読み書き用（トークンが要る）
//
//	GET    /b/                   バケットと使用量（管理用のトークン）
//	GET    /b/{bucket}?prefix=   オブジェクトの一覧
//	GET    /b/{bucket}/{key}     取り出す（HEAD も）
//	PUT    /b/{bucket}/{key}     置く
//	DELETE /b/{bucket}/{key}     消す
func (s *Store) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /b/{$}", func(w http.ResponseWriter, r *http.Request) {
		if !s.allowed(r, "*") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		buckets, err := s.Buckets()
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, map[string]any{"buckets": buckets})
	})
	auth := func(h func(w http.ResponseWriter, r *http.Request, bucket string)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			bucket := r.PathValue("bucket")
			if !bucketRe.MatchString(bucket) || !s.allowed(r, bucket) {
				// ないバケットと、トークンが違うバケットを区別させない
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			h(w, r, bucket)
		}
	}
	mux.HandleFunc("GET /b/{bucket}", auth(func(w http.ResponseWriter, r *http.Request, bucket string) {
		objects, truncated, err := s.List(bucket, r.URL.Query().Get("prefix"))
		if err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, map[string]any{"objects": objects, "truncated": truncated})
	}))
	mux.HandleFunc("GET /b/{bucket}/{key...}", auth(func(w http.ResponseWriter, r *http.Request, bucket string) {
		s.serve(w, r, bucket, r.PathValue("key"))
	}))
	mux.HandleFunc("PUT /b/{bucket}/{key...}", auth(func(w http.ResponseWriter, r *http.Request, bucket string) {
		if n, err := strconv.ParseInt(r.Header.Get("Content-Length"), 10, 64); err == nil && n > s.MaxObjectBytes {
			writeErr(w, errTooLarge)
			return
		}
		if err := s.Put(bucket, r.PathValue("key"), r.Body); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	mux.HandleFunc("DELETE /b/{bucket}/{key...}", auth(func(w http.ResponseWriter, r *http.Request, bucket string) {
		if err := s.Delete(bucket, r.PathValue("key")); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	return mux
}

// PublicHandler は読むだけ用（トークンなし。CDN だけが届くポートで開く）: GET /{bucket}/{key}
func (s *Store) PublicHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{bucket}/{key...}", func(w http.ResponseWriter, r *http.Request) {
		s.serve(w, r, r.PathValue("bucket"), r.PathValue("key"))
	})
	return mux
}
