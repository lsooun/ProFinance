# ProFinance Kubernetes 部署

本目录使用单副本 Deployment + RWO PVC 运行现阶段的 SQLite 版本。

## 前提

- 集群已有默认 StorageClass，或修改 `pvc.yaml` 的 `storageClassName`
- 已安装 `kubectl`
- 节点公网 IP 为 `47.93.85.18`，云安全组/防火墙放行 `18099`
- 当前 `service.yaml` 使用 NodePort 暴露 `18099`；该集群的 service-node-port-range 为 80-60000

## 构建和导入镜像

```bash
docker build -t profinance:latest .
```

如果集群节点不能直接访问 Docker 镜像仓库，可以先把镜像导入节点：

```bash
docker save profinance:latest -o /tmp/profinance.tar
scp /tmp/profinance.tar root@47.93.85.18:/tmp/
ssh root@47.93.85.18 'k3s ctr images import /tmp/profinance.tar'
```

如果使用远程镜像仓库：

```bash
docker tag profinance:latest registry.example.com/profinance:20261116
docker push registry.example.com/profinance:20261116
# 修改 deploy/k8s/kustomization.yaml 的 newName/newTag
```

## 部署

```bash
kubectl apply -k deploy/k8s
kubectl -n profinance rollout status deployment/profinance
kubectl -n profinance get pods,pvc,svc -o wide
```

访问：

```text
http://47.93.85.18:18099/
```

## 重要限制

- **只能 1 个副本**：SQLite 和附件目录不支持多个 Pod 同时写入。
- **不要使用 RollingUpdate**：PVC 为 ReadWriteOnce，已配置 `Recreate`。
- **必须持久化 `/app/data`**：数据库和上传附件都在这个目录。
- **HTTP 明文**：当前 `PF_SECURE_COOKIE=0`。接入 HTTPS Ingress 后改为 `1`。
- 首次启动会自动创建演示账号和演示数据；上线前必须修改默认密码并清理演示数据。
- 建议为 `profinance-data` 配置定期备份；单靠 PVC 不是备份。

## 常见检查

```bash
kubectl -n profinance describe pod -l app=profinance
kubectl -n profinance logs -f deployment/profinance
curl http://47.93.85.18:18099/api/health
```
