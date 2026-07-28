## Context

Neko-Tab 是一个终端风格的浏览器新标签页扩展（React + TypeScript + Vite，Chrome MV3）。当前的 `customAsciiArt` 只能通过设置面板手动编辑或图片上传转换。命令面板已集成 Vercel AI SDK 支持多 provider（OpenAI / Anthropic / Gemini / 自定义），已有 6 个 AI tools（open_url、open_tabs、open_alias、history_search、remember、save_to_journal），通过 `dispatchToolCall` 分派到本地动作。

本设计描述如何让 LLM 通过对话修改 ASCII 艺术：一个新 tool + 一个预览 Drawer。核心权衡是 LLM 生成 ASCII 质量不稳（尤其具象图），预览面板是安全默认。

参见：`docs/aegis/specs/2026-07-24-ai-ascii-art-design.md`、`docs/aegis/plans/2026-07-24-ai-ascii-art-plan.md`。

## Goals / Non-Goals

**Goals:**
- 用户输入自然语言（"给猫加个帽子" / "画个小女孩"）→ LLM 自主调用 `set_ascii_art` → Drawer 预览 → Apply/Discard
- 面板内多轮 refinement（AI chips + 自由输入 + 本地字符串操作 chips）
- 单一写入路径：所有变更最终仅通过 `setSettings({ customAsciiArt, asciiArtSource: 'custom' })` 落盘
- 未配置 AI provider 时对功能透明零成本

**Non-Goals:**
- 不引入 `!` / `!!` 等新前缀语法（复用现有 "Ask AI" 入口）
- 不做"跳过预览直写"路径
- 不持久化预览会话（刷新即丢失）
- 不做版本历史 / Undo
- 不引入 A2UI 协议层
- 不引入 FIGlet / Python 转换能力
- 不做视频 / 交互式 / 多格式导出

## Decisions

### D1: Tool call 分派到预览而非直写

`set_ascii_art` 到达 `dispatchToolCall` 时**不**直接写 settings，而是通过新回调 `onOpenAsciiPreview` 打开 Drawer。

- **理由**：LLM 生成 ASCII 质量不稳，预览是安全默认；Apply 按钮 autoFocus，键盘用户 Enter 即写入，几乎无感
- **备选**：直写 + Undo。**否决**——Undo 单层不够，且直写破坏"所见即所得"心智

### D2: Refinement 走独立的 `generateAsciiArt`，不复用 `streamChat`

面板内多轮修改（chip 点击、自由输入）调用**新增的 `generateAsciiArt` 助手**，直接生成，跳过普通 tool routing。

- **理由**：普通 `streamChat` 会把 bookmarks / history / tabs 全塞到系统 prompt 里，每次"加个帽子"都烧一次这些噪声 token；refinement 只需要 `[最新预览] + [本轮指令]`
- **备选**：复用 `streamChat` + `set_ascii_art` tool。**否决**——两倍 token、两倍延迟、无收益

### D3: 每轮 refinement 只传最新预览，不累积 message history

- **理由**：ASCII 是"最终状态"而非"对话"，只需要最新画面 + 修改指令；避免 LLM 累积错误
- **备选**：完整 conversation history。**否决**——token 增长快、易触发上限、无质量收益

### D4: Chip 分类为 AI 类 + 本地类

10 个 chips 中：
- 5 个 AI 类（加帽子、加围巾、更简约、更可爱、更卡通）→ 调 `generateAsciiArt`
- 5 个本地类（水平翻转、放大、缩小、裁空行、裁空列）→ 调 `asciiUtils` 纯函数

- **理由**：翻转 / 裁空这种确定性操作不该烧 AI token，也不应受 LLM 输出不稳影响
- **备选**：全走 AI。**否决**——浪费 token，且 LLM 做机械操作反而更容易错

### D5: Drawer 未 open 时不 mount

`AsciiPreviewPanel` 通过 `open` 属性控制，`if (!open) return null`。CommandPalette 里用 `{asciiPreview && <AsciiPreviewPanel .../>}` 挂载。

- **理由**：零成本、状态由父组件 own（`asciiPreview` state）
- **备选**：常驻 mount + CSS 显隐。**否决**——大部分用户从不打开，无必要

### D6: 系统 prompt 里注入当前 ASCII

`buildContext` 扩展 `currentAsciiArt` 可选参数，若存在则追加：
```
--- Current ASCII Art on the new tab page ---
<literal content>
--- End Current ASCII Art ---
```
配合 `set_ascii_art` 的 description 里的"ADD → modify existing / REPLACE → create new"指令。

- **理由**：LLM 需要看到当前画面才能做 S1 增量修改；tool description 决定 S1/S2 分流
- **备选**：让 LLM 用 tool 读当前 art。**否决**——多一轮 round-trip，无收益

### D7: `generateAsciiArt` 输出 strip 掉 code fences

某些 LLM 会用 ``` ``` 包裹结果。`generateAsciiArt` 返回前做正则 strip：`^```[\w-]*\n?/` 与 `\n?```\s*$/`。

- **理由**：LLM 行为不可控；strip 是低成本兜底
- **备选**：prompt 硬性禁止。**否决**——写了也不一定听，不如兜底

### D8: 单一写入路径 = `setSettings`

Apply 按钮 `onClick` 调用父组件传入的 `onApply(preview)` → CommandPalette 调 `setSettings(s => ({ ...s, customAsciiArt: preview, asciiArtSource: 'custom' }))`。

- **理由**：不为 AsciiPreviewPanel 引入 `useSettings` 依赖；Panel 是 pure props 组件
- **备选**：Panel 内部 `useSettings`。**否决**——耦合更强，测试更难

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| LLM 生成具象图质量差（尤其 S2 "画个小女孩"） | 预览模式让用户先看再 Apply；Discard 不改动现状；本地 chip 可事后修补 |
| LLM 增量修改时破坏对齐 | 系统 prompt 明确要求 monospace 对齐；提供 "trim cols/lines" chip 让用户手动修正 |
| LLM 不调用 `set_ascii_art`，返回普通对话文本 | tool description 详细列出触发关键词（modify / change / add / redraw / edit / neko / mascot）；无进一步兜底（YAGNI） |
| LLM 用 code fence 包裹结果 | `generateAsciiArt` 返回前 strip fences（D7） |
| Drawer 遮挡主界面 | 固定右侧 min(720px, 90vw)；只在 open 时 mount |
| 大 ASCII 触发 token 上限 | tool schema 里 description 限制 ≤120×60；`generateAsciiArt` 用 `maxOutputTokens: 2000` |
| 多轮对话累积偏差 | 每轮只传 `[最新预览] + [本轮指令]`，无 history 累积（D3） |
| 无自动化测试覆盖 | 项目本身无测试套件；依赖 `npm run build` + Task 7 的 7 项手动 smoke |

## Migration Plan

无迁移。

- 无 storage schema 变更
- 无 manifest 变更（无新 permissions）
- 未配置 AI provider 时功能透明不可达
- Rollback：删除新增文件 + 回滚 5 处修改点即可

## Open Questions

无。所有决策已在 D1–D8 中确定。