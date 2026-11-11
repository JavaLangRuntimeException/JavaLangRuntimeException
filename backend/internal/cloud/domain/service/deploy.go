package service

import "time"

// デプロイの様子（デプロイヤーが書き、コンソールが読む）。環境の共有の namespace の ConfigMap cloud-deployments に、
// 「種類.名前」（functions.blog など）ごとに JSON で置く
const (
	DeployStatusConfigMap = "cloud-deployments"
	LabelDeployStatus     = "cloud.taramanji.com/deploy-status"

	DeployApplied = "applied"
	DeployWaiting = "waiting"
	DeployInvalid = "invalid"
	DeployFailed  = "failed"
	DeployDeleted = "deleted"
)

// DeployEvent は履歴の 1 件
type DeployEvent struct {
	At       time.Time `json:"at"`
	Commit   string    `json:"commit"`
	Revision string    `json:"revision"`
	State    string    `json:"state"`
	Message  string    `json:"message,omitempty"`
}

// DeployStatus は 1 つのリソースのデプロイの様子
type DeployStatus struct {
	Kind     string        `json:"kind"`
	Name     string        `json:"name"`
	State    string        `json:"state"`
	Message  string        `json:"message,omitempty"`
	Revision string        `json:"revision"`
	Commit   string        `json:"commit"`
	At       time.Time     `json:"at"`
	History  []DeployEvent `json:"history"`
}

// DeployKey は ConfigMap の data のキー（functions.blog など）
func DeployKey(kind, name string) string { return kind + "." + name }
