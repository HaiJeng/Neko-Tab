# Tasks

参考实施计划 `docs/superpowers/plans/2026-07-24-command-palette-chat.md` 的完整步骤代码。以下按依赖顺序拆解。

## 1. 依赖与工具层

- [x] 1.1 运行 `npm install zod` 添加 zod 依赖，确认 `package.json` `dependencies` 出现 zod
- [x] 1.2 运行 `npm run build` 验证 0 TS 错误
- [x] 1.3 Commit: `chore: 添加 zod 依赖用于 AI tools schema`

## 2. useAIProviders 新增 streamChat + tool schemas

- [x] 2.1 在 `src/hooks/useAIProviders.ts` 导入 `import { z } from 'zod'` 与 `import type { CoreMessage } from 'ai'`
- [x] 2.2 在文件顶部定义 `AI_TOOLS` 常量，包含六个工具的 zod inputSchema：`open_url` / `open_tabs` / `open_alias` / `history_search` / `remember` / `save_to_journal`
- [x] 2.3 导出 `AIToolName` 类型（`keyof typeof AI_TOOLS`）
- [x] 2.4 在 hook 内新增 `streamChat(messages, context)` useCallback，返回 `streamText` 结果，首轮注入 system prompt（含 context），传入 `AI_TOOLS`
- [x] 2.5 将 `streamChat` 加入 hook return
- [x] 2.6 `npm run build` 直到 0 错误
- [x] 2.7 Commit: `feat(ai): 添加 streamChat 与 tool schemas`

## 3. ai-command-parser 新增 dispatchToolCall

- [x] 3.1 在 `src/utils/ai-command-parser.ts` 顶部 imports 加入 `import type { AIToolName } from '../hooks/useAIProviders'`
- [x] 3.2 新增类型：`ToolCallResult`、`JournalWriter`、`MemoryWriter`、`AliasLookup`
- [x] 3.3 实现 `dispatchToolCall(name, args, deps)` 异步函数，覆盖六种 tool 分派逻辑（`open_url` / `open_tabs` / `open_alias` / `history_search` / `remember` / `save_to_journal`）
- [x] 3.4 每个分支 URL 通过 `isSafeUrl` 校验后再执行；失败返回 error result
- [x] 3.5 `npm run build` 直到 0 错误
- [x] 3.6 Commit: `feat(ai): 新增 dispatchToolCall 执行分派器`

## 4. CommandPalette 结构改造 — trigger 与 overlay 合并

- [x] 4.1 `src/components/CommandPalette.tsx` 中 `isOpen` state 改名 `isFocused`，删除相关的 open/close useEffect（`setAiAnswer(null)` 等）
- [x] 4.2 修改快捷键 handler：`Cmd+K` → `inputRef.current?.focus()`；`/` → 预填 `/` 并 focus；`Escape` 三级语义（有 query 清 query / 无 query 有 messages 清 messages / 否则 blur）
- [x] 4.3 修改 history 触发条件（L292）：删除 `|| query.startsWith('!')` 判断
- [x] 4.4 删除 L566-662 的 `if (query.startsWith('!'))` 整个 AI 分支
- [x] 4.5 替换 JSX：删除 `.cp-trigger` 与 overlay portal；改为常驻 `.cp-inline` div，内含 `.cp-input-row` 与条件渲染的 `.cp-results`
- [x] 4.6 未 focused 时显示 kbd 提示（`⌘+K` / `/`）；focused 时显示 engines 切换器与 `esc` 提示
- [x] 4.7 保留 `.cp-trigger-hint` 与 `.cp-trigger-sep` 元素（这两个 class 在 CSS 里保留）
- [x] 4.8 `npm run build` 直到 0 错误
- [ ] 4.9 手工验证：load unpacked，输入框可 focus / `Cmd+K` focus / `/` 预填 / `Esc` 清 query
- [x] 4.10 Commit: `refactor(cp): trigger 与 overlay 合并为常驻内联输入框`

## 5. 接入 streamChat + 消息流 UI + i18n keys

- [x] 5.1 在 `CommandPalette.tsx` 添加 `ChatMessage` 类型（`{ role, content, toolCalls? }`）与 `messages` / `aiStreaming` / `aiError` state
- [x] 5.2 添加 `chatRef` 与 auto-scroll useEffect（messages 变化时滚到底）
- [x] 5.3 实现 `resolveAlias(key)` useCallback（从 `aliases` 查 URL）
- [x] 5.4 实现 `sendChat(userText)` useCallback：追加 user message + placeholder assistant message，调 `streamChat`，`for await` 迭代 `result.fullStream`
- [x] 5.5 处理 `text-delta` chunk：追加到最后一条 assistant message 的 content
- [x] 5.6 处理 `tool-call` chunk：先加 pending chip，`dispatchToolCall` 后更新为 done/error
- [x] 5.7 catch 分支：把错误信息追加到当前 assistant message 末尾（红色）
- [x] 5.8 修改 `handleKeyDown` 的 Enter 分支：结果为空或选中 "ask-ai" 时调 `sendChat(query)`
- [x] 5.9 在 `results` useMemo 末尾追加 "Ask AI: {query}" 项，仅在 `activeProvider` 存在、query 非空、且不是 `/` `=` 前缀时
- [x] 5.10 在 JSX 的 `.cp-inline` 内 `.cp-input-row` **之前** 插入 `.cp-chat` 消息流（`messages.length > 0` 时渲染）
- [x] 5.11 消息流包含 header（turn count + × 清空按钮）与消息列表（含 tool chip 显示）
- [x] 5.12 更新 Esc handler 依赖数组加入 `messages.length`
- [x] 5.13 在 `src/styles/command-palette.css` 追加 `.cp-inline` / `.cp-chat` / `.cp-chat-header` / `.cp-chat-clear` / `.cp-msg-list` / `.cp-msg` / `.cp-msg-role` / `.cp-msg-content` / `.cp-msg-content.streaming` / `.cp-tool-chips` / `.cp-tool-chip` 全部样式与 `cp-blink` keyframes
- [x] 5.14 `.cp-tool-chip.error` 用红边与红点表示错误
- [x] 5.15 `src/i18n/locales/en.ts` 新增 `cp.chat.askAI` / `cp.chat.streaming` / `cp.chat.enterHint` / `cp.chat.turnsLabel` / `cp.chat.clear` / `cp.chat.noProvider`
- [x] 5.16 `src/i18n/locales/zh.ts` 新增相同 6 个中文 keys
- [x] 5.17 `npm run build` 直到 0 错误
- [ ] 5.18 手工验证：输入 `slack` 显示 Ask AI 项 → 发送 → 流式渲染 + tool chip → 追问延续上下文 → `Esc` × 2 分别清 query 与对话 → × 按钮只清对话 → 未配置 provider 时错误提示
- [x] 5.19 Commit: `feat(cp): 多轮对话 UI + streamChat 接入`

## 6. 清理旧路径

- [x] 6.1 删除 `useAIProviders.ts` 中 `parseActions` 函数
- [x] 6.2 删除 `useAIProviders.ts` 中 `executeCommand` useCallback 与 return 引用
- [x] 6.3 删除 `ai-command-parser.ts` 中 `parseAIActions`、`executeActions` 函数
- [x] 6.4 删除 `ai-command-parser.ts` 中 `parseDateQuery`、`fetchHistoryForDateRange`、`parseMonthWord` 函数与 `VALID_TYPES` / `MONTHS` / `MONTH_SHORT` / `DAY_NAMES` 常量
- [x] 6.5 保留 `fetchFrequentDestinations`、`buildContext`、`strip`、`dispatchToolCall` 与相关类型
- [x] 6.6 删除 `CommandPalette.tsx` 中对已删除函数的 imports；删除 `aiLoading` 残留 state / `toLocalDateKey` 辅助（若无引用）
- [x] 6.7 编辑 `src/styles/command-palette.css`：删除 `.cp-trigger`（自身）/ `.cp-trigger:hover` / `.cp-trigger-icon` / `.cp-trigger-text` / `.has-bg .cp-trigger` / `.has-bg .cp-trigger:hover` 与 `.cp-answer` / `.cp-answer-text` / `.cp-answer-chips` / `.cp-chip` / `.cp-save-journal` / `.cp-ai-error` / `.cp-hint-row` / `.cp-clear-btn` / `.cp-overlay` / `.cp-panel` 中无引用的规则
- [x] 6.8 保留 `.cp-trigger-hint` 与 `.cp-trigger-sep`（JSX 未 focused 状态仍在用）
- [x] 6.9 编辑 `src/styles/layout.css`：`.app.clock-maximized .cp-trigger` 与 `.cp-trigger` 规则中的选择器改为 `.cp-inline`
- [x] 6.10 编辑 `src/i18n/locales/en.ts` 与 `zh.ts`：删除 `cp.aiProcessing` / `cp.aiAsk` / `cp.aiNoProvider` / `cp.aiNoProviderSub` / `cp.aiNoActions` / `cp.aiFailed` / `cp.hint.ai` / `cp.saveJournal`
- [x] 6.11 `npm run build` 直到 0 错误
- [x] 6.12 grep 验证清理干净：`grep -rn "parseActions\|parseAIActions\|executeActions\|aiAnswer\|cp-answer\|cp\.aiAsk\|cp\.hint\.ai\|parseDateQuery" src/` 无匹配
- [ ] 6.13 手工回归 Task 4 与 Task 5 的所有验证项
- [x] 6.14 Commit: `refactor: 清理 CommandPalette 旧 AI 路径`

## 7. 最终验证与文档

- [x] 7.1 `npm run build` 0 错误
- [ ] 7.2 load unpacked，跑完手工验证矩阵：
  - 空 focus → 显示 recent
  - 输入 `gh` → alias 首项优先
  - 输入 `slack` → 本地 + AI 并列
  - 发送 → 流式光标 + tool chip 出现 + 新 tab 打开
  - 追问 → 上下文延续
  - `Esc` × 2 → query → 对话
  - × 按钮 → 只清对话
  - 关 tab 重开 → 无历史
  - streaming 中断 → 错误标红，历史保留
- [ ] 7.3 对照 `preview/chat-preview.html` 五个场景视觉比对
- [ ] 7.4 PR 描述列出：新增 zod 依赖、`!` 前缀语义变化（BREAKING）、`save_to_journal` 手动按钮移除（BREAKING）、视觉参考路径
- [x] 7.5 运行 `openspec validate command-palette-multi-turn-chat --strict` 通过
