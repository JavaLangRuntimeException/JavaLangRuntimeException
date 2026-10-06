package gateway

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/javalangruntimeexception/taramanji/backend/internal/calendarsync/domain/gateway"
)

// aesGCM は更新トークンを AES-256-GCM で暗号化する。形式は旧実装と同じ v1:iv:tag:ciphertext（各 base64）なので、
// 旧実装が保存したトークンをそのまま読める
type aesGCM struct{ aead cipher.AEAD }

// NewCipher は CALENDAR_SYNC_ENC_KEY（32 バイトの鍵の base64）から作る
func NewCipher(keyBase64 string) (gateway.Cipher, error) {
	key, err := base64.StdEncoding.DecodeString(keyBase64)
	if err != nil || len(key) != 32 {
		return nil, errors.New("CALENDAR_SYNC_ENC_KEY に 32 バイトの鍵（base64）を設定してください")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &aesGCM{aead: aead}, nil
}

func (c *aesGCM) Encrypt(plain string) (string, error) {
	iv := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	sealed := c.aead.Seal(nil, iv, []byte(plain), nil)
	data, tag := sealed[:len(sealed)-c.aead.Overhead()], sealed[len(sealed)-c.aead.Overhead():]
	enc := base64.StdEncoding.EncodeToString
	return strings.Join([]string{"v1", enc(iv), enc(tag), enc(data)}, ":"), nil
}

func (c *aesGCM) Decrypt(sealed string) (string, error) {
	parts := strings.Split(sealed, ":")
	if len(parts) != 4 || parts[0] != "v1" {
		return "", errors.New("unknown token format")
	}
	dec := base64.StdEncoding.DecodeString
	iv, err1 := dec(parts[1])
	tag, err2 := dec(parts[2])
	data, err3 := dec(parts[3])
	if err := errors.Join(err1, err2, err3); err != nil {
		return "", err
	}
	if len(iv) != c.aead.NonceSize() {
		return "", errors.New("invalid iv")
	}
	plain, err := c.aead.Open(nil, iv, append(data, tag...), nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
