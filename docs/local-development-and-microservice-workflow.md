# 本地开发与微服务编排规范

## 目标

本文档定义两件事：

1. 当前仓库在本地开发环境下的标准启动、清理、关闭方式。
2. 当前仓库已经拆出的服务，在本地和未来部署环境中应遵守的健康检查、迁移、数据 ownership 和低耦合原则。

## 当前状态

当前仓库的运行形态是一组独立服务：

- `apps/app-server/`
- `apps/auth-service/`
- `apps/profile-service/`
- `apps/session-service/`
- `apps/conversation-service/`
- `ios/`：iOS Client，由 Xcode / Simulator 运行
- PostgreSQL：默认使用本地/外部数据库；`DOCKER=1` 时由 Docker Compose 管理

其中：

- `app-server` 是对 iOS 暴露的唯一 HTTP / WebSocket 入口
- `auth-service` 负责身份和 token
- `profile-service` 负责 profile 真相
- `session-service` 负责 session / turns / summary 真相，以及 end-session summary 编排
- `conversation-service` 负责 reply / summary 编排逻辑，以及 `app-server` 的 gRPC realtime hot path

## 核心原则

### 1. 编排顺序属于 orchestration，不属于服务进程启动门槛

合理：

- `local-up` 先起 PostgreSQL
- 再跑 migration
- 再按顺序起 `auth/profile/session/conversation/app-server`
- 编排层等待 `ready`

不合理：

- service 自己在启动逻辑里要求“别的 service 必须先 healthy，否则直接退出”

原则：

- 顺序属于编排层
- `ready` 属于服务可用性
- 进程能否启动，不应依赖上游服务的瞬时健康状态

### 2. 进程生命周期与服务可用性分开

- `liveness`：进程活着，配置有效，监听端口成功，内部初始化完成
- `readiness`：当前可以安全接流量，关键依赖已可用

原则：

- 进程可以先启动
- `readiness = false` 时不接流量
- 依赖恢复后再变成 `ready`

### 3. migration 是显式步骤，不是 `start` 副作用

禁止把 schema 变更塞进普通 `start` / `start:dev`。

原因：

- 启动失败原因会混杂
- 多实例未来会竞争 migration
- 本地和生产语义不一致
- 破坏服务职责边界

原则：

- 本地编排允许在 `local-up` 中显式执行 migration
- 服务进程只负责启动和提供接口
- 生产环境只允许独立 migration job 或 pre-deploy step 执行 migration

### 4. 数据 ownership 必须服务内聚

每个服务只拥有自己的数据和 migration：

- `auth-service`：auth identities
- `profile-service`：user profiles
- `session-service`：sessions / turns / summaries
- `conversation-service`：当前无持久化真相，未来若加存储也独立管理

禁止新增统一 `db-manager` 服务。

### 5. `clean` 清运行态；是否清本地容器数据取决于模式

`local-clean` 只清理可再生运行痕迹：

- pid files
- dist
- 本地状态快照

host mode 下，`local-clean` 不应：

- 清空数据库
- 删除 seed 数据
- 重置业务现场

`DOCKER=1` 下，`local-clean` 可以清掉本地 Docker volume，用于重建容器化开发环境。

## 顶层本地开发命令

仓库根目录暴露三个顶层命令：

- `make local-up`
- `make local-clean`
- `make local-down`
- `make db-up`
- `make db-down`

这三个命令的语义必须保持稳定。

当前支持两种启动模式：

- 默认 host mode：`make local-up`
- 全容器模式：`make local-up DOCKER=1`
- 数据库独立模式：`make db-up` / `make db-down`

### `make local-up`

职责：

- 把本地环境拉到“可开发状态”
- 可以重复执行
- 不破坏已有业务数据

#### 默认 host mode

默认执行 `make local-up` 时：

- 不自动启动 Docker PostgreSQL
- 只要求当前配置指向的 PostgreSQL 可达
- 在宿主机上运行 `auth/profile/session/conversation/app-server`
- 支持通过 `SKIP=service-a,service-b` 跳过指定服务
- 在当前 terminal 持续输出各服务实时日志
- 同时归档到 `.local/<timestamp>_logs/service.log`
- 同时把本次 `prisma migrate deploy` 的输出聚合到 `.local/<timestamp>_logs/migrations.log`
- `Ctrl+C` 时统一停止宿主机服务

当前实现顺序：

1. 加载默认环境变量与本地覆盖项
   说明：本地配置唯一入口是仓库根目录 `.env.local`，由 `.env.example` 复制得到
2. 创建 `.local/run`
3. 等当前配置指向的 PostgreSQL ready
4. 假定 `auth/profile/session` 三个数据库已经存在
5. 运行 `auth/profile/session` 的 Prisma generate
6. 运行 `auth/profile/session` 的 `prisma migrate deploy`
7. 并行启动 core layer：`auth/profile/session/conversation`
8. 等 core layer 中所有活跃服务的 `/v1/health/ready`
9. 启动 gateway layer：`app-server`
10. 等 `app-server /v1/health/ready`
11. 输出入口地址和环境快照文件
12. 输出本次日志归档目录
13. 保持附着在当前 terminal，持续输出各服务实时日志
14. `Ctrl+C` 时统一停止本地服务

#### `DOCKER=1` 全容器模式

执行 `make local-up DOCKER=1` 时：

- 通过 Docker Compose 启动 PostgreSQL
- 如果 `5432` 已占用，自动选择一个可用的 PostgreSQL host port
- 构建所有服务镜像
- 在容器内运行 `prisma migrate deploy`
- 通过 Docker Compose 启动所有服务
- 支持通过 `SKIP=service-a,service-b` 跳过指定服务
- 在当前 terminal 附着容器日志
- 同时归档到 `.local/<timestamp>_logs/service.log`
- 同时把本次 `prisma migrate deploy` 的输出聚合到 `.local/<timestamp>_logs/migrations.log`
- `Ctrl+C` 时统一停止整套 Compose stack

当前实现顺序：

1. 加载默认环境变量与本地覆盖项
2. 创建 `.local/run`
3. 启动 Docker Compose 中的 PostgreSQL
4. 等 PostgreSQL ready
5. 确保 `auth/profile/session` 三个数据库存在
6. 构建本地服务镜像
7. 在容器内运行 `auth/profile/session` 的 `prisma migrate deploy`
8. 启动 core layer：`auth/profile/session/conversation`
9. 等 core layer 中所有活跃服务的 `/v1/health/ready`
10. 启动 gateway layer：`app-server`
11. 等 `app-server /v1/health/ready`
12. 输出入口地址和环境快照文件
13. 输出本次日志归档目录
14. 保持附着在当前 terminal，持续输出容器实时日志
15. `Ctrl+C` 时统一停止 Docker Compose

约束：

- 使用 `prisma migrate deploy`
- 不使用 `prisma migrate dev` 作为日常启动的一部分
- 不删除数据库数据
- 不自动启动 iOS Simulator
- host mode 只要求当前配置指向的 PostgreSQL 已可连接
- host mode 默认不自动创建数据库；`AUTH_DATABASE_URL`、`PROFILE_DATABASE_URL`、`SESSION_DATABASE_URL` 应指向已存在的数据库
- 如果未在根目录 `.env.local` 里设置服务级数据库 URL，`make local-up` 会直接失败
- host mode 默认使用 `localhost:5432`
- `DOCKER_POSTGRES_PORT` 仅用于 `DOCKER=1` 模式；如果未显式指定，脚本会自动选择一个可用端口
- 如果使用 `SKIP` 跳过了 `auth/profile/session/conversation` 中任意一个服务，则必须同时跳过 `app-server`

### `make db-up`

职责：

- 仅启动 Docker PostgreSQL
- 为本地调试或手工 migration 提供独立数据库入口

当前实现：

1. 强制使用 Docker 模式
2. 启动 `postgres`
3. 等 PostgreSQL ready
4. 幂等创建 `auth/profile/session` 三个数据库
5. 输出当前数据库端口和环境快照

### `make db-down`

职责：

- 仅停止 Docker PostgreSQL

当前实现：

1. 强制使用 Docker 模式
2. 执行 `docker compose stop postgres`

### `make local-clean`

职责：

- 清除本地运行痕迹
- 停止当前本地 runtime
- host mode 下保留外部 PostgreSQL 数据
- `DOCKER=1` 下重置本地 Docker volume

当前实现：

- host mode 下先停止宿主机服务，并对目标端口做 node/npm/npx 白名单清理
- `DOCKER=1` 下执行 `docker compose down -v --remove-orphans`
- 清空 `.local/run/`
- 清空 `.local/<timestamp>_logs/`
- 清理 `apps/*/dist`、`packages/*/dist`

约束：

- host mode 不动外部 PostgreSQL
- `DOCKER=1` 会删除本地 Docker PostgreSQL volume 和容器化数据库数据

### `make local-down`

职责：

- 停止本地编排启动的所有服务和 infra

当前实现顺序：

host mode：

1. 按 `app-server -> conversation-service -> session-service -> profile-service -> auth-service` 停宿主机进程
2. 对目标端口做 node/npm/npx 白名单清理，收掉残留进程

`DOCKER=1` 模式：

1. 执行 `docker compose down`
2. 保留 volume 和数据库数据

约束：

- 默认不带 `-v`
- 不清数据库 volume
- 不清数据库

## `.local/` 目录规范

`.local/` 放在仓库根目录，与 `apps/`、`ios/` 同级。

当前结构：

```text
.local/
├─ 20260420-211530_logs/
│  ├─ app-server.log
│  ├─ auth-service.log
│  ├─ profile-service.log
│  ├─ session-service.log
│  └─ conversation-service.log
└─ run/
   ├─ app-server.pid
   ├─ auth-service.pid
   ├─ profile-service.pid
   ├─ session-service.pid
   ├─ conversation-service.pid
   └─ local.env.snapshot
```

原则：

- 每次 `local-up` 使用新的 `<timestamp>_logs` 目录
- 单次运行内按 service 分文件归档
- `run/` 只存编排层状态，不存业务数据

## 健康检查规范

每个服务至少都必须有：

- `GET /v1/health/live`
- `GET /v1/health/ready`

### `live`

表示：

- 进程已启动
- 配置加载成功
- HTTP server 已监听
- 自身初始化无致命错误

### `ready`

表示：

- 关键依赖已可用
- 当前服务可以安全接收请求

当前依赖关系：

- `auth-service ready`：PostgreSQL 可连接
- `profile-service ready`：PostgreSQL 可连接
- `session-service ready`：PostgreSQL 可连接
- `conversation-service ready`：当前为纯进程级 ready
- `app-server ready`：`auth/profile/session/conversation` 四个下游均 ready

## migration 规范

### 当前阶段

当前已有三个需要管理 schema 的服务：

- `auth-service`
- `profile-service`
- `session-service`

规则：

- `local-up` 中显式执行这三个服务的 migration
- 日常启动统一使用 `prisma migrate deploy`
- 只有开发者主动修改 schema 时，才手动执行 `prisma migrate dev -- --name <migration_name>`

### 为什么 `local-up` 用 `migrate deploy`

因为 `local-up` 的目标是：

- 应用已存在 migration
- 让环境进入可开发状态

而不是：

- 生成新的 migration
- 修改 schema 设计

### 微服务阶段

未来如果新服务引入自己的数据库或 schema，也必须满足：

- 每个服务独立维护自己的 migration 目录
- 不跨服务改别人的表
- 不把 migration 塞进 `start` / `start:dev`
- 生产环境中只允许独立 migration job 或 pre-deploy step 执行 migration

## Realtime 热路径约束

为了控制延迟，realtime 只允许一个窄热路径：

1. iOS 连接 `app-server` 的 `/v1/realtime`
2. `app-server` 验证 bearer token
3. `app-server` 校验 `sessionId` ownership
4. `app-server` 读取一次 profile snapshot
5. `app-server` 把用户 utterance 写入 `session-service`
6. `app-server` 通过 gRPC 调用 `conversation-service` 生成 realtime reply
7. `app-server` 把 assistant turn 写回 `session-service`
8. `app-server` 向客户端回推 websocket event

约束：

- 不要在每个 realtime event 上同步 fan-out 到所有服务
- token 校验和 ownership 校验只做 bootstrap 级别的必要调用
- session 持久化由 `session-service` 负责
- realtime reply 生成由 `conversation-service` 负责
- session 结束时的 summary 编排由 `session-service` 负责，并通过 `profile-service + conversation-service` 生成后落库

## 当前实现文件

- `Dockerfile.local`
- `.dockerignore`
- `Makefile`
- `docker-compose.local.yml`
- `scripts/local/up.sh`
- `scripts/local/down.sh`
- `scripts/local/clean.sh`
- `scripts/local/common.sh`

这些文件组成当前仓库的本地编排基线。
