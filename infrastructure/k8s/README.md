# Kubernetes 清单

应用顺序：
```bash
kubectl apply -f 00-namespace.yaml
kubectl apply -f 10-config.yaml          # 生产改用 ExternalSecrets / CSI Key Vault
kubectl apply -f 30-stateful.yaml        # 自管 PG/Redis；生产请改 Azure 托管
kubectl apply -f 20-game-server.yaml
kubectl apply -f 21-teams-tab-and-ai.yaml
kubectl apply -f 40-ingress.yaml
```

观测栈（Prometheus / Grafana / Loki / OTel Collector）建议用 `kube-prometheus-stack` + `loki-stack` Helm chart 部署到 `observability` namespace，本目录暂不重复。
