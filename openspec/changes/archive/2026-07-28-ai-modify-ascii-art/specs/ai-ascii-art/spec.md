## ADDED Requirements

### Requirement: 专用 ASCII 编辑候选项

系统 SHALL 在命令面板提供一个独立的「修改 ASCII 艺术」候选项（id `edit-ascii`），当配置了 AI provider（`activeProvider !== null`）且输入为非空普通文本（非 `/` 或 `=` 前缀）时显示，与通用「Ask AI」候选项并列。

点击该候选项 SHALL：
- 打开 AsciiPreviewPanel Drawer
- 自动执行首轮 `generateAsciiArt(providerConfig, currentAsciiArt, instruction)`，其中 `instruction` 为用户输入的查询，`currentAsciiArt` 为 `settings.customAsciiArt ?? settings.asciiArt`
- 将首轮返回结果填入预览栏（期间显示 loading）

`generateAsciiArt` SHALL 使用精简 system prompt（仅 ASCII 生成指令，不携带 bookmarks/history/tabs context），`maxOutputTokens` MUST ≥ 4000（reasoning 模型思考耗 token，过小会截断 art）。

系统 MUST NOT 通过通用「Ask AI」路径修改 ASCII：通用对话不注入 ASCII 上下文、不注册 `set_ascii_art` tool。

#### Scenario: 用户通过专用候选项触发 ASCII 编辑

- **WHEN** 用户在命令面板输入 "给猫加个帽子"
- **THEN** 候选项列表同时显示「修改 ASCII 艺术：给猫加个帽子」与「让 AI 回答：给猫加个帽子」
- **AND** 用户点击「修改 ASCII 艺术」
- **THEN** Drawer 打开并自动用 "给猫加个帽子" 跑首轮 `generateAsciiArt`
- **AND** 预览栏显示生成结果（带帽子的猫），左栏保持原图

#### Scenario: 未配置 AI provider

- **WHEN** `activeProvider === null`
- **THEN** 「修改 ASCII 艺术」候选项不显示
- **AND** AsciiPreviewPanel 永不 mount

#### Scenario: 通用 Ask AI 不涉及 ASCII

- **WHEN** 用户点击「让 AI 回答」
- **THEN** `streamChat` 不向系统 prompt 注入 `customAsciiArt`
- **AND** 不注册 `set_ascii_art` tool，LLM 无法修改 ASCII

#### Scenario: 首轮生成受 token 上限保护

- **WHEN** 使用 reasoning 模型（如 ark-code）生成 ASCII
- **THEN** `generateAsciiArt` 的 `maxOutputTokens` ≥ 4000，避免思考耗尽额度后 art 参数被 length 截断为空

---

### Requirement: AsciiPreviewPanel 双栏预览 Drawer

系统 SHALL 在用户点击「修改 ASCII 艺术」候选项时打开 Drawer，布局要求：

- 从右侧滑入，宽度 `min(720px, 90vw)`
- 双栏并排（`grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`）：左栏"当前"显示只读原始 `customAsciiArt`；右栏"预览"显示生成/编辑中的 ASCII
- 两栏均用 `<pre>` 渲染，等宽字体；`<pre>` 设 `min-width: 0; min-height: 0; overflow: auto`，超宽/超高时各自滚动而不互相遮盖
- Apply 按钮 SHALL 具备 `autoFocus`（用户可按 Enter 立即写入）
- Escape 键 SHALL 关闭 Drawer 而不写入
- Drawer 未 open 时 MUST 不 mount 任何 DOM
- Drawer SHALL portal 到 `.app` 根元素（而非 `document.body`），以继承 `.app.{theme}` 作用域内的主题 CSS 变量

#### Scenario: Drawer 打开并自动生成首轮

- **WHEN** 用户点击「修改 ASCII 艺术」候选项
- **THEN** `asciiPreview` state 与 `asciiAutoInstruction` 被设置
- **AND** AsciiPreviewPanel mount 并从右侧滑入
- **AND** mount 时检测到 `autoInstruction`，自动跑一轮 `generateAsciiArt`
- **AND** 左栏显示当前 `customAsciiArt`，右栏首轮 loading 后显示生成结果

#### Scenario: 用户按 Enter 写入

- **WHEN** Drawer 打开且焦点在 Apply 按钮上（默认）
- **AND** 用户按 Enter
- **THEN** 系统调用 `setSettings(s => ({ ...s, customAsciiArt: <预览内容>, asciiArtSource: 'custom' }))`
- **AND** Drawer 关闭并清除 `asciiAutoInstruction`

#### Scenario: 用户按 Escape 放弃

- **WHEN** Drawer 打开且用户按 Escape
- **THEN** Drawer 关闭
- **AND** `customAsciiArt` 与 `asciiArtSource` 保持原值不变

#### Scenario: 预览栏不被遮盖

- **WHEN** 生成的 ASCII 行很长或很高
- **THEN** grid 列用 `minmax(0, 1fr)` 收缩，`<pre>` 用 `overflow: auto` 滚动
- **AND** 预览栏不被原图栏遮盖或溢出 Drawer 可视区

#### Scenario: Drawer 继承主题变量

- **WHEN** Drawer 在任意主题下打开
- **THEN** chip 字色、背景、边框等使用 `.app.{theme}` 定义的主题 CSS 变量（非默认黑色）
- **AND** 预览 ASCII 配色镜像主界面 `.ascii-display`

---

### Requirement: 预置 Chip 分为 AI 类与本地类，支持撤销

Drawer SHALL 提供两组预置 chip 按钮：

**AI 类 chip（5 个，调用 `generateAsciiArt`）**：
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

系统 SHALL 维护预览历史栈：每次 AI 或本地操作 push 一帧（去重），提供 undo 按钮单步回退；undo 在栈底（仅初始 art）或 AI loading 时禁用。

#### Scenario: 用户单击 AI 类 chip

- **WHEN** Drawer 打开且用户单击"加围巾"
- **THEN** 系统调用 `generateAsciiArt(providerConfig, <当前预览>, "add a scarf")`
- **AND** 请求成功后用返回结果 push 到历史栈并替换预览区
- **AND** 左栏"当前"保持不变

#### Scenario: 用户单击本地类 chip

- **WHEN** 用户单击"水平翻转"
- **THEN** 系统同步调用 `flipHorizontal(<当前预览>)`
- **AND** 结果 push 到历史栈并替换预览区
- **AND** 不发起任何网络请求

#### Scenario: 用户撤销

- **WHEN** 用户点击 undo 按钮（历史栈长度 > 1 且非 loading）
- **THEN** 预览回到上一个历史帧
- **AND** 可连续 undo 直到初始 art；到栈底时 undo 禁用

#### Scenario: AI 类 chip 请求失败

- **WHEN** `generateAsciiArt` 抛出异常
- **THEN** Drawer 在预览区下方显示错误消息，预览区保持上一次成功状态
- **AND** 用户可继续尝试其他 chip 或输入

---

### Requirement: 自由输入框支持多轮 refinement

Drawer SHALL 提供自由输入框和发送按钮供用户输入任意 refinement 指令。每次发送 MUST 只传递 `[当前预览] + [本轮指令]` 给 `generateAsciiArt`，SHALL NOT 累积历史 message。

#### Scenario: 用户输入自由指令

- **WHEN** 用户在输入框输入 "把颜色改成更深的" 并按 Enter 或点发送按钮
- **THEN** 系统调用 `generateAsciiArt(providerConfig, <当前预览>, "把颜色改成更深的")`
- **AND** 返回结果 push 到历史栈并替换预览区，输入框清空

#### Scenario: Refinement 不累积历史

- **WHEN** 用户连续做 3 次 refinement（chip + 输入 + chip）
- **THEN** 第 3 次请求只包含"第 2 次后的预览 + 第 3 次指令"
- **AND** 不包含前 2 次的 message history

#### Scenario: 加载态互斥

- **WHEN** 一个 refinement 请求正在进行中
- **THEN** 所有 AI chip、发送按钮、undo 按钮 SHALL 显示为 disabled
- **AND** 本地类 chip 仍可点击（不受 loading 影响）

---

### Requirement: Apply/Discard 通过 setSettings 单一写入路径

Drawer 的 Apply 与 Discard 操作 MUST 遵循单一写入路径原则：

- Apply MUST 通过父组件传入的 `onApply(art)` 回调，最终由 CommandPalette 调用 `setSettings(s => ({ ...s, customAsciiArt: art, asciiArtSource: 'custom' }))`
- Discard / Escape / 关闭 按钮 MUST 保持 `customAsciiArt` 与 `asciiArtSource` 原值不变
- 预览会话状态 SHALL NOT 被持久化（刷新页面即丢失）

#### Scenario: Apply 触发 setSettings

- **WHEN** 用户点击 Apply 按钮
- **THEN** `customAsciiArt` 更新为最终预览内容，`asciiArtSource` 强制设为 `'custom'`
- **AND** Drawer 关闭，新标签页 ASCII 区域显示新内容

#### Scenario: Discard 不改动 settings

- **WHEN** 用户点击 Discard 按钮
- **THEN** `setSettings` 不被调用
- **AND** Drawer 关闭，ASCII 区域保持原状

---

### Requirement: 中英双语文案与过时前缀说明清理

系统 SHALL 为 ASCII 编辑相关 UI 提供中英双语 i18n 文案，覆盖：面板标题、双栏标签、chip 分组标签、10 个 chip 标签、输入框 placeholder、Apply/Discard/Undo 按钮、命令面板「修改 ASCII 艺术」候选项（`cp.chat.editAscii` / `editAsciiHint`）。

系统 SHALL 清理过时的 `!` 前缀说明：`aiProviders.usageHint`（英/中）与 README.md 相关段落不再提及 "type `!` for AI commands"。

#### Scenario: 中文界面显示所有新文案

- **WHEN** `settings.language === 'zh'` 且 Drawer 打开
- **THEN** 面板标题"ASCII 艺术编辑器"、双栏"当前"/"预览"、chip 分组"AI"/"调整"
- **AND** chip 显示中文标签（如"+ 加帽子"、"↔ 水平翻转"），按钮"应用"/"放弃"/"撤销"
- **AND** 候选项显示"修改 ASCII 艺术：..."

#### Scenario: 英文界面显示所有新文案

- **WHEN** `settings.language === 'en'` 且 Drawer 打开
- **THEN** 所有文本为对应英文（"ASCII Art Editor"、"Original"、"Preview"、"Apply"、"Discard"、"Undo" 等），无 `[missing translation]`

#### Scenario: aiProviders.usageHint 文案已更新

- **WHEN** 用户打开设置面板的 AI Providers 区域
- **THEN** 提示文案不再包含 "Type `!`"
- **AND** 文案准确描述当前触发方式
