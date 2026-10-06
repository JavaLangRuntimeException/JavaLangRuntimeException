package gateway

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func newKey() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.StdEncoding.EncodeToString(b)
}

// 旧実装（crypto.ts）が Node で暗号化したトークン。移行後もそのまま復号できること
const (
	legacyKey    = "fHcxYPn5dwXsXSZ5hyT/ZhQiO5jWPH31VkXr9iBRw/A="
	legacySealed = "v1:g+ogYMKT/+GrJotT:8GFW/2BKEzI1qifdpT+B/w==:8aCImtG/k7MozUV+Yb3w0CDMqo9aQ1tHlwLIKEKGKofiFs0="
)

func TestDecryptLegacyToken(t *testing.T) {
	c, err := NewCipher(legacyKey)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := c.Decrypt(legacySealed); err != nil || got != "1//0e-refresh-token_日本語も可" {
		t.Fatalf("got %q %v", got, err)
	}
}

func TestEncryptRoundTrip(t *testing.T) {
	c, _ := NewCipher(newKey())
	token := "1//0e-refresh-token_日本語も可"
	sealed, err := c.Encrypt(token)
	if err != nil || strings.Contains(sealed, token) || !strings.HasPrefix(sealed, "v1:") {
		t.Fatalf("sealed %q %v", sealed, err)
	}
	if got, err := c.Decrypt(sealed); err != nil || got != token {
		t.Fatalf("got %q %v", got, err)
	}
	if again, _ := c.Encrypt(token); again == sealed {
		t.Fatal("IV must change")
	}
}

func TestTamperAndWrongKey(t *testing.T) {
	c, _ := NewCipher(newKey())
	sealed, _ := c.Encrypt("secret")
	parts := strings.Split(sealed, ":")
	parts[3] = base64.StdEncoding.EncodeToString([]byte("tampered"))
	if _, err := c.Decrypt(strings.Join(parts, ":")); err == nil {
		t.Fatal("tampered decrypted")
	}
	other, _ := NewCipher(newKey())
	if _, err := other.Decrypt(sealed); err == nil {
		t.Fatal("wrong key decrypted")
	}
	if _, err := NewCipher(base64.StdEncoding.EncodeToString([]byte("short"))); err == nil || !strings.Contains(err.Error(), "32 バイト") {
		t.Fatal(err)
	}
}
