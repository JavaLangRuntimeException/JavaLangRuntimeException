package service

import (
	"math"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

const mib = int64(1) << 20

// Size はアプリ 1 つの大きさ（コンソールで「あと何個」を数える単位。④ でアプリを作るときの選択肢と同じ）
type Size struct {
	Name        string
	MemoryBytes int64
	CPUMillis   int64
}

var Sizes = []Size{
	{Name: "s", MemoryBytes: 128 * mib, CPUMillis: 100},
	{Name: "m", MemoryBytes: 256 * mib, CPUMillis: 250},
	{Name: "l", MemoryBytes: 512 * mib, CPUMillis: 500},
	{Name: "xl", MemoryBytes: 1024 * mib, CPUMillis: 1000},
}

// 何で数が止まるか
const (
	LimitedByQuotaMemory   = "quota_memory"
	LimitedByQuotaCPU      = "quota_cpu"
	LimitedByQuotaPods     = "quota_pods"
	LimitedByMachineMemory = "machine_memory"
)

// Machine は Mac mini 全体のメモリと CPU
type Machine struct {
	MemoryTotal int64
	MemoryUsed  int64
	CPUTotal    int64
	CPUUsed     int64
}

// MachineOf はノードの値から Mac mini 全体を出す。
// kind の 3 ノードは同じ VM（OrbStack）の上のコンテナで、どのノードも VM 全体のメモリ・CPU を容量として報告する。
// 足すと 3 倍に見えてしまうので、容量は一番大きいノードの値を使い、使用量（各ノードのコンテナの実使用量）は足す
func MachineOf(nodes []gateway.NodeStatus) Machine {
	var m Machine
	for _, n := range nodes {
		m.MemoryTotal = max(m.MemoryTotal, n.MemoryCapacity)
		m.CPUTotal = max(m.CPUTotal, n.CPUCapacity)
		m.MemoryUsed += n.MemoryUsed
		m.CPUUsed += n.CPUUsed
	}
	return m
}

// MachineFree はアプリに新しく渡してよい Mac mini のメモリ。
// taramanji.com・gws の伸びしろ（reserve）は渡さない。この環境のアプリが予約したのにまだ使っていない分も、
// いずれ使われるので空きから引く
func MachineFree(m Machine, reserve int64, q gateway.QuotaStatus, pods []gateway.PodUsage) int64 {
	var podsUsed int64
	for _, p := range pods {
		podsUsed += p.MemoryUsed
	}
	committed := max(q.Used.MemoryBytes-podsUsed, 0)
	return max(m.MemoryTotal-m.MemoryUsed-reserve-committed, 0)
}

// Fit はある大きさのアプリをあと何個置けるか
type Fit struct {
	Size      Size
	Count     int64
	LimitedBy string
}

// Fits は大きさごとに、この環境の枠（ResourceQuota）と Mac mini の空きの、先に尽きる方で数える
func Fits(q gateway.QuotaStatus, machineFree int64) []Fit {
	out := make([]Fit, 0, len(Sizes))
	for _, s := range Sizes {
		f := Fit{Size: s, Count: math.MaxInt64}
		take := func(n int64, by string) {
			if n < f.Count {
				f.Count, f.LimitedBy = n, by
			}
		}
		if !q.Found {
			take(0, LimitedByQuotaMemory)
		}
		take(remaining(q.Hard.MemoryBytes, q.Used.MemoryBytes)/s.MemoryBytes, LimitedByQuotaMemory)
		take(remaining(q.Hard.CPUMillis, q.Used.CPUMillis)/s.CPUMillis, LimitedByQuotaCPU)
		take(remaining(q.Hard.Pods, q.Used.Pods), LimitedByQuotaPods)
		take(machineFree/s.MemoryBytes, LimitedByMachineMemory)
		out = append(out, f)
	}
	return out
}

func remaining(hard, used int64) int64 { return max(hard-used, 0) }
