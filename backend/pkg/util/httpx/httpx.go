// Package httpx は外部 API 用の HTTP クライアント（APM で計装済み）
package httpx

import (
	"net/http"
	"time"

	httptrace "github.com/DataDog/dd-trace-go/contrib/net/http/v2"
)

// ChromeUA はスクレイピング先に普通のブラウザとして見せる User-Agent（旧実装と同じ）
const ChromeUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// New はタイムアウト付きのクライアント。外部へのリクエストもトレースに出る
func New(timeout time.Duration) *http.Client {
	return httptrace.WrapClient(&http.Client{Timeout: timeout})
}

// NoRedirect はリダイレクトを自分で扱うためのクライアント（GAS のウェブフック用）
func NoRedirect(timeout time.Duration) *http.Client {
	return httptrace.WrapClient(&http.Client{
		Timeout:       timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	})
}
