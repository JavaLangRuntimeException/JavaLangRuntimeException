package service

import "strings"

// InstanceType はアプリ 1 つの大きさの型。名前は EC2 と同じ「ファミリー + 世代 . サイズ」（t1.small など）。
// 型を選ぶと CPU とメモリが決まる。そのあと CPU・メモリを個別に変えてもよい（変えたアプリも型の名前は残す）
type InstanceType struct {
	Name        string
	MemoryBytes int64
	CPUMillis   int64
}

// InstanceTypes は選べる型（小さい順）。t1 は汎用の第 1 世代。
// 上限（t1.xlarge）はアプリ用 namespace の LimitRange の max（メモリ 1 GiB・1 CPU）と同じ
var InstanceTypes = []InstanceType{
	{Name: "t1.small", MemoryBytes: 128 * mib, CPUMillis: 100},
	{Name: "t1.medium", MemoryBytes: 256 * mib, CPUMillis: 250},
	{Name: "t1.large", MemoryBytes: 512 * mib, CPUMillis: 500},
	{Name: "t1.xlarge", MemoryBytes: 1024 * mib, CPUMillis: 1000},
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

// InstanceFamily は「t1.small」の「t1」
func InstanceFamily(name string) string {
	f, _, _ := strings.Cut(name, ".")
	return f
}
