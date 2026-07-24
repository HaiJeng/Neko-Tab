# Design

## Context

Neko-Tab 是 Chrome MV3 扩展，覆盖新标签页。Command Palette 是页面顶部的核心输入组件（`src/components/CommandPalette.tsx`），当前混合了 4 类功能：

1. 本地搜索：书签 / 历史 / alias / URL / recent，输入即时匹配
2. Slash command：`/theme dark` 等以 `/` 开头的命令
3. 计算器：`=` 前缀
4. AI 命令：`!` 前缀触发一次性 AI 请求

AI 集成通过 `useAIProviders.executeCommand` → `generateText` → 手写 `parseActions` 提取 `AIAction[]` → `executeActions` 执行。返回结果通过 `aiAnswer` state 渲染在 palette 内的临时卡片。

**当前痛点**：
- 手写 JSON 解析不稳定，`Invalid JSON response` 报错频繁
- `!` 前缀增加使用摩擦
- 一次性问答，无多轮上下文

**约束**：
- MV3 CSP 严格，不能引入 inline style；SHA-256 hash 必须匹配
- 无 backend、无测试套件，只靠 `tsc` + 手工 load unpacked 验证
- 所有 UI state 走 `useLocalStorage`；AI provider 配置走 `chrome.storage.local`
- 单人小项目，UI 复杂度必须可控

**关联工作**：
- 已批准 spec：`docs/superpowers/specs/2026-07-24-command-palette-chat-brief.md`
- 已批准 plan：`docs/superpowers/plans/2026-07-24-command-palette-chat.md`
- 视觉预览：`preview/chat-preview.html`

## Goals / Non-Goals

**Goals**：
- 消除 `!` 前缀摩擦：任意非空输入 = 触发 AI 的候选路径
- 用 ai-sdk tools + zod schema 替代手写 JSON 解析，从根源消除 "Invalid JSON" 错误
- 支持多轮流式对话，UI 与本地搜索共存
- 迁移后无 compat carrier，旧路径一次性删干净
- 视觉与现有主题（Carbon / Paper / Nord / Matrix 等）无缝

**Non-Goals**：
- 多会话管理、会话列表、侧栏历史
- 会话持久化（localStorage / chrome.storage）
- 修改任何本地搜索路径（`/` `=` URL alias 书签 历史 recent）
- 修改 Settings 面板、Google Calendar、Focus Mode 等其他组件
- 修改 memory / journal / recent 数据结构
- 修改 CSP / manifest / dist.pem / OAuth 配置

## Decisions

### D1: 用 `streamText` + tools，不用 `generateText` + 手写 parse

**选择**：ai-sdk v7 的 `streamText` + tool 定义（zod schema）

**Why**：
- SDK 强制 provider 使用 structured output（OpenAI `response_format` / Anthropic tool_use / Gemini `responseSchema`），根除模型输出散文的问题
- tool call 在 stream 中以事件方式到达，天然支持"边说边做"
- 文本回复不再需要挤进 `answer` action，直接是 assistant message content

**Alternatives 考虑**：
- 继续 `generateText` + 加强 `parseActions`：治标不治本，模型任性输出仍会挂
- `generateObject`：只能一次性拿到完整结构，不支持流式渲染文本回复
- `streamObject`：结构化流式但不支持 tool call 与自然语言混合

**代价**：新增 zod 依赖（~50KB）；provider 若不支持 function calling（部分 OpenAI 兼容网关）会抛错——通过消息末尾标红处理，不做兜底 parse

### D2: 抛弃 overlay portal，输入框常驻内联

**选择**：`.cp-inline` div 直接渲染在 App.tsx center-section，overlay portal 删除

**Why**：
- 消息流在输入框上方展开时，overlay 结构会遮挡下方页面内容；内联渲染让 palette 与页面共存
- `App.tsx` 里 `<CommandPalette />` 挂载位置本来就是内联的（L161），只是组件内部弹了 overlay——这次改造不需要动 App.tsx
- 未 focus 时视觉退化为原 `cp-trigger` 外观（`.cp-inline:not(.focused) .cp-input-row` 显示 kbd 提示、隐藏 engines），零视觉突兀

**Alternatives 考虑**：
- 继续 overlay，消息流在 overlay 内展开：视觉笨重，与新标签页整体极简风冲突
- 完全独立 chat panel（侧栏）：spec 明确否决，改动过大

### D3: Tool call 无二次确认

**选择**：AI 返回 tool call 立即执行副作用（open_url / remember / save_to_journal 等）

**Why**：
- 单人私人扩展，非公开 SaaS 场景
- 二次确认会打断多轮对话节奏，与"助手"定位冲突
- 用户可通过 memory 上下文影响 AI 行为，事后可撤销（memory 可编辑）

**Risk**：Prompt injection 可能诱导 AI 打开恶意 URL。通过 `isSafeUrl` 白名单（`src/utils/browser.ts`）与 chrome.tabs API 本身的沙盒隔离缓解；不做 UI 二次确认

### D4: Context 只在首轮注入 system prompt

**选择**：`streamChat(messages, context)` 每次调用都用 `context` 生成 system prompt，但 messages 数组延续；后续轮次不重复把 aliases / bookmarks 塞进 user message

**Why**：
- 节省 token（context 可达几 KB）
- 后续轮次 AI 靠对话历史推理，若忘了可从 system 里再读

**Alternatives**：每轮都在 user message 里贴 context — 浪费 token；从不带 context — AI 冷启动无法访问 alias 列表

### D5: 消息与工具调用共存的 UI 结构

**选择**：`ChatMessage` 类型为 `{ role, content, toolCalls?: ToolCallDisplay[] }`；tool call 显示为消息内的 chip，含 pending / done / error 状态

**Why**：
- Tool call 与文本回复来自同一次 AI 响应，语义上属于同一条消息
- Chip 视觉不侵入文本，用户可扫过

### D6: Esc 三级语义

**选择**：`Esc` 按 input 状态分级——有 query 清 query；无 query 有对话清对话；否则 blur

**Why**：
- 逐级退出符合直觉（"再按一次退出更多"）
- 避免误清对话——用户可能只是想重新输入

### D7: 保留 `dispatchToolCall` 在 `ai-command-parser.ts` 不新建文件

**选择**：现有 `ai-command-parser.ts` 复用为 tool dispatch owner，新增函数、删除旧函数，不改文件名

**Why**：
- 减小 diff 面
- 文件名不完全贴切但可接受（内部注释说明）
- 遵循 CLAUDE.md "Surgical Changes" 原则

**Alternatives**：重命名为 `ai-tools.ts` — 引入 rename diff，import 面变大

## Risks / Trade-offs

- **Provider 不支持 tool calling**：ai-sdk v7 对 OpenAI / Anthropic / Gemini 官方 API 均支持；自定义 OpenAI 兼容网关（DeepSeek 老版本等）可能不支持 → `streamText` 抛错 → 消息末尾标红 → 用户切 provider
- **Token 成本上涨**：多轮对话累积 messages 数组；缓解：顶部 × 手动结束；不做自动摘要（YAGNI）
- **`save_to_journal` 手动按钮消失**：现有"保存到日记"按钮删除；用户需说"存到今天日记"让 AI 调用。proposal 已标记为 BREAKING
- **`.cp-trigger` CSS 部分保留**：`.cp-trigger-hint` 与 `.cp-trigger-sep` 在未 focused 状态复用；只删自身与 `.cp-trigger-icon` / `.cp-trigger-text`（`Task 6` 明确列出保留项，避免误删）
- **Zod bundle size**：~50KB gzipped，接受；alternative 是手写 schema validator，反而更脆

## Migration Plan

一次性切换，无 dual-track：

1. Task 1-3：并列新增 zod、streamChat、dispatchToolCall（旧路径仍在）
2. Task 4-5：CommandPalette 结构改造 + 接入 streamChat（此时旧路径未删但已不被调用）
3. Task 6：清理旧路径与 CSS / i18n keys
4. Task 7：`npm run build` + 手工 load unpacked 全量回归

Rollback：git revert 至 Task 4 之前的 commit。localStorage / storage.local 数据完全兼容旧代码。

## Open Questions

- 是否需要 `history_search` tool 的降级路径？当前若 chrome.history 不可用直接返回 error chip。**决定**：接受，扩展环境默认可用
- 是否给 AI 增加"取消当前请求"按钮？**决定**：本次不做，Esc 已能清空对话
