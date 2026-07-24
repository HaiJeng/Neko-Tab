## ADDED Requirements

### Requirement: AI tool set_ascii_art 通过命令面板触发

系统 SHALL 提供一个名为 `set_ascii_art` 的 AI tool，注册到现有 AI_TOOLS 集合，供 LLM 在处理用户请求时自主调用。系统 MUST 不引入新的命令前缀语法；用户通过在命令面板输入自然语言（走现有 "Ask AI" 入口）触发。

Tool schema MUST 为：
- `art: string`（必填，最小长度 1，最大 120 × 60 × 4 字符）
- `description: string`（可选，用于 UI 显示修改说明）

系统 MUST 在发送给 LLM 的系统 prompt 中注入当前 `customAsciiArt` 内容（若非空），并提示 LLM "用户请求 ADD 时修改现有 art、REPLACE 时重新生成、保持 monospace 对齐、限制 ≤120 宽 × 60 高"。

#### Scenario: 用户请求 AI 修改 ASCII 时 LLM 调用 tool

- **WHEN** 用户在命令面板输入 "给猫加个帽子" 并按 Enter（无更高优先级本地匹配时走 Ask AI）
- **THEN** 系统调用 `streamChat`，将当前 `customAsciiArt` 注入系统 prompt
- **AND** LLM 输出 tool call `set_ascii_art({ art: <带帽子的新 ASCII>, description: "加了帽子" })`
- **AND** 系统 dispatch 到 `onOpenAsciiPreview` 回调（不直接写入 settings）

#### Scenario: 用户请求完全替换 ASCII

- **WHEN** 用户输入 "画个小女孩" 并触发 Ask AI
- **THEN** LLM 输出 tool call `set_ascii_art` 且 `art` 为全新生成的 ASCII
- **AND** 系统 dispatch 到 `onOpenAsciiPreview` 回调

#### Scenario: 未配置 AI provider

- **WHEN** 用户未配置任何 AI provider（`activeProvider === null`）
- **THEN** 命令面板不显示 "Ask AI" 项
- **AND** `set_ascii_art` tool 永不被调用
- **AND** AsciiPreviewPanel 永不被 mount

#### Scenario: Tool 参数无效

- **WHEN** LLM 返回 `set_ascii_art` 但 `art` 为空字符串或超出大小上限
- **THEN** dispatch 返回 error 状态，不打开 Drawer
- **AND** 命令面板显示错误消息（"Empty ASCII art" 或 "ASCII art too large"）

---

### Requirement: AsciiPreviewPanel 双栏预览 Drawer

系统 SHALL 在 LLM 调用 `set_ascii_art` 时自动打开一个 Drawer 组件展示预览，Drawer 布局要求：

- 从右侧滑入，宽度 `min(720px, 90vw)`
- 双栏并排：左栏"当前"显示只读的原始 `customAsciiArt`；右栏"预览"显示 LLM 生成的新 ASCII
- 两栏均用 `<pre>` 渲染，等宽字体
- Apply 按钮 SHALL 具备 `autoFocus`（用户可按 Enter 立即写入）
- Escape 键 SHALL 关闭 Drawer 而不写入
- Drawer 未 open 时 MUST 不 mount 任何 DOM

#### Scenario: Drawer 自动打开并显示预览

- **WHEN** dispatch 触发 `onOpenAsciiPreview({ art, description })`
- **THEN** CommandPalette 更新 `asciiPreview` state 为 `{ art, description }`
- **AND** AsciiPreviewPanel mount 并从右侧滑入
- **AND** 左栏显示当前 `customAsciiArt`，右栏显示新的 `art`

#### Scenario: 用户按 Enter 写入

- **WHEN** Drawer 打开且焦点在 Apply 按钮上（默认）
- **AND** 用户按 Enter
- **THEN** 系统调用 `setSettings(s => ({ ...s, customAsciiArt: <预览内容>, asciiArtSource: 'custom' }))`
- **AND** Drawer 关闭

#### Scenario: 用户按 Escape 放弃

- **WHEN** Drawer 打开
- **AND** 用户按 Escape
- **THEN** Drawer 关闭
- **AND** `customAsciiArt` 与 `asciiArtSource` 保持原值不变

#### Scenario: Drawer 未打开时零成本

- **WHEN** 用户从未触发过 `set_ascii_art`
- **THEN** AsciiPreviewPanel 组件不 mount，`asciiPreview` state 为 `null`
- **AND** 不产生任何额外的 DOM 或运行时开销

---

### Requirement: 预置 Chip 分为 AI 类与本地类

Drawer SHALL 提供两组预置 chip 按钮，用户单击即执行对应操作：

**AI 类 chip（5 个，调用 LLM）**：
- 加帽子（instruction: "add a hat"）
- 加围巾（instruction: "add a scarf"）
- 更简约（instruction: "make it simpler with fewer details"）
- 更可爱（instruction: "make it cuter, rounder lines"）
- 更卡通（instruction: "make it more cartoon-style"）

**本地类 chip（5 个，纯字符串操作，不调用 LLM）**：
- 水平翻转（`flipHorizontal`）
- 放大（`scaleUp`：每行/每字符复制 2 倍）
- 缩小（`scaleDown`：隔行/隔字符抽取）
- 裁空行（`trimEmptyLines`：移除首尾全空白行）
- 裁空列（`trimEmptyColumns`：移除每行首尾连续空格列）

本地类 chip MUST 在纯前端完成，不发起任何网络请求。

#### Scenario: 用户单击 AI 类 chip

- **WHEN** Drawer 打开
- **AND** 用户单击"加围巾"
- **THEN** 系统调用 `generateAsciiArt(providerConfig, <当前预览>, "add a scarf")`
- **AND** 请求成功后用返回结果替换预览区
- **AND** 左栏"当前"保持不变

#### Scenario: 用户单击本地类 chip

- **WHEN** Drawer 打开
- **AND** 用户单击"水平翻转"
- **THEN** 系统同步调用 `flipHorizontal(<当前预览>)`
- **AND** 用返回结果替换预览区
- **AND** 不发起任何网络请求

#### Scenario: AI 类 chip 请求失败

- **WHEN** 用户单击某个 AI chip 但 `generateAsciiArt` 抛出异常
- **THEN** Drawer 在预览区下方显示错误消息
- **AND** 预览区内容保持上一次成功的状态
- **AND** 用户可继续尝试其他 chip 或输入

---

### Requirement: 自由输入框支持多轮 refinement

Drawer SHALL 提供自由输入框和发送按钮供用户输入任意 refinement 指令。

每次发送 MUST 只传递 `[当前预览] + [本轮指令]` 给 LLM，SHALL NOT 累积历史 message。

#### Scenario: 用户输入自由指令

- **WHEN** Drawer 打开且预览为某个中间版本
- **AND** 用户在输入框输入 "把颜色改成更深的" 并按 Enter 或点发送按钮
- **THEN** 系统调用 `generateAsciiArt(providerConfig, <当前预览>, "把颜色改成更深的")`
- **AND** 返回结果替换预览区
- **AND** 输入框清空

#### Scenario: Refinement 不累积历史

- **WHEN** 用户连续做 3 次 refinement（chip + 输入 + chip）
- **THEN** 第 3 次请求发送给 LLM 的内容只包含"第 2 次后的预览 + 第 3 次指令"
- **AND** 不包含前 2 次的 message history

#### Scenario: 加载态互斥

- **WHEN** 一个 refinement 请求正在进行中
- **THEN** 所有 AI chip 和自由输入的发送按钮 SHALL 显示为 disabled
- **AND** 本地类 chip 仍可点击（不受影响）

---

### Requirement: Apply/Discard 通过 setSettings 单一写入路径

Drawer 的 Apply 与 Discard 操作 MUST 遵循单一写入路径原则：

- Apply MUST 通过父组件传入的 `onApply(art)` 回调，最终由 CommandPalette 调用 `setSettings(s => ({ ...s, customAsciiArt: art, asciiArtSource: 'custom' }))`
- Discard / Escape / 关闭 按钮 MUST 保持 `customAsciiArt` 与 `asciiArtSource` 原值不变
- 预览会话状态 SHALL NOT 被持久化（刷新页面即丢失）

#### Scenario: Apply 触发 setSettings

- **WHEN** 用户点击 Apply 按钮
- **THEN** `setSettings` 被调用，`customAsciiArt` 更新为最终预览内容
- **AND** `asciiArtSource` 强制设为 `'custom'`（即使之前是 `'os'` 或 `'cat'`）
- **AND** Drawer 关闭
- **AND** 新标签页 ASCII 区域显示新内容

#### Scenario: Discard 不改动 settings

- **WHEN** 用户点击 Discard 按钮
- **THEN** `setSettings` 不被调用
- **AND** Drawer 关闭
- **AND** 新标签页 ASCII 区域保持原状

#### Scenario: 刷新丢弃预览会话

- **WHEN** Drawer 打开且预览区有内容
- **AND** 用户刷新页面
- **THEN** 页面重载后 Drawer 未打开
- **AND** `customAsciiArt` 仍为刷新前的最后 Apply 值（若从未 Apply 则为默认）

---

### Requirement: 中英双语文案与过时前缀说明清理

系统 SHALL 为新增 UI 提供中英双语 i18n 文案（17 个 keys，覆盖面板标题、双栏标签、chip 分组标签、10 个 chip 标签、输入框 placeholder、Apply/Discard 按钮）。

系统 SHALL 清理以下过时文案：
- `aiProviders.usageHint`（英/中）：将 "Type `!` in the command palette to trigger AI mode" 改为准确描述现有 "Ask AI" 入口的文案
- `README.md`：删除 "type `!` for AI commands" 与 "Type `!` in the command palette to trigger AI mode" 两处过时说明

#### Scenario: 中文界面显示所有新文案

- **WHEN** `settings.language === 'zh'` 且 Drawer 打开
- **THEN** 面板标题为"ASCII 艺术编辑器"，双栏标签为"当前"和"预览"，chip 分组标签为"AI"和"调整"
- **AND** 所有 chip 显示中文标签（如"+ 加帽子"、"↔ 水平翻转"）
- **AND** 按钮显示"应用"和"放弃"

#### Scenario: 英文界面显示所有新文案

- **WHEN** `settings.language === 'en'` 且 Drawer 打开
- **THEN** 所有文本显示为对应英文（"ASCII Art Editor"、"Original"、"Preview"、"Apply"、"Discard" 等）

#### Scenario: aiProviders.usageHint 文案已更新

- **WHEN** 用户打开设置面板的 AI Providers 区域
- **THEN** 提示文案不再包含 "Type `!`"
- **AND** 文案准确描述当前触发方式（例如英文："Type a request in the command palette; select \"Ask AI\" or press Enter."）

#### Scenario: README 已清理过时前缀

- **WHEN** 用户阅读项目 README.md
- **THEN** 第 18 行左右的 Command Palette 段落不再提及 "type `!` for AI commands"
- **AND** AI Command Interpreter 段落不再提及 "Type `!` in the command palette to trigger AI mode"