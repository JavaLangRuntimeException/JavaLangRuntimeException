package service

import (
	"testing"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/gateway"
)

const gib = 1024 * mib

func TestMachineOf_SharedVM(t *testing.T) {
	m := MachineOf([]gateway.NodeStatus{
		{MemoryCapacity: 12 * gib, CPUCapacity: 10000, MemoryUsed: 2 * gib, CPUUsed: 100},
		{MemoryCapacity: 12 * gib, CPUCapacity: 10000, MemoryUsed: 3 * gib, CPUUsed: 200},
	})
	// 同じ VM を分け合うので容量は足さない。使用量は足す
	if m.MemoryTotal != 12*gib || m.CPUTotal != 10000 || m.MemoryUsed != 5*gib || m.CPUUsed != 300 {
		t.Fatalf("got %+v", m)
	}
}

func TestMachineFree(t *testing.T) {
	m := Machine{MemoryTotal: 12 * gib, MemoryUsed: 5 * gib}
	q := gateway.QuotaStatus{Found: true, Used: gateway.Resources{MemoryBytes: 1 * gib}}
	pods := []gateway.PodUsage{{MemoryUsed: 256 * mib}}
	// 12 - 5 - 2（予約）- (1GiB 予約済み - 256MiB 使用中)
	if got, want := MachineFree(m, 2*gib, q, pods), 12*gib-5*gib-2*gib-768*mib; got != want {
		t.Fatalf("got %d want %d", got, want)
	}
	if got := MachineFree(Machine{MemoryTotal: 4 * gib, MemoryUsed: 3 * gib}, 2*gib, q, nil); got != 0 {
		t.Fatalf("over-committed machine should be 0, got %d", got)
	}
}

func TestFits(t *testing.T) {
	q := gateway.QuotaStatus{Found: true,
		Hard: gateway.Resources{MemoryBytes: 2560 * mib, CPUMillis: 4000, Pods: 30},
		Used: gateway.Resources{MemoryBytes: 512 * mib, CPUMillis: 500, Pods: 2}}
	fits := Fits(q, 100*gib)
	want := map[string]struct {
		n  int64
		by string
	}{
		"s":  {16, LimitedByQuotaMemory}, // 2048MiB / 128
		"m":  {8, LimitedByQuotaMemory},
		"l":  {4, LimitedByQuotaMemory},
		"xl": {2, LimitedByQuotaMemory},
	}
	for _, f := range fits {
		if w := want[f.Size.Name]; f.Count != w.n || f.LimitedBy != w.by {
			t.Errorf("%s: got %d %s want %d %s", f.Size.Name, f.Count, f.LimitedBy, w.n, w.by)
		}
	}

	// Mac mini の空きが先に尽きる
	if f := Fits(q, 300*mib)[1]; f.Count != 1 || f.LimitedBy != LimitedByMachineMemory {
		t.Errorf("machine-limited: got %+v", f)
	}
	// CPU の枠が先に尽きる
	q.Hard.CPUMillis = 600
	if f := Fits(q, 100*gib)[0]; f.Count != 1 || f.LimitedBy != LimitedByQuotaCPU {
		t.Errorf("cpu-limited: got %+v", f)
	}
	// 枠がない namespace には置けない
	if f := Fits(gateway.QuotaStatus{}, 100*gib)[0]; f.Count != 0 || f.LimitedBy != LimitedByQuotaMemory {
		t.Errorf("no quota: got %+v", f)
	}
}
