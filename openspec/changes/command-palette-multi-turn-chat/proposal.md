# Command Palette 多轮对话改造

## Why

当前 Command Palette 用 `!` 前缀触发一次性 AI 命令，返回 `AIAction[]` 由手写 JSON 解析器还原，再显示在 palette 内的临时"answer 卡片"。两个问题让日常使用体验差：

1. **`!` 前缀成本高** — 用户每次问 AI 都要额外敲一个字符，肌肉记忆负担明显
2. **JSON 解析脆弱** — `generateText` + 手写 `parseActions` 会因为模型输出散文、被 `maxOutputTokens` 截断、加了 markdown 代码块等情况频繁抛出 "AI response was not valid JSON"

同时 palette 只支持一次性问答（无 turn 历史、无追问），限制了 AI 的实际用途。

## What Changes

- Command Palette 抛弃 "trigger → overlay portal" 模式，输入框常驻内联渲染
- 支持多轮对话：输入框上方内联展开消息流，AI 回复流式渲染（token-by-token + 闪烁光标）
- AI 集成层从 `generateText` + 手写 JSON parse 迁移到 `streamText` + ai-sdk tools（zod schema），SDK 负责校验和错误处理
- AI 可调用工具：`open_url` / `open_tabs` / `open_alias` / `history_search` / `remember` / `save_to_journal`，工具调用无二次确认直接执行
- 每个 tool call 以 chip 显示在 assistant 消息内，含 pending / done / error 状态
- Esc 结束语义：有 query 时清 query；无 query 有对话时清对话；否则 blur
- 顶部 × 按钮：仅清对话，input 保持 focus
- 会话不持久化：关 tab / 刷新即消失
- **BREAKING**: `!` 前缀不再有特殊语义，不再触发 AI 也不做特殊 strip（用户直接输入即可让 AI 回答）
- **BREAKING**: `save_to_journal` 的手动"保存到日记"按钮消失，改为通过 AI 调用工具触发（用户可说"存到今天日记"）
- 新依赖：`zod`（用于 tool schema）

## Capabilities

### New Capabilities

- `command-palette`: Neko-Tab 新标签页顶部的多用途输入组件，负责本地搜索（书签 / 历史 / 别名 / URL / 最近）、slash command、计算器和 AI 对话入口的路由与呈现
- `ai-assistant`: 基于 AI SDK 的浏览器助手，通过 tool calling 执行 open_url / open_tabs / open_alias / history_search / remember / save_to_journal，支持多轮流式对话

### Modified Capabilities

<!-- 无 — command-palette 和 ai-assistant 之前都没有正式 OpenSpec spec；archived add-i18n 只涵盖 i18n。 -->

## Impact

**代码**：
- `src/hooks/useAIProviders.ts`：新增 `streamChat` + `AI_TOOLS` zod schemas；删除 `executeCommand` 与 `parseActions`
- `src/utils/ai-command-parser.ts`：新增 `dispatchToolCall`；删除 `parseAIActions`、`executeActions`、`parseDateQuery`、`fetchHistoryForDateRange` 及相关常量
- `src/components/CommandPalette.tsx`：合并 trigger 与 overlay 为常驻内联；`aiAnswer` state 替换为 `messages`；删除 `!` 前缀分支；新增消息流渲染与 sendChat handler
- `src/styles/command-palette.css`：新增 `.cp-chat` / `.cp-msg` / `.cp-tool-chip` 系列；清理 `.cp-trigger` / `.cp-answer` / `.cp-chip` / `.cp-save-journal` / `.cp-overlay` / `.cp-panel` 中不再使用的规则
- `src/styles/layout.css`：`.cp-trigger` layout 规则改为 `.cp-inline`
- `src/i18n/locales/{en,zh}.ts`：新增 `cp.chat.*`；删除 `cp.aiAsk` / `cp.aiProcessing` / `cp.aiFailed` / `cp.aiNoActions` / `cp.hint.ai` / `cp.saveJournal` / `cp.aiNoProvider(Sub)`

**依赖**：
- 新增 `zod`（~50KB gzipped，运行时依赖）

**兼容边界（不动）**：
- localStorage keys：`neko-recent` / `neko-aliases` / `neko-journal` / `neko-bookmarks` / `neko-scratchpad` / `startpage-settings`
- `chrome.storage.local` keys：`ai-providers` / `ai-active-provider` / `ai-memories`
- Memory / journal / recent 数据结构
- `manifest.json` CSP hash（不新增 inline style）
- `public/background.js` service worker
- `dist.pem` 与扩展 ID

**验证**：`npm run build`（0 TS 错误）+ 手工 load unpacked 测试矩阵（见 tasks §7）；无自动化测试套件。
