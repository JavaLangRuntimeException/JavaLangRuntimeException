package usecase

import (
	"context"
	"encoding/json"
	"sort"

	"github.com/javalangruntimeexception/taramanji/backend/internal/cloud/domain/service"
	"github.com/javalangruntimeexception/taramanji/backend/pkg/util/errs"
)

// ListDeployments はデプロイの様子（コントローラーが共有の namespace の ConfigMap に書いたもの）を返す
func (u *ConsoleUsecaseImpl) ListDeployments(ctx context.Context, _ ListDeploymentsInput) (*ListDeploymentsOutput, error) {
	out := &ListDeploymentsOutput{Deployments: []*Deployment{}, Enabled: u.d.Apps != nil}
	if u.d.State == nil {
		return out, nil
	}
	cms, err := u.d.State.ConfigMaps(ctx, service.LabelDeployStatus)
	if err != nil {
		return nil, errs.NewInternalError(err)
	}
	for _, cm := range cms {
		if cm.Name != service.DeployStatusConfigMap {
			continue
		}
		for _, v := range cm.Data {
			var s service.DeployStatus
			if json.Unmarshal([]byte(v), &s) != nil {
				continue
			}
			d := &Deployment{Kind: s.Kind, Name: s.Name, State: s.State, Message: s.Message, Revision: s.Revision, Commit: s.Commit,
				AtMs: s.At.UnixMilli(), History: []*DeploymentEvent{}}
			for _, e := range s.History {
				d.History = append(d.History, &DeploymentEvent{AtMs: e.At.UnixMilli(), Commit: e.Commit, Revision: e.Revision, State: e.State, Message: e.Message})
			}
			out.Deployments = append(out.Deployments, d)
		}
	}
	sort.Slice(out.Deployments, func(i, j int) bool {
		a, b := out.Deployments[i], out.Deployments[j]
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		return a.Name < b.Name
	})
	return out, nil
}
