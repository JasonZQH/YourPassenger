# 本地开发与微服务编排规范

## 目标

本文档定义两件事：

1. 当前仓库在本地开发环境下的标准启动、清理、关闭方式。
2. 当前模块化单体后端向微服务架构演进时，应保持的编排、健康检查、迁移和低耦合原则。

本文档的目标不是一次性把当前仓库改造成完整微服务系统，而是先把本地开发环境和未来演进路径定成稳定规范。

## 当前状态与目标状态

### 当前状态

当前仓库实际运行形态是：

- `ios/`：iOS Client，由 Xcode / Simulator 运行
- `backend/`：单个 NestJS 后端进程
- PostgreSQL：本地开发数据库

后端虽然已经分成 `auth / profile / sessions / realtime / conversation / prisma` 等模块，但它们仍然运行在同一个 Nest 进程中。

因此，当前架构更准确地说是：

- 微服务导向的模块化单体
- 不是完整的运行态微服务系统

### 目标状态

未来如果拆分服务，目标运行态应当演进为：

- `api-gateway` 或 `edge-api`
- `auth-service`
- `profile-service`
- `session-service`
- `conversation-service`
- 独立的 infra 依赖，如 `postgres / redis / nats` 等

拆分后，每个 service 都应具备：

- 独立启动能力
- 独立 `liveness` / `readiness`
- 独立 migration 管理
- 独立日志
- 独立环境变量
- 独立的数据所有权

## 核心原则

### 1. 编排顺序允许存在，但不要写成服务进程的硬启动门槛

合理：

- `local-up` 先起 PostgreSQL
- 再跑 migration
- 再起 backend
- 未来可扩展为按顺序起多个 service

不合理：

- service 自己在启动逻辑里要求“另一个 service 先 healthy，否则直接退出”

原则：

- 顺序属于编排层
- `ready` 属于服务可用性
- 进程能不能起来，不应依赖上游服务的瞬时健康状态

### 2. 进程生命周期与服务可用性必须分开

- `liveness`：进程活着，配置有效，监听端口成功，内部初始化完成
- `readiness`：服务当前可以安全接流量，关键依赖已可用

原则：

- 进程可以先起来
- `readiness = false` 时不接流量
- 依赖恢复后再变成 `ready`

### 3. migration 是显式步骤，不是服务启动副作用

禁止把 schema 变更塞进普通 `start` / `start:dev`。

原因：

- 启动失败原因会混杂
- 多实例未来会竞争 migration
- 本地和生产语义不一致
- 破坏了服务职责边界

原则：

- 本地编排可在 `local-up` 中显式执行 migration
- 服务进程本身只负责启动和提供接口
- 生产环境只允许独立 migration job 或 pre-deploy step 执行 migration

### 4. `clean` 不碰业务持久化数据

`local-clean` 只清理可再生运行痕迹：

- logs
- pid files
- dist
- 临时状态文件

`local-clean` 不应：

- 清空数据库
- 删除 volume
- 删除 seed 数据
- 重置业务现场

如果后续需要“删库重建”，应单独引入：

- `make local-reset`
- 或 `make db-reset`

## 顶层本地开发命令约定

当前仓库对外只暴露三个顶层命令：

- `make local-up`
- `make local-clean`
- `make local-down`

这三个命令的语义必须长期稳定。

### `make local-up`

职责：

- 把本地环境拉到“可开发状态”
- 可以重复执行
- 不破坏已有业务数据

当前阶段推荐执行顺序：

1. 检查 `backend/.env.local` 或 `backend/.env`
2. 创建 `.local/logs` 和 `.local/run`
3. 启动本地 infra（当前至少 PostgreSQL）
4. 等 PostgreSQL ready
5. 执行 `backend` 的 Prisma generate
6. 执行 `backend` 的 migration deploy
7. 启动 `backend` dev server
8. 等待 `backend` health ready
9. 输出日志位置、PID 文件位置、访问地址

约束：

- 使用 `prisma migrate deploy`
- 不使用 `prisma migrate dev` 作为日常启动的一部分
- 不删除数据库数据
- 不自动启动 iOS Simulator

### `make local-clean`

职责：

- 清除本地运行痕迹
- 方便下一次本地启动保持干净日志和状态文件

建议清理范围：

- `.local/logs/*`
- `.local/run/*`
- `backend/dist`
- 明确的临时文件

约束：

- 不停数据库
- 不删 volume
- 不删数据库数据
- 不杀掉 docker compose

### `make local-down`

职责：

- 停止本地编排启动的所有服务和 infra

当前阶段推荐执行顺序：

1. 根据 `.local/run/backend.pid` 停掉 backend dev server
2. 执行 `docker compose down`
3. 保留 volume 和数据库数据

约束：

- 默认不带 `-v`
- 不清日志
- 不清数据库

## `.local/` 目录规范

`.local/` 放在仓库根目录，与 `backend/`、`ios/` 同级。

推荐结构：

```text
.local/
├─ logs/
│  └─ backend.log
└─ run/
   ├─ backend.pid
   └─ local.env.snapshot
```

未来扩展到多 service 时：

```text
.local/
├─ logs/
│  ├─ gateway.log
│  ├─ auth.log
│  ├─ profile.log
│  ├─ session.log
│  └─ conversation.log
└─ run/
   ├─ gateway.pid
   ├─ auth.pid
   ├─ profile.pid
   ├─ session.pid
   ├─ conversation.pid
   └─ local.env.snapshot
```

### `logs/`

按 service 分文件，不混写。

当前最少应支持：

- `.local/logs/backend.log`

### `run/`

用于存放编排层状态，不存业务数据。

当前最少应支持：

- `backend.pid`：backend 宿主机进程号
- `local.env.snapshot`：本次 `local-up` 实际采用的关键环境快照

## 健康检查规范

### 当前 backend

当前阶段，`backend` 至少应有：

- `GET /v1/health/live`
- `GET /v1/health/ready`

如果当前仓库暂时只有一个健康接口，也应以此为下一步演进方向。

### 语义定义

#### `live`

表示：

- 进程已启动
- 配置加载成功
- HTTP server 已监听
- 自身初始化无致命错误

#### `ready`

表示：

- 关键依赖已可用
- 当前服务可以安全接收请求

对于当前单 backend，`ready` 至少应考虑：

- PostgreSQL 可连接
- Prisma 可正常访问数据库

### 微服务阶段的约束

未来拆分后：

- 每个 service 都必须同时提供 `live` 和 `ready`
- 编排层等待 `ready`
- 服务自身不应因为“别的 service 暂时 not ready”而直接退出进程

## migration 规范

### 当前阶段

当前只有一个 backend，因此 migration 规则如下：

- `local-up` 中允许显式执行 `backend` migration
- 日常启动统一使用 `prisma migrate deploy`
- 只有在开发者主动修改 schema 时，才手动执行 `prisma migrate dev -- --name <migration_name>`

### 为什么 `local-up` 用 `migrate deploy`

因为 `local-up` 的目标是：

- 应用已存在 migration
- 让环境进入可开发状态

而不是：

- 生成新的 migration
- 修改 schema 设计

`migrate deploy` 的优点：

- 可重复执行
- 不会偷偷生成 migration 文件
- 更接近生产部署语义

### 微服务阶段

未来拆分后，每个 service 必须只管理自己的 schema 变更。

要求：

- 每个 service 有自己的 migration 入口
- 每个 service 只修改自己拥有的数据结构
- 不允许多个 service 共享一组表然后分别管理 migration

推荐演进方向：

- 每个 service 至少独占自己的 schema
- 理想状态下每个 service 独占自己的数据库

## Makefile 设计规范

### 顶层设计目标

Makefile 只负责统一入口和编排，不负责承载复杂业务逻辑。

原则：

- Makefile 做 orchestration
- 复杂逻辑放到 `scripts/local/*.sh`
- 长期运行进程通过脚本后台启动并写 pid/log

### 推荐文件结构

```text
Makefile
docker-compose.local.yml
scripts/
└─ local/
   ├─ up.sh
   ├─ down.sh
   ├─ clean.sh
   ├─ check_backend_env.sh
   ├─ wait_for_postgres.sh
   └─ wait_for_http.sh
```

### 顶层 Makefile 入口

推荐公开目标：

- `local-up`
- `local-clean`
- `local-down`

建议实现形态：

```make
.PHONY: local-up local-clean local-down

local-up:
	./scripts/local/up.sh

local-clean:
	./scripts/local/clean.sh

local-down:
	./scripts/local/down.sh
```

理由：

- 顶层命令稳定
- 复杂逻辑不塞进 Makefile
- 未来多 service 扩展时改脚本即可

## `scripts/local/` 的职责边界

### `up.sh`

负责：

- env check
- 创建 `.local/`
- docker compose up
- wait for postgres
- prisma generate
- prisma migrate deploy
- 启动 backend dev server
- 记录 pid
- 等待 health ready

### `clean.sh`

负责：

- 清 `.local/logs/*`
- 清 `.local/run/*`
- 清 `backend/dist`
- 保留数据库和 docker 状态

### `down.sh`

负责：

- 优雅停止 backend 进程
- 执行 `docker compose down`
- 不加 `-v`

### `check_backend_env.sh`

至少检查：

- `DATABASE_URL`
- `AUTH_TOKEN_SECRET`
- 可选的 `PORT`

目标：

- 缺配置时尽快失败
- 给出明确报错，而不是等到 Nest 启动后再模糊失败

### `wait_for_postgres.sh`

职责：

- 等待 PostgreSQL 进入 ready
- 超时则退出并报错

### `wait_for_http.sh`

职责：

- 轮询某个 health endpoint
- ready 后返回成功
- 超时则退出并报错

## docker compose 规范

### 当前阶段

`docker-compose.local.yml` 当前建议只管理 infra：

- PostgreSQL
- 可选 pgAdmin
- 未来可扩展 Redis / NATS

当前不建议把 backend dev server 放进 docker，原因：

- 本地热重载体验更差
- 日志和断点调试不如宿主机直接启动清晰
- iOS 联调阶段宿主机 `localhost:3000` 更直接

### 微服务阶段

未来如需多 service 本地联调，可继续保持：

- infra 用 docker compose
- app services 先在宿主机热重载运行

如果服务数量继续增加，再评估：

- `Procfile.dev`
- `overmind`
- `foreman`

但不建议过早引入复杂多进程开发编排。

## 当前阶段的推荐实现步骤

### Phase 1: 规范化当前单 backend 本地开发

目标：把当前仓库变成一个“标准 service 模板”。

步骤：

1. 新增根目录 `Makefile`
2. 新增 `docker-compose.local.yml`
3. 新增 `scripts/local/` 目录和脚本
4. 新增 `.local/` 约定并加入 `.gitignore`
5. 为 backend 增加 `live` / `ready` 健康接口
6. 让 `make local-up/local-clean/local-down` 可用

### Phase 2: 将当前 backend 视为单一可编排 service

目标：在不真正拆服务之前，先把 backend 当作未来服务模板。

backend 应具备：

- 独立 env check
- 独立 migration 入口
- 独立 health 语义
- 独立日志和 pid 记录

这一步的价值在于：

- 未来拆出 `auth-service`、`session-service` 时可以沿用相同模式
- 本地开发命令不用重写设计

### Phase 3: 逐步拆分微服务

只有在这些条件满足后，才建议继续拆分：

- 当前 realtime conversation 主路径稳定
- health / migration / logs / env 规范已经落地
- 本地开发编排已经可重复运行

拆分顺序建议：

1. 优先拆边界最清晰的服务
2. 每拆一个服务，就补齐：
   - `live`
   - `ready`
   - migration
   - 日志
   - 本地启动脚本
3. 只在编排层增加依赖顺序，不在服务内部写死“别人没 ready 我就退出”

## 未来微服务阶段的 `local-up` 演进方式

当服务真正拆分后，`make local-up` 的内部步骤可以演进为：

1. `docker compose up -d` 启动 infra
2. wait for postgres / redis / nats
3. `auth-service` migrate deploy
4. `profile-service` migrate deploy
5. `session-service` migrate deploy
6. 启动 `auth-service`
7. wait `auth-service` ready
8. 启动 `profile-service`
9. wait `profile-service` ready
10. 启动 `session-service`
11. wait `session-service` ready
12. 启动 `conversation-service`
13. wait `conversation-service` ready
14. 输出所有 service 的日志路径和端口

注意：

- 这是编排顺序，不是服务内部硬编码依赖
- 某个 service 可以启动但暂时 not ready
- readiness 决定是否接流量

## 最终建议

当前仓库不应直接跳到“先做一整套完整微服务运行时”。

更合理的路径是：

1. 先把当前 backend 做成标准化可编排 service
2. 先落地 `make local-up / local-clean / local-down`
3. 先补齐 `live / ready / migration / logs / pid / env check`
4. 在 realtime conversation 主路径稳定后，再开始拆分微服务

一句话总结：

- 当前按单 backend 设计编排
- 语义按未来微服务标准定死
- 编排顺序可以有
- 服务启动硬门槛不要有
- `clean` 不碰数据库
- migration 显式执行，不做启动副作用
