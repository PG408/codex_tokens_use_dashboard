# Codex Token 使用仪表盘 MVP 设计

## 结论

本项目的 MVP 应构建为一个本地只读分析型 Web App：后端扫描 Codex 本机会话 JSONL，生成项目内派生数据；前端提供“总览优先”的仪表盘，用于按时间、session、Prompt 三种粒度理解 Codex App 的 token 使用情况。

MVP 不读取远程服务，不修改 Codex 原始文件，不依赖 Codex App 内部 UI 状态。其核心边界是：原始数据只读，派生数据可重建，刷新由用户手动触发。

## 已确认口径

### 数据源

MVP 主数据源是：

`/Users/bytedance/.codex/sessions/**/rollout-*.jsonl`

只读取以下事件：

- `session_meta`：用于识别 session，读取 `id`、`timestamp`、`cwd`、`originator`、`model_provider` 等元信息。
- 用户输入事件：用于划分 Prompt 边界。
- `event_msg.payload.type = "token_count"`：用于读取 token 使用量。

暂不作为 MVP 数据源：

- `/Users/bytedance/.codex/logs_2.sqlite`：该库是通用日志库，当前没有比 JSONL 更直接的 token 归因口径。
- `/Users/bytedance/Library/Application Support/com.openai.chat/**`：该目录包含 App 本地状态，但结构更不稳定，MVP 不需要依赖。

### Token 字段

MVP 使用 `token_count` 事件中的 `last_token_usage` 作为每次模型调用增量，字段包括：

- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `total_tokens`

`total_token_usage` 只用于校验同一 session 内增量求和是否一致，不作为主展示来源。

输入缓存命中率定义为：

$$
\mathrm{input\ cache\ hit\ rate} = \frac{\mathrm{cached\ input\ tokens}}{\mathrm{input\ tokens}}
$$

当 `input_tokens = 0` 时，该比率展示为空值而不是零。

### Prompt 粒度

用户定义的 Prompt 是“一次用户输入”。在一个 session 内：

- 每条用户输入开启一个 Prompt 区间。
- 从该用户输入之后，到下一条用户输入之前出现的全部 `token_count.last_token_usage`，均归并到该 Prompt。
- 一个 Prompt 可包含多次模型调用。
- 若文件开头出现 token 事件但尚未观察到用户输入，则归入一个 `unattributed` 区间，用于诊断，不进入默认 Prompt 榜单。

Prompt 展示默认只保存摘要，不保存完整输入文本。摘要取用户输入的前 80 到 120 个字符。MVP 的搜索仅搜索该摘要；若后续需要完整文本搜索，应先增加“是否保存完整 Prompt 文本”的显式开关。

## 成功标准

MVP 交付后应能回答以下问题：

1. 最近一段时间 Codex 的 input、cached input、output、reasoning output 和 total token 总量是多少。
2. 输入缓存命中率随时间如何变化。
3. 哪些 session 消耗最多 token。
4. 哪些用户输入触发了最高 token 成本。
5. 手动刷新后，新产生的 Codex 会话数据能被重新扫描并反映到仪表盘。

## 架构

### 推荐方案

采用 Node/TypeScript 本地服务与 React/Vite 前端：

- `collector`：扫描 JSONL 文件列表，识别新增或变更文件。
- `parser`：解析 JSONL 行事件，输出 session、Prompt、token call 三层标准记录。
- `store`：写入项目内 SQLite 派生库。
- `api`：提供汇总、趋势、session 排名、Prompt 明细查询。
- `ui`：展示总览优先仪表盘。

该方案的理由是文件系统访问自然、类型边界一致、后续添加轮询刷新成本低。

### 替代方案

Python/FastAPI + React 适合数据分析，但技术栈分裂，MVP 复杂度偏高。

纯静态前端 + 文件选择器最轻，但不能自动扫描历史目录，无法满足监控本机 Codex 使用情况的主要目标。

## 数据模型

### Session

`sessions` 表保存每个 JSONL session 的稳定元信息：

- `session_id`
- `source_file`
- `started_at`
- `cwd`
- `originator`
- `model_provider`
- `cli_version`
- `last_seen_at`

### Prompt

`prompts` 表保存用户输入粒度聚合：

- `prompt_id`
- `session_id`
- `turn_id`
- `started_at`
- `prompt_preview`
- `call_count`
- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `total_tokens`

### Token Call

`token_calls` 表保存每次 `token_count.last_token_usage`：

- `call_id`
- `session_id`
- `prompt_id`
- `occurred_at`
- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `total_tokens`

MVP 手动刷新采用全量重建派生库，不实现文件级增量扫描状态。若后续性能不足，再增加 `scan_state` 之类的文件级扫描状态表。

## UI 设计

采用已确认的 A 方案：总览优先。

### 首屏结构

顶部为筛选与刷新区：

- 时间范围
- session 下拉筛选
- Prompt 摘要搜索
- 手动刷新按钮
- 最近刷新时间

第一层为 KPI：

- total tokens
- input tokens
- cached input tokens
- output tokens
- reasoning output tokens
- input cache hit rate
- session count
- prompt count

第二层为时间趋势：

- 按小时或天聚合 token。
- 同图展示 input、cached input、output。
- 缓存命中率可作为独立小图或右侧指标，不与 token 绝对值混在同一轴上。

第三层为钻取：

- 左侧 session 排名表，按 total tokens 降序。
- 右侧 Prompt 明细表，展示时间、session、Prompt 摘要、模型调用次数、token 拆解、缓存命中率。

## 交互

MVP 只保留必要交互：

- 点击“刷新”触发重新扫描。
- 修改时间范围后刷新查询结果。
- 选择 session 后过滤趋势和 Prompt 明细。
- 搜索 Prompt 摘要。
- Prompt 表支持按 total tokens、input tokens、output tokens、cache hit rate 排序。

不在 MVP 中实现：

- 自动轮询。
- 成本金额估算。
- 多模型价格配置。
- 告警。
- 导出报表。
- 跨机器同步。

## 隐私与安全

本 app 只在本机运行。后端读取 Codex JSONL 时必须只读打开原始文件，不写回、不移动、不删除。

派生 SQLite 存在项目目录内。默认不保存完整用户输入，只保存 Prompt 摘要。这样可以降低把敏感 Prompt 二次扩散到新数据库的风险。

前端不得展示 `base_instructions`、tool output 全文或完整 session 原始内容。MVP 的目标是 token 使用监控，不是会话内容浏览器。

## 验证计划

### 解析验证

使用当前真实 JSONL 样本验证：

- 能读取 `session_meta`。
- 能识别 `token_count` 事件。
- 同一 session 中所有 `last_token_usage.total_tokens` 求和，应等于最后一次 `total_token_usage.total_tokens`。
- Prompt 聚合后的 token 总量，应等于该 session 中已归因 token call 的总量。

### API 验证

测试以下查询：

- 总览 KPI。
- 时间趋势。
- session 排名。
- Prompt 明细筛选与排序。

### UI 验证

用本地浏览器验证：

- 初次打开可见总览数据。
- 点击刷新后状态更新。
- 时间、session、Prompt 搜索过滤有效。
- 桌面与移动宽度下不发生横向溢出或文本遮挡。

## 未来扩展

MVP 完成后可扩展：

- JSONL 增量扫描和近实时轮询。
- 完整 Prompt 保存开关。
- 按 cwd、model provider、originator 聚合。
- token 到费用的估算模型。
- 每日/每周使用趋势报告。
- 阈值告警。

这些扩展均应建立在当前三层数据模型之上，而不改变 MVP 的只读采集边界。
