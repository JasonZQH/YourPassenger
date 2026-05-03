# NestJS 微服务 Monorepo 启动架构蓝图

> 参考项目：VyMap（`/Users/jasonvybers/Desktop/VyMap`）
> 目标：在新项目中复刻 "Monorepo + 多环境启动分层 + Native/Docker 双模式" 的工程体系
> 适用：需要同时支撑本地高速迭代 & 多云环境部署的中大型团队

---

## 0. 核心设计理念（一页纸）

| 维度 | 设计决策 | 理由 |
|---|---|---|
| **代码组织** | 单 repo + NestJS monorepo（`apps/` + `libs/`） | 共享 entities/common，类型安全，跨服务重构成本低 |
| **运行形态** | 同一份代码 → Native（node 进程）+ Docker（容器） | 本地迭代要快（<5s 重启），CI/生产要一致（镜像） |
| **启动入口** | Makefile 做任务分发，shell 脚本做重逻辑 | Make 负责声明；shell 负责编排、探测、重试 |
| **环境差异** | 根 `.env`（本地） + k8s Secret + ESO（云） | 本地 source，云上由 External Secrets Operator 从 GCP Secret Manager 同步 |
| **服务通信** | HTTP 对外（gateway）+ TCP 对内（microservice） | 对外网关收敛鉴权；对内用 Nest `@nestjs/microservices` TCP，低开销 |
| **多环境** | `dev / mirror / prod` 三套 GKE + 镜像仓库 | mirror 作 staging；prod 部署需二次确认（随机数学题） |
| **可观测** | Prometheus + Grafana，native/docker 两套抓取配置 | native 抓 `host.docker.internal:919X`；docker 抓 service name |

---

## 1. 目录结构蓝图

```
my-project/
├── Makefile                          # 任务分发入口（薄）
├── docker-compose.yml                # 所有服务（含 profiles）
├── .env.example                      # 本地环境变量模板
├── README.md
├── PITFALLS.md                       # 踩坑记录（重要！）
│
├── apps/
│   ├── frontend/                     # Vite/React 前端
│   └── web-server/                   # NestJS monorepo 根
│       ├── nest-cli.json             # monorepo projects 声明
│       ├── package.json              # 所有服务共享依赖
│       ├── tsconfig.json
│       ├── apps/
│       │   ├── gateway/              # HTTP 入口服务
│       │   │   ├── Dockerfile
│       │   │   ├── src/main.ts
│       │   │   ├── tsconfig.app.json
│       │   │   └── k8s/
│       │   │       ├── base/
│       │   │       └── overlays/     # dev / mirror / prod
│       │   ├── service-a/            # TCP 微服务
│       │   ├── service-b/
│       │   └── worker/               # 无 HTTP 的 tick loop
│       └── libs/
│           ├── common/               # connectWithRetry, 健康检查
│           ├── entities/             # TypeORM entities
│           └── auth/                 # JWT guards
│
├── cloud-core/                       # 独立的 k8s 集群/基础设施仓
│   ├── Makefile                      # 集群级 targets
│   └── cluster-base/
│       ├── secret-store-dev.yaml     # ExternalSecretsOperator 配置
│       ├── secret-store-mirror.yaml
│       └── secret-store-prod.yaml
│
├── scripts/
│   ├── local-up.sh                   # 本地全栈启动（重逻辑）
│   ├── local-up.ps1                  # Windows 平台脚本
│   ├── local-dev.sh                  # Webpack HMR 热重载
│   └── gen_seed.sh                   # 数据种子工具
│
├── monitoring/
│   ├── prometheus.yml                # docker 模式抓取配置
│   ├── prometheus.native.yml         # native 模式（host.docker.internal:919X）
│   └── grafana/
│       ├── provisioning/
│       └── dashboards/
│
└── migrations/                       # SQL 迁移（TypeORM 管理）
```

**关键原则**：
- `apps/web-server/` 是 **一个** NestJS monorepo，里面再分 `apps/*`。这样所有服务共享 `node_modules` 和 `libs/`
- 每个服务子项目都要有自己的 `Dockerfile`、`k8s/` overlay、`tsconfig.app.json`
- `cloud-core/` 建议独立出来（或至少独立 Makefile），因为集群生命周期与代码生命周期完全不同步

---

## 2. Makefile 分层设计

### 2.1 分层原则

```
┌─────────────────────────────────────────────────────┐
│  Makefile（薄，只做声明与分发）                       │
│  ├── setup           环境检测/依赖安装                │
│  ├── local-*         本地开发（委托给 scripts/*.sh）  │
│  ├── db-*            基础设施单独控制                 │
│  ├── {env}-build     构建并推镜像                     │
│  ├── {env}-deploy    kubectl apply overlay           │
│  ├── {env}-secret-sync  ESO 配置同步                  │
│  └── {env}-connect   委托给 cloud-core/Makefile      │
└─────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐
│  scripts/local-up.sh │   │  cloud-core/Makefile │
│  （重逻辑，编排）      │   │  （集群生命周期）      │
└──────────────────────┘   └──────────────────────┘
```

### 2.2 必备 targets（对照表）

| Target 分组 | 命令 | 职责 |
|---|---|---|
| **环境准备** | `setup` | 检测/安装 Python、Node、npm（幂等） |
| | `login` | `gcloud auth login` + ADC login |
| **本地开发** | `local-up` | 一键全栈（infra Docker + NestJS native） |
| | `local-up DOCKER=1` | 全 Docker 模式 |
| | `local-up SKIP=frontend,worker` | 跳过指定服务 |
| | `local-dev` | Webpack HMR 热重载 |
| | `local-down` | 按端口白名单清理 node 进程 + docker compose down |
| | `local-clean` | local-down + 删 volumes + 删日志 |
| | `db-up` / `db-down` | 仅控制 Postgres |
| | `reload SVC=gateway` | 重建单个服务并重启（快速迭代） |
| **云端三环境** | `{env}-docker` | 创建/启动 GKE 集群（委托 cloud-core） |
| | `{env}-connect` | `kubectl` 上下文切换 |
| | `{env}-build` | `docker buildx build --platform linux/amd64,linux/arm64 --push` |
| | `{env}-secret-sync` | 应用 ClusterSecretStore |
| | `{env}-deploy` | 遍历服务 `kubectl apply -k .../overlays/{env}` |
| **防呆** | `prod-deploy` | 二次确认（随机加法题，答错 abort） |

### 2.3 关键技巧

**平台探测**（Makefile:21-23）：
```makefile
BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
UNAME_S := $(shell uname -s 2>/dev/null || echo)
IS_WINDOWS := $(or $(filter Windows_NT,$(OS)),$(findstring MINGW,$(UNAME_S)))
```

**条件分派到 PowerShell**：
```makefile
local-up:
ifneq ($(strip $(IS_WINDOWS)),)
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-up.ps1
else
	@./scripts/local-up.sh
endif
```

**服务列表集中声明**（避免散落）：
```makefile
NESTJS_SERVICES := gateway service-a service-b worker
TAG           ?= 0.0.1
PLATFORMS     ?= linux/amd64,linux/arm64
```

**批量 build**（循环展开）：
```makefile
{env}-build:
	@for svc in $(NESTJS_SERVICES); do \
		docker buildx build --platform $(PLATFORMS) \
			-t $({env}_REGISTRY)/$$svc:$(TAG) \
			-f apps/web-server/apps/$$svc/Dockerfile \
			apps/web-server --push; \
	done
```

**prod 防呆**：
```makefile
prod-deploy:
	@A=$$(( RANDOM % 9 + 1 )); B=$$(( RANDOM % 9 + 1 )); \
	echo "Solve: $$A + $$B = ?"; read -r ANS; \
	if [ "$$ANS" != "$$(( A + B ))" ]; then echo "Aborting."; exit 1; fi
	@# ... 继续部署
```

---

## 3. 启动脚本（`scripts/local-up.sh`）设计

脚本要做七件事，**每一件都要考虑失败路径**。

### 3.1 启动流程状态机

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 0: 参数解析                                           │
│  ├─ 解析 flags: --skip-*, --docker                          │
│  └─ 解析 env: SKIP=a,b / DOCKER=1                          │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: 前置检查                                           │
│  ├─ command -v docker                                       │
│  ├─ docker compose version                                  │
│  └─ ADC 检测 → 决定是否启用 GMP profile                      │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: 模式决策                                           │
│  ├─ NATIVE=1 默认：PROMETHEUS_CONFIG=prometheus.native.yml  │
│  └─ DOCKER=1：加上 --profile microservices                  │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: 清理残留                                           │
│  ├─ docker compose down --remove-orphans                    │
│  └─ 按端口白名单杀 node/npx（绝不碰 Docker 进程）            │
├─────────────────────────────────────────────────────────────┤
│  Phase 4: 基础设施（Docker）                                 │
│  ├─ docker compose up -d postgres redis fake-gcs ...        │
│  ├─ 轮询 pg_isready（最多 30s）                              │
│  └─ 幂等创建附加 role（DO $$ BEGIN IF NOT EXISTS ... END）  │
├─────────────────────────────────────────────────────────────┤
│  Phase 5: 数据层初始化                                       │
│  ├─ npm run migration:run（必须成功）                        │
│  ├─ npm run seed:*（失败仅 warn）                            │
│  └─ 补充权限 GRANT（幂等 SQL）                               │
├─────────────────────────────────────────────────────────────┤
│  Phase 6: 应用服务                                           │
│  ├─ NATIVE: 并行 nest build → 按层启动 → wait_for_port      │
│  │   ├─ Layer 1: TCP services（无 HTTP 依赖）                │
│  │   ├─ Layer 2: HTTP services（依赖 TCP）                   │
│  │   └─ Layer 3: workers（依赖前两层）                       │
│  └─ DOCKER: docker compose up -d --no-deps $APP_SERVICES    │
├─────────────────────────────────────────────────────────────┤
│  Phase 7: 状态展示 + 日志流                                   │
│  ├─ 彩色对齐表格（服务/端口/URL）                             │
│  ├─ 每服务一个 log 文件：.local-logs/YYYYMMDD_HHMMSS/        │
│  └─ wait 所有子进程                                         │
├─────────────────────────────────────────────────────────────┤
│  Phase 8: 清理 trap                                         │
│  └─ trap cleanup EXIT → pkill -TERM -P $$ → make local-down │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 必备工具函数

```bash
# 彩色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[local-up]${NC} $*"; }
warn() { echo -e "${YELLOW}[local-up]${NC} $*"; }
err()  { echo -e "${RED}[local-up]${NC} $*" >&2; }

# 等端口开放
wait_for_port() {
  local port=$1 retries=60
  until nc -z localhost "$port" 2>/dev/null; do
    retries=$((retries - 1))
    [ $retries -eq 0 ] && { err "port $port 未在 30s 内就绪"; exit 1; }
    sleep 0.5
  done
}

# 等 docker container healthy
wait_healthy() {
  local container=$1 name=$2 timeout=${3:-60}
  for i in $(seq 1 "$timeout"); do
    status=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null)
    case "$status" in
      healthy)   return 0 ;;
      unhealthy) err "$name unhealthy"; return 1 ;;
    esac
    sleep 1
  done
  warn "$name not healthy after ${timeout}s"
}
```

### 3.3 关键坑位 & 对策

| 坑 | 对策 |
|---|---|
| 上次运行残留 node 进程占端口 | 启动前 `lsof -ti :$port \| xargs kill`，但**只杀 node/npx**（`ps -p $pid -o comm=` 过滤） |
| 同主机多个 NestJS 进程的 `HEALTH_PORT` / `METRICS_PORT` 冲突 | 每服务显式分配：`METRICS_PORT=9191 node ...a/main.js` / `9192 .../b/main.js` |
| TCP 服务间启动顺序难以编排 | `connectWithRetry`（在 `libs/common`）让 consumer 自动重试；脚本无需严格 order |
| `wait $pids...` 只返回最后一个 PID 的 exit status，隐藏前面的失败 | 逐个 `for pid in "${BUILD_PIDS[@]}"; do wait "$pid" \|\| exit 1; done` |
| `trap` 嵌套触发清理两次 | 用 `trap 'exit 130' INT; trap 'exit 143' TERM; trap cleanup EXIT`（清理只挂在 EXIT） |
| macOS vs Linux 下 Docker `host.docker.internal` 行为不同 | 在 `docker-compose.yml` 显式加 `extra_hosts: ["host.docker.internal:host-gateway"]` |
| migrations 跑多次导致重复追踪表 | 在脚本里跑一次后，给容器注入 `MIGRATIONS_RUN=false` 让 ORM 跳过 |
| 前端 env 在**浏览器**执行，用 Docker 网络名会炸 | `VITE_API_URL` 必须是 localhost；写清楚注释免得下次踩 |

### 3.4 Native 模式环境变量注入模板

```bash
# 从根 .env source（开发者本地密钥在这里）
if [ -f "$ROOT/.env" ]; then
  set -a; source "$ROOT/.env"; set +a
fi

# 服务间寻址（native = localhost + Docker 暴露的外部端口）
export DATABASE_URL="postgresql://user:pw@localhost:5433/db"
export REDIS_URL="redis://localhost:6381"
export DM_HOST=localhost DM_PORT=4002
export WSM_HOST=localhost WSM_PORT=4001

# 每服务独立的观测端口（避免冲突）
TCP_PORT=4002 HEALTH_PORT=4102 METRICS_PORT=9191 node dist/apps/service-a/main.js &
TCP_PORT=4003 HEALTH_PORT=4103 METRICS_PORT=9192 node dist/apps/service-b/main.js &
```

---

## 4. Docker Compose 设计要点

### 4.1 用 profiles 隔离模式

```yaml
services:
  postgres: { ... }          # 默认启动
  redis:    { ... }          # 默认启动

  nestjs-gateway:
    profiles: ["microservices"]   # 只在 DOCKER=1 时启动
    build: { ... }

  gmp-dev:
    profiles: ["gmp"]              # 只在有 ADC 时启动
    <<: *gmp-common

  nestjs-local:
    profiles: ["local"]            # 全服务合并进一个容器，方便单容器调试
```

启动时：
```bash
# 仅 infra
docker compose up -d postgres redis

# infra + 微服务
docker compose --profile microservices up -d

# infra + 微服务 + GMP
docker compose --profile microservices --profile gmp up -d
```

### 4.2 端口分配约定（避免冲突）

| 类型 | 主机端口 | 容器端口 | 说明 |
|---|---|---|---|
| Postgres | 5433 | 5432 | 避开本地可能存在的 5432 |
| Redis | 6381 | 6379 | 同上 |
| Gateway HTTP | 3100 | 3000 | 对外 API |
| Service TCP | 4001-4009 | same | 内部 RPC |
| Service HTTP | 4010-4019 | same | 对外可见的服务 |
| Metrics | 9191-9197 | same | 每服务一个（native 模式） |
| Prometheus | 9092 | 9090 |  |
| Grafana | 3001 | 3000 |  |
| Frontend | 5173 | 5173 | Vite 默认 |

### 4.3 健康检查必备

```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U user -d db"]
    interval: 5s
    timeout: 5s
    retries: 10

nestjs-service:
  depends_on:
    postgres:
      condition: service_healthy    # 不是 service_started
```

---

## 5. 多环境部署设计

### 5.1 三环境拓扑

```
┌────────────────────────────────────────────────┐
│  dev-vymap         开发环境，随便部               │
│  mirror-vymap      staging，代码 freeze 后合入    │
│  prod-vymap        生产，部署需答题               │
└────────────────────────────────────────────────┘
每个环境独立：
  ├─ GCP project
  ├─ GKE cluster
  ├─ Artifact Registry（镜像仓）
  ├─ Secret Manager
  └─ k8s overlay（kustomize）
```

### 5.2 k8s overlay 布局

```
apps/web-server/apps/gateway/k8s/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml        # images: newTag / replicas / env patch
    │   └── ingress.yaml
    ├── mirror/
    └── prod/
```

### 5.3 Secret 管理：External Secrets Operator

```yaml
# cloud-core/cluster-base/secret-store-dev.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: gcp-secret-manager
spec:
  provider:
    gcpsm:
      projectID: dev-myproject
      auth:
        workloadIdentity:
          clusterLocation: us-west1
          clusterName: dev-myproject-cluster
          serviceAccountRef:
            name: external-secrets-sa
            namespace: external-secrets
```

然后：
```bash
make dev-secret-sync     # kubectl apply secret-store-dev.yaml
# 各服务的 ExternalSecret CR 自动从 GCP Secret Manager 拉取
```

---

## 6. 可观测性设计

### 6.1 双配置 Prometheus

| 模式 | 配置文件 | 抓取目标 |
|---|---|---|
| Native | `prometheus.native.yml` | `host.docker.internal:919X` |
| Docker | `prometheus.yml` | `nestjs-service-a:9090` (docker 网络) |

在 `local-up.sh` 里切换：
```bash
export PROMETHEUS_CONFIG=prometheus.native.yml
[ "${DOCKER:-}" = "1" ] && export PROMETHEUS_CONFIG=prometheus.yml
```

在 `docker-compose.yml` 里引用：
```yaml
prometheus:
  volumes:
    - ./monitoring/${PROMETHEUS_CONFIG:-prometheus.yml}:/etc/prometheus/prometheus.yml:ro
```

### 6.2 GMP Proxy（可选：连 GKE Managed Prometheus）

```yaml
x-gmp-common: &gmp-common
  image: gke.gcr.io/prometheus-engine/frontend:v0.15.3-gke.0
  profiles: [gmp]
  environment:
    GOOGLE_APPLICATION_CREDENTIALS: /etc/gcp/adc.json
  volumes:
    - ${HOME}/.config/gcloud/application_default_credentials.json:/etc/gcp/adc.json:ro

gmp-dev:    { <<: *gmp-common, environment: { QUERY_PROJECT_ID: dev-myproject } }
gmp-mirror: { <<: *gmp-common, environment: { QUERY_PROJECT_ID: mirror-myproject } }
gmp-prod:   { <<: *gmp-common, environment: { QUERY_PROJECT_ID: prod-myproject } }
```

开发者本地 Grafana 就能切 Environment 下拉框看任意环境的真实指标。

---

## 7. 落地 Checklist（逐条打钩）

### 阶段一：骨架
- [ ] 初始化 NestJS monorepo：`nest new --standalone` 后改 `nest-cli.json`
- [ ] 在 `apps/` 下建至少 2 个 app + 2 个 lib（`common` / `entities`）
- [ ] 每个 app 写一个最小 `main.ts` + 独立 `Dockerfile`
- [ ] 写 `docker-compose.yml`，先把 Postgres + Redis 跑通
- [ ] `.env.example` 列全所有必需变量（别写真密钥）

### 阶段二：本地启动体系
- [ ] 写 `Makefile`：`help` / `setup` / `local-up` / `local-down` / `local-clean`
- [ ] 写 `scripts/local-up.sh`，按 §3.1 八阶段实现
- [ ] 实现 `wait_for_port` / `wait_healthy` / 彩色 log helper
- [ ] 跑通 NATIVE 模式：`make local-up`
- [ ] 跑通 DOCKER 模式：`make local-up DOCKER=1`
- [ ] 验证 SKIP：`make local-up SKIP=frontend`
- [ ] 验证清理：`make local-down` 后端口全释放，再次 `local-up` 无残留

### 阶段三：多环境
- [ ] `cloud-core/` 独立 Makefile，只管集群生命周期
- [ ] 三套 `secret-store-{env}.yaml` + ESO 安装
- [ ] 每服务 `k8s/base/` + `overlays/{dev,mirror,prod}`
- [ ] Makefile 加 `{env}-build` / `{env}-deploy` / `{env}-secret-sync`
- [ ] `prod-deploy` 加二次确认

### 阶段四：可观测
- [ ] `monitoring/prometheus.yml` + `prometheus.native.yml`
- [ ] `libs/common` 提供 `/health` + `/metrics` 端点工厂
- [ ] 每服务注入独立的 `HEALTH_PORT` / `METRICS_PORT`
- [ ] Grafana provisioning + 至少一张默认 dashboard

### 阶段五：防御性 & 文档
- [ ] `PITFALLS.md` 实时记录每个坑（脚本里注释也要同步）
- [ ] `README.md` 首屏给 `make local-up`，链到 `make help`
- [ ] CI：PR 触发 `docker buildx build`（不 push），main 合并触发 `{env}-build`
- [ ] 冒烟测试：e2e 起真 Postgres，不 mock（参考 VyMap 的 `integration tests must hit real DB`）

---

## 8. 可以直接抄的代码片段索引

| 场景 | 文件 | 行号 |
|---|---|---|
| 平台探测（macOS / Windows / brew） | `VyMap/Makefile` | 21-23 |
| help target 格式 | `VyMap/Makefile` | 25-80 |
| setup（Python/Node 幂等安装） | `VyMap/Makefile` | 82-115 |
| 多环境 build/deploy 模板 | `VyMap/Makefile` | 127-221 |
| prod-deploy 防呆 | `VyMap/Makefile` | 177-192 |
| local-down 按端口杀 node | `VyMap/Makefile` | 261-276 |
| reload 单服务 | `VyMap/Makefile` | 278-301 |
| 八阶段启动流 | `VyMap/scripts/local-up.sh` | 全文 |
| wait_for_port / wait_healthy | `VyMap/scripts/local-up.sh` | 31-38, 130-142 |
| 端口清理安全过滤 | `VyMap/scripts/local-up.sh` | 161-175 |
| 幂等 role 创建 | `VyMap/scripts/local-up.sh` | 196-204 |
| docker-compose profiles | `VyMap/docker-compose.yml` | 72, 138, 252, 295 |
| GMP proxy common block | `VyMap/docker-compose.yml` | 292-299 |

---

## 9. 常见误区提醒

1. **别把 Makefile 写胖**。超过 5 行的逻辑全扔进 `scripts/*.sh`。Make 只应做"声明依赖 + 调用"。
2. **别省 `PITFALLS.md`**。脚本注释记"为什么这么写"，`PITFALLS.md` 记"踩过什么坑"，两份配合用。
3. **别 mock 数据库做集成测试**。本地就起真 Postgres（`db-up`），migration 失败能第一时间发现。
4. **别用 `wait $all_pids`**。`wait` 无参只返 0，隐藏失败；逐个 `wait $pid` 才能捕获 exit status。
5. **别在 `docker-compose.yml` 写死密钥**。用 `${VAR:-default}` 从环境读，开发者自己管 `.env`。
6. **别让 prod 和 dev 用同一个镜像 tag**。每环境独立 registry，tag 由 CI 从 git tag 派生。
7. **别忘了 native / docker 模式的 Prometheus 配置要切换**。否则指标看不到还难排查。
8. **前端的 env 变量是在浏览器里执行的**，`VITE_API_URL` 只能写 localhost / 公网域名，不能写 docker 内部名。
9. **别省 trap EXIT 清理**。Ctrl+C 后如果 compose 还在跑，下次 `local-up` 会端口冲突。
10. **arm64 Mac + amd64 镜像**：`docker buildx build --platform linux/amd64,linux/arm64` 双架构构建，否则 GKE 拉的 arm64 镜像跑不起来。

---

**End of Blueprint** · 如需任何章节展开成独立实施文档（例如 k8s overlay 细节、ESO 完整配置、CI pipeline 模板），按需再切细。