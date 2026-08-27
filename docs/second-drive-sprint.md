# Second-Drive Sprint

YourPassenger 的两周验证冲刺计划。基于 2026-08-26 对 `feature/livekit-realtime-contract` 分支的逐文件通读。

## 唯一要验证的问题

> 一个经常独自开车的人，在第一次体验之后，**第二次独自开车时会不会主动想起并打开它？**

不是"AI Passenger 有没有商业市场"，也不是"我能不能把 iOS + NestJS + Agent system 做出来"。

如果答案是 No，CarPlay、memory、multi-agent、漂亮 UI 全部没有意义。如果答案是 Yes，哪怕现在只是一个粗糙的 voice prototype，这个 signal 都非常强。

## 前提条件（已确认）

- Apple Developer Program：**已有个人账号且可用**
- 人手：**单人**
- 测试者语言：**中英都有**
- 目标：10 位经常独自开车、单次驾驶 ≥30 分钟的真实用户

## 一句话结论

代码比预期更接近，也比预期更远。

**更接近**：整条 LiveKit 语音链路是真的，不是壳子。iOS 用官方 SDK 连房间、推麦克风、自动播放远端音轨；`chat-agent-service` 真的以 participant 身份加入房间、逐帧读音频、跑 VAD、把整段话发给 OpenAI 转写、拿回复、合成 PCM 再推回房间。`npm run typecheck` 和 `build` 全绿，Swift 代码能编译能链接。

**更远**：`.local/` 里最近一次运行日志中，**没有任何一轮完整的 transcript → reply → TTS**。这条链路写完了，但没有证据显示它整体跑通过一次。

**真正的风险不是技术，是 scope**：六路调研加起来估出约 64 人日的待办，而单人只有 14 个日历日。所以这份计划的主体不是"要做什么"，而是**"要删什么"**。

---

## 一、现状盘点

### 真的能用

| 项 | 说明 |
| --- | --- |
| iOS 七屏流程 + 设计系统 | Auth → Onboarding → Naming → Home → Chat → Summary，扁平 enum 路由。`PassengerTheme` / `PassengerComponents` 完整自洽，profile 的 11 个字段和 8 个枚举与后端对齐 |
| LiveKit iOS 接入 | client-sdk-swift 2.14.0 已通过 SPM 正确挂到 target。连房间 / 推麦克风 / 收数据通道都对。远端音轨靠 `autoSubscribe` 自动播放，不需要写播放代码 |
| LiveKit token 铸造 | `sessions.service.ts` 铸 participant token，房间名 `yp_ses_<id>`，权限 grant 已被现有测试验证 |
| 本地编排 + 编译 | 六服务 + 三 Postgres 的 compose 与 700 行 bash 都能干净启动，migrate 全过 |

### 写完但未验证

| 项 | 说明 |
| --- | --- |
| ASR → LLM → TTS 全链路 | 1003 行手写实现，全部真实调用 OpenAI。首字延迟 3–6 秒、完全串行不流式，且日志里查不到任何一次成功往返 |
| 打断（barge-in） | UI 上的 Interrupt 按钮是装饰品。`turnInProgress` 在整段 TTS 播完前一直为 true，期间用户说的每一句都被丢弃——而且音频在检查这个 flag 之前就已经被扔了 |

### 是假的

| 项 | 说明 |
| --- | --- |
| Apple 登录 | 客户端造一个 `ios-dev-apple-<uuid>`，服务端**任何非空字符串都放行**。既是 App Review 拒审点，也是完整的身份冒充漏洞 |
| 会话摘要 | 字符串模板 `You talked about <用户说的头 120 个字>.`，topics 是把 onboarding 里的兴趣原样回吐。两处 stub（`conversation.service.ts` 和 `sessions.service.ts`），后者更笨且大部分请求命中的是它 |
| Passenger 的名字 | 有一整屏让用户给它取名，取完存进 `UserDefaults`，**从未发给后端**。做了个命名仪式，而它不知道自己叫什么 |

### 不存在

| 项 | 说明 |
| --- | --- |
| 跨会话记忆 | 送进模型的只有 profile + 本次最近 8 轮。历史 summary 从来没有被任何代码查询过 |
| 锁屏后存活 | 全 iOS 工程里 `AVAudioSession` 零命中，没有 `UIBackgroundModes` |
| 公网可达的后端 | `BackendAPIClient.swift:25` 硬编码 `http://localhost:3000/v1`。真机上它指向手机自己 |
| 重连 / 埋点 / 监控 | 双端都只处理 `Disconnected` 且顺手删掉运行时。全仓零 analytics、零 crash reporting、零指标 |
| 可安装性 | deployment target `26.4`（LiveKit 只要 iOS 13）、AppIcon 里 0 个 PNG、无 `DEVELOPMENT_TEAM`、build number 写死为 `1` |
| CI / 生产部署配置 | 无 `.github`、无任何云平台配置文件。唯一的 Dockerfile 是 `Dockerfile.local` |

---

## 二、会杀死这次实验的六件事

按 概率 × 伤害 排序。每条最重要的是"最早能察觉的信号"，不是修复方案。

### 1. 第 14 天，东西根本没到任何人手里

四道互相独立的硬门：签名身份、图标 PNG、build number、deployment target。首次 App Store Connect 配置对新手稳定消耗一整天。

- **最早信号**：第 1 天结束时，自己的手机上还没有从 TestFlight 装下来的包。
- **缓解**：Day 1 就故意推一个半成品上去，只为了证明整条管线通。

### 2. 手机一进兜里，app 就死了

没有 `UIBackgroundModes = audio`。司机锁屏或把手机扣在杯架里，iOS 会在几十秒内挂起进程：音频引擎停、麦克风停、房间断。再加一个来电——全工程没有一处 `AVAudioSession` 中断处理——连前台都恢复不了。

- **最早信号**：自己的第一趟车。如果从没在熄屏状态下测过，就从没测过这个产品。今天就试，十分钟，它一定会失败。

### 3. 它像对讲机，而且打断不了

链路完全串行、完全批处理：800ms 静音判停 → 整段 WAV 上传转写 → 非流式 completion → 整段 TTS 全部 buffer 完 → 才推第一帧。首字 3–6 秒，且回复越长越慢。

- **最早信号**：一趟真车。数一下前五分钟里有多少次想打断它却打断不了。

### 4. 第二次见面，是个陌生人

这条直接杀死要测的那个指标。没有跨会话记忆，第二次会话开场和第一次一模一样；而唯一承载"上次"的界面——摘要页——显示的是字符串模板。它是在开口要第二趟车的那一刻，主动证明它没在听。

- **最早信号**：自己的第二次会话。如果第一反应是"它把我忘了"，实验在第一个测试者出现之前就已经自己回答了。

### 5. 一个隧道，整趟车报废

30–60 分钟的驾驶必然经历多次基站切换和至少一次盲区。SDK 会重连房间，但服务端 agent 只处理 `Disconnected` 并顺手删除运行时，而 app-server 只在创建会话时派发过一次 agent，**连让 agent 重新加入的接口都没有**。结果：手机重连到一个没人在听的房间，麦克风还开着，UI 还写着"正在聆听"。

- **最早信号**：桌上就能复现。开会话，飞行模式 60 秒，关掉。之后说话没有回应＝命中。

### 6. 两周结束，什么都没学到

零埋点。如果十个人里有八个没有第二次，只会拿到十条轶事，却不知道原因是延迟、断线、被系统挂起，还是单纯无聊。

- **最早信号**：第 14 天有人问"为什么没回来"，而诚实的回答是耸肩。

---

## 三、删除清单

两周里最高杠杆的两个动作都是删除，不是构建。

| 删掉 | 换成 | 省 |
| --- | --- | ---: |
| `chat-agent.service.ts`（1003 行）+ `voice-activity-detector.ts` + 手写 RIFF 头 + `POST /v1/agents/sessions` 派发链路 | `@livekit/agents` worker + `@livekit/agents-plugin-openai` 的 `RealtimeModel`，约 60 行。流式 ASR、流式 TTS、服务端 VAD、原生 barge-in 全部变成依赖项。**iOS 一行都不用改** | +9d |
| 整条 WebSocket transport：服务端 gateway + orchestrator，iOS 的 `RealtimeWebSocketClient`、`MockAPIClient`，以及 `LiveChatView` 里三句写死的"丝绸之路"罐头台词 | 没配 LiveKit 就**启动失败**。这条路给用户送的是静音（`audioPayload` 两处硬编码为空串），它不是 fallback，是负债 | +2d |
| gRPC hot path：`conversation-hot-path.proto` + gRPC controller + 三个 grpc 依赖 | 一次函数调用。这个延迟优化挂在那条不传音频的死路上——而那条路正要被删 | +0.5d |
| Apple 登录两端 + 那个假按钮 | 只留 guest + token 加 `exp` + 换 Keychain（2 小时，不是 3 天） | +2.5d |
| 文档里那套 memory 设计：confidence 阈值、`pending/active/rejected` 生命周期、`ProfileUpdateCandidate`、sensitivity 分级、evidence 链 | 一张 `UserMemory(userId, text, sessionId, createdAt)` + 最近 3 条 summary 进 prompt | +3.5d |
| 三个纯模板的 Xcode 测试、把完整响应体（含 access token）打进日志的 `print`、失效的 ATS 设置 | 删除 | +0.5d |
| **整条 external TestFlight 轨**（见下） | internal testing，10 人远低于 100 人上限，**不需要 Beta App Review** | +1.5d |

净省约 **19–20 天**。这个 sprint 只有在删完之后才是可行的。

### 明确不做的重构

有分析主张把六个服务合并成单进程、三个 Postgres 合成一个，说能省 3 天。**这两周不做。**

理由：compose 已经能干净启动，部署到一台 VM + Caddy 是半天的事；合并是两天纯重构，用户一点都看不见。它想解决的两个问题会自己消失——那个会掐死 LLM 请求的 4 秒超时，随着 `RealtimeModel` 直连 OpenAI 一起被删掉；内部服务不鉴权的问题，用"compose 不把 3101–3105 publish 到宿主机"就够了，零成本。

这笔重构值得做，但值得在有了十个用户**之后**做。

### 为什么砍掉 external TestFlight

10 个人完全装得下 internal testing 的 100 人上限，而 internal **不需要 Beta App Review**。整条 external 轨可以删掉：App Privacy 问卷、24–48 小时审核等待、"周一到周三提交"的日历约束、以及被拒一轮的风险，全部消失。

代价：internal tester 必须被加成 App Store Connect 用户（要有 Apple 账号、接受邀请、能看到 ASC）。对 10 个亲自挑的人来说这是可接受的小摩擦。

隐私政策仍然值得花 30 分钟挂个 GitHub Pages——毕竟在录别人的谈话——但它不再是阻塞项。

---

## 四、十四天

### Day 0（半天）

- **先 git commit**。`apps/chat-agent-service/` 整个目录还没进版本库，另有 71 个文件未提交——最重要的一千行代码目前没有任何备份。
- Xcode → Settings → Components 开始下载 iOS platform。**项目现在根本 build 不了**（iOS 26.5 未安装），这是好几个 GB。
- 注册 bundle id（`zqh.PassengerClient` 直接用），建 App Store Connect record，Xcode 里打开自动签名把 `DEVELOPMENT_TEAM` 写进工程。麦克风和后台音频**都不需要 App ID capability**，它们只是 Info.plist 的 key。
- **用纯文本改 persona prompt**。现在是 `"You are Passenger, a concise voice companion... Keep replies short, useful"`——那是个助理，不是同行者。它不提问、没有观点、除非被问否则不说话。

> 最后这条是整两周里产品杠杆最高的半天，零成本、不依赖任何基础设施。先在 curl 里读十轮。如果不想再听三十分钟，后面所有延迟优化都救不了它。

### Day 1 — iOS 出货前置 + 当天推第一个包

- deployment target `26.4 → 17.0`（四处）。LiveKit 的下限是 iOS 13，这个门槛是自己设的。
- 一张 1024×1024 PNG，sRGB，无 alpha，不预先圆角。
- 建**真正的 `Info.plist`**：`UIBackgroundModes = [audio]`。`INFOPLIST_KEY_` 那套机制表达不了这个 key——这也是为什么现在那条 ATS 设置是完全失效的。顺手加 `ITSAppUsesNonExemptEncryption = NO`，省掉每次上传都卡在 "Missing Compliance"。
- 加 `PrivacyInfo.xcprivacy`（用了 `UserDefaults`，否则首次上传必收 ITMS-91053）。
- 删掉假的 Apple 按钮、删 `MockAPIClient`、删打印 token 的两行 `print`。
- `RootView` 的空态死路加 `else` 分支和返回按钮（现在渲染一屏空白，只能强杀）。
- 麦克风权限预检 + 被拒后跳 Settings。现在失败被 `print` 吞掉，然后仍然把 `isConnected` 设成 true，UI 继续显示"正在免提聆听"。
- build number 归档时覆盖：`CURRENT_PROJECT_VERSION=$(date +%Y%m%d%H%M)`。
- **当天 Archive → 上传 → internal testing → 装到自己手机上。**

> 这一天的目的不是功能，是证明整条出货管线通。一旦 Day 1 完成，风险 #1 基本被拆掉。

### Day 1.5 — Spike：go / no-go

- 验证 `@livekit/agents` + `RealtimeModel` 能加入房间并说上话。已确认这套 JS 框架和 OpenAI Realtime 插件是现役的，`user_input_transcribed` 事件可以拿来落 transcript。
- 不通就换 Python worker——同一套架构，只换语言。

> 这是唯一一个必须在 Day 2 之前拿到答案的技术决策。半天，别超。

### Day 2–3 — 换掉语音的大脑

- 删 `chat-agent.service.ts` 和 `voice-activity-detector.ts`，换成 `AgentSession` + `RealtimeModel`。
- 改用 automatic dispatch，于是 `chat-agent-client.service.ts` 和 `sessions.service.ts` 里那个阻塞的 `await` 一起删掉——现在 LiveKit 一慢，用户连会话都开不了。
- transcript 事件 → 写 `SessionTurn`。
- profile + passenger 名字 + 最近 3 条 summary → 拼进 `instructions`。
- instructions 里加一句"用户说什么语言就用什么语言回"（见"语言"一节）。

> 首字延迟 3–6 秒 → 亚秒，barge-in 从"装饰按钮"变成默认行为，同时净删掉约六百行。如果这两周只做一件工程上的事，做这件。

### Day 4 — 上公网

- 一台 VM，Caddy 自动 TLS，现有 compose 起在后面，**只暴露 443**。现在 3101–3105 全部 publish 到宿主机，而且它们从 body 或 query 里直接读 `userId`，不做任何鉴权——一个开放的安全组就等于所有测试者的完整通话记录公开可读。
- iOS baseURL 走 xcconfig 或 `#if DEBUG`，删掉失效的 ATS 设置。
- 生产环境务必配好 `LIVEKIT_*`，并给 OpenAI 设置消费上限。
- 验收标准只有一条：手机用**蜂窝网**（不是同一个 wifi）能打通 `GET /v1/me`。

### Day 5 — 自己开一趟车，一小时

- 锁屏。把手机扣在杯架里。接一个电话。过一个隧道。连一次车载蓝牙。
- 今天不修任何 feature。只记两栏：哪一刻让你觉得**"车上有个人"**，哪一刻让你觉得**"这还是 ChatGPT"**。

> 这是 product design 问题，不是工程问题。只有自己开过之后，后面该修什么才是由证据决定而不是由猜测决定。

### Day 6 — 记忆闭环

**唯一真正制造"第二次"的东西。**

- session end 换成一次结构化输出的 LLM 调用：`{summary, topics, memoryFacts}`。删掉两处模板 stub。
- 一张 `UserMemory` 表。
- 下次开场把最近 3 条 summary 拼进 instructions——一个 `findMany({ take: 3, orderBy: { createdAt: 'desc' } })`。
- 把 passenger 的名字发到后端，加进 `UpdateProfileRequest`。

> 一次 LLM 调用同时解决摘要屏和记忆两件事。这是整张清单上唯一**制造**第二次驾驶的条目，其余所有条目只是**允许**第二次发生。

### Day 7 — 埋点 + 生命周期

- 埋点：每轮一行 JSON `{sessionId, ttfaMs, turnMs, interrupted, transcriptLen}`；每次会话结束 `{durationSeconds, turnCount, disconnects, batteryDelta}`。电量差值从 iOS 端塞进现有的 end 请求体里，五行 Swift。
- 会话结束时让 agent 离开房间。现在每一次会话都永久泄漏一个 LiveKit 连接、一个读取循环和一段音频缓冲。
- iOS 给一个诚实的连接状态 + 一个"重新连接"按钮。**只做这个按钮（2 小时），不做完整的 `Reconnecting`/`Reconnected` 状态机（1 天）。** 重开一个 session 比恢复差，但那是一个按钮 vs 一天。

### Day 8–9 — 自己再开两趟，各一小时

修自己讨厌的地方。

> 这两天是整张表上最值钱的两天，也是最容易被前面延期吃掉的两天。**被吃掉的顺序应该是先砍记忆之外的一切，最后才动这两天。** 如果 Day 7 到了而语音改写还没通，砍掉记忆和重连也要保住这两天，然后送一个至少能在锁屏下活着的对讲机出去。

### Day 10 — 招人

- 10 位：经常独自开车、单次 ≥30 分钟、已经在用 ChatGPT/Claude、愿意讲话、有明显兴趣领域。
- 加成 App Store Connect 用户，发 internal 邀请。
- 说明书就一段：*请插电；别放在挡风玻璃下暴晒；开始和结束都在停车状态下操作，路上不要碰屏幕。*

> 最后那条是测试纪律，不是产品限制——要验证的是免提同行者，不是驾驶界面。

### Day 11–13 — 第一批真实驾驶

每趟结束**一小时内**问四个问题：

1. 哪一个 moment 最自然？
2. 哪一个 moment 让你最明显觉得"这是 AI"？
3. 有没有什么时候你希望它闭嘴？
4. 你下一次什么情况下会主动打开它？

不要问"你会不会用"——人很容易礼貌回答 Yes。

**不要提醒他们第二次用。** 第二次是不是自发的，就是全部答案。

### Day 14 — 读日志，数第二次

---

## 五、要盯的数

### 产品指标

| | 指标 | 说明 |
| --- | --- | --- |
| **M1** | **第二次驾驶主动激活率** | 10 个人里有几个，在没有被提醒的情况下，第二次独自开车时自己打开了它。**唯一真正重要的数** |
| M2 | 首次会话完成率 | 有多少人聊到 ≥20 分钟，且不是因为技术故障被迫结束 |
| M3 | 会话时长 | 不是越长越好。有意义的是"本来打算试 10 分钟，最后聊了 40 分钟" |
| M4 | 无提示的正面行为 | "它居然记得我上次…"、"能不能让它以后…"、"我朋友也常跑长途，能发给他吗" |
| M5 | Would-you-miss-it | 四档，不是 1–10 分：无所谓 / 有一点可惜 / 很可惜 / 我会去找替代品。只有后两档是信号 |

### 技术指标（没有这两个，上面五个解释不了自己）

| | 指标 | 说明 |
| --- | --- | --- |
| T1 | 每轮首字延迟 p50 / p95 | 解释 M2 和 M3。低于 1 秒是"有个人"，3 秒以上是对讲机 |
| T2 | 每次会话断线次数 | 解释所有提前结束的会话。没有这个数，"他不喜欢"和"它断了"长得一模一样 |

### 成功标准

10 个目标用户，两周结束时：

- ≥6 个愿意第二次用
- ≥3 个主动要求某个 feature
- ≥2 个表示产品消失会明显觉得可惜
- ≥1 个主动推荐给其他人

达到 → Continue，再做更正式的 4–6 周 MVP。

只有 1–2 个第二次用 → 不要立刻继续开发，先 reframe：可能驾车不是正确场景，可能 AI companion 没有足够区别，也可能用户更想要 podcast-like content 而不是 conversation。

### 另一套数据

这同时是一次 Odyssey Prototype。每天晚上给这七项各打 1–5 分：

| 项目 | 1–5 |
| --- | --- |
| 想产品体验 | |
| 写代码 | |
| 和用户聊天 | |
| 看别人使用 | |
| 根据 feedback 改产品 | |
| 找测试用户 | |
| Desire to continue | |

两周之后这张表会比产品指标更早给出一个答案。

---

## 六、语言

`preferredLanguage` 已经在 Prisma schema 和 Swift model 里（默认 `"en"`），但 **onboarding 从来没问过**。

**保持不问。** 双语司机会在一句话里切换语言，选择器反而会选错。OpenAI Realtime 是端到端语音模型，天然按 utterance 自动识别语言——instructions 里加一句"用户说什么语言就用什么语言回"就够了，零成本，比选择器更好。

**现在就生效的坑**：`.env.local` 里 `OPENAI_STT_LANGUAGE="zh"` 是全局固定值，英语测试者**今天就会被系统性转写错**。如果在 Day 3 改写完成之前想先开车试试，先把这个值取消掉。

这也是 Day 2–3 那次改写的又一个理由：多语言在新链路里是免费的，在旧链路里是个写死的 env。

---

## 七、三个现在就该知道的坑

### 没配 LiveKit 时会静默降级

`sessions.service.ts` 在 `LIVEKIT_*` 缺失时不报错，而是悄悄返回 WebSocket transport——那是一个只会说三句"丝绸之路"的文字机器人，没有 ASR、没有音频输出。而且 `/v1/health/ready` 仍然返回健康，因为 chat-agent 用的是 `AlwaysReadyProbe`。

**验收方式：手动看一次 `POST /v1/sessions` 的响应体里 `transport` 是不是 `"livekit"`。**

### 秘钥

`.env.local` 里有真实的 OpenAI key 和 LiveKit secret。好消息是它已被 gitignore 且从未提交过。

别把它 bake 进镜像，部署时用环境变量注入，并立刻在 OpenAI 后台设一个消费上限——现在代码里没有任何速率或成本约束，而 `POST /v1/auth/guest` 可以无限创建身份。

### ASR / TTS 的 fetch 没有任何超时

LLM 那一跳反而有个会误杀正常请求的 4 秒超时。一个卡住的 OpenAI 连接会让那个房间永久失聪 300 秒：没有报错、没有状态变化、麦克风还开着，用户在对空气说话。

这两个问题都随 Day 2–3 的改写一起消失，但在那之前它们是真实的。

---

## 八、明确推迟的事

| 推迟项 | 什么时候补 |
| --- | --- |
| 真的 Sign in with Apple + Apple JWKS 验证 | 上架 App Store 之前。**这是有到期日的技术债，不是永久决定** |
| Keychain token 存储、token 过期、refresh 流程 | 同上（token `exp` 和 Keychain 这两小件在 Day 1 顺手做掉） |
| 完整 memory 系统（confidence 阈值、pending/rejected、`ProfileUpdateCandidate`、sensitivity、用户可见的记忆管理） | 用户数超过 10 且知道哪些 fact 真的有用之后 |
| 服务间鉴权、ValidationPipe、限流 | 用"compose 不暴露内部端口"顶两周 |
| 微服务合并、三库合一 | 十个用户之后 |
| 账号删除（App Store 5.1.1(v) 硬性要求） | 上架之前 |
| AI 内容审核（Guideline 1.2） | 上架之前 |
| 水平扩展、压测、CI | 有超过 10 个用户之后 |
| Bluetooth 检测、自动驾驶检测、CarPlay | 本次验证之外 |

---

## 参考

- [Core voice interaction and user memory business design](core-voice-memory-business.md) — 完整设计目标（本 sprint 只实现其中最小子集）
- [MVP pages and public API contract](mvp-pages-and-apis.md) — 当前公开 API
- [Local development and microservice workflow](local-development-and-microservice-workflow.md)
