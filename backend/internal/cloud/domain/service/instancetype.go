package service

import "strings"

// InstanceType は関数 1 つの大きさの型。名前は EC2 と同じ「ファミリー + 世代 . サイズ」（t1.small・c1.large・r1.medium など）。
// 型を選ぶと CPU とメモリが決まる。そのあと CPU・メモリを個別に変えてもよい（変えたアプリも型の名前は残す）
type InstanceType struct {
	Name        string
	MemoryBytes int64
	CPUMillis   int64
}

// InstanceFamily は型の系統（EC2 と同じ考え方。CPU とメモリの比率が違う）
type InstanceFamily struct {
	ID          string
	Label       string
	Description string
}

// InstanceFamilies は選べる系統（画面に出す順）
var InstanceFamilies = []InstanceFamily{
	{ID: "t1", Label: "汎用", Description: "CPU とメモリが釣り合った型。ふつうの Web アプリ・API 向け"},
	{ID: "c1", Label: "コンピューティング最適化", Description: "メモリに比べて CPU が多い型。計算・変換・圧縮など、CPU を使う処理向け"},
	{ID: "r1", Label: "メモリ最適化", Description: "CPU に比べてメモリが多い型。データを手元に多く持つ処理・キャッシュ向け"},
}

// InstanceTypes は選べる型（系統ごとに小さい順）。どれも関数 1 つの上限（メモリ 1 GiB・1 CPU）に収まる
var InstanceTypes = []InstanceType{
	{Name: "t1.small", MemoryBytes: 128 * mib, CPUMillis: 100},
	{Name: "t1.medium", MemoryBytes: 256 * mib, CPUMillis: 250},
	{Name: "t1.large", MemoryBytes: 512 * mib, CPUMillis: 500},
	{Name: "t1.xlarge", MemoryBytes: 1024 * mib, CPUMillis: 1000},
	// CPU : メモリ = 1 CPU あたり 512 MiB（t1 の倍の CPU）
	{Name: "c1.small", MemoryBytes: 128 * mib, CPUMillis: 250},
	{Name: "c1.medium", MemoryBytes: 256 * mib, CPUMillis: 500},
	{Name: "c1.large", MemoryBytes: 512 * mib, CPUMillis: 1000},
	// CPU : メモリ = 1 CPU あたり 4 GiB（t1 の 4 倍のメモリ）
	{Name: "r1.small", MemoryBytes: 256 * mib, CPUMillis: 50},
	{Name: "r1.medium", MemoryBytes: 512 * mib, CPUMillis: 125},
	{Name: "r1.large", MemoryBytes: 1024 * mib, CPUMillis: 250},
}

// 個別に決めるときの範囲（上限は LimitRange の max）
const (
	MinCPUMillis   = int64(10)
	MaxCPUMillis   = int64(1000)
	MinMemoryBytes = 16 * mib
	MaxMemoryBytes = 1024 * mib
)

// InstanceTypeOf は名前から型を探す
func InstanceTypeOf(name string) (InstanceType, bool) {
	for _, t := range InstanceTypes {
		if t.Name == name {
			return t, true
		}
	}
	return InstanceType{}, false
}

// FamilyOf は「t1.small」の「t1」
func FamilyOf(name string) string {
	f, _, _ := strings.Cut(name, ".")
	return f
}
