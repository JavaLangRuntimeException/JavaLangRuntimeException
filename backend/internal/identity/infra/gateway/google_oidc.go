// Package gateway は Google の OpenID Connect（ログイン）の実装。
package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/javalangruntimeexception/taramanji/backend/internal/identity/domain/gateway"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/httpx"
)

const userinfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

type googleOIDC struct {
	clientID, clientSecret string
}

func NewGoogleOIDC(clientID, clientSecret string) gateway.OIDC {
	return &googleOIDC{clientID: clientID, clientSecret: clientSecret}
}

func (g *googleOIDC) config(redirectURI string) *oauth2.Config {
	return &oauth2.Config{ClientID: g.clientID, ClientSecret: g.clientSecret, RedirectURL: redirectURI,
		Endpoint: google.Endpoint, Scopes: []string{"openid", "email", "profile"}}
}

func (g *googleOIDC) AuthURL(redirectURI, state, challenge string) string {
	return g.config(redirectURI).AuthCodeURL(state,
		oauth2.SetAuthURLParam("code_challenge", challenge), oauth2.SetAuthURLParam("code_challenge_method", "S256"))
}

func (g *googleOIDC) Exchange(ctx context.Context, redirectURI, code, verifier string) (*gateway.Profile, error) {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, httpx.New(30*time.Second))
	cfg := g.config(redirectURI)
	tok, err := cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return nil, err
	}
	res, err := cfg.Client(ctx, tok).Get(userinfoURL)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo HTTP %d", res.StatusCode)
	}
	var u struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, err
	}
	if u.Email == "" || !u.EmailVerified {
		return nil, errors.New("email is not verified")
	}
	return &gateway.Profile{Email: u.Email, Name: u.Name, Picture: u.Picture}, nil
}
