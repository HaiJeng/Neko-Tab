## 1. 纯函数工具集

- [x] 1.1 新建 `src/utils/asciiUtils.ts`，实现 `flipHorizontal`、`scaleUp`、`scaleDown`、`trimEmptyLines`、`trimEmptyColumns`（全部纯函数，不可变）
- [x] 1.2 `npm run build`（0 错误）
- [x] 1.3 commit：`chore: 新增 ASCII 纯函数工具集`

## 2. AI Tool Schema + generateAsciiArt 助手

- [x] 2.1 在 `src/hooks/useAIProviders.ts` 的 `AI_TOOLS` 中新增 `set_ascii_art`（schema: `art: z.string().min(1)`, `description: z.string().optional()`），description 明确列出触发关键词（modify / change / add / redraw / edit / neko / mascot / picture）
- [x] 2.2 扩展 `streamChat` 参数，接受 `currentAsciiArt?: string`，传递给 `buildContext`
- [x] 2.3 新增导出 `generateAsciiArt(providerConfig, currentArt, instruction): Promise<string>`（跳过 tool routing，只用 `generateText` + 精简系统 prompt，strip 掉 code fences）
- [x] 2.4 `npm run build`（0 错误）
- [x] 2.5 commit：`feat(ai): 新增 set_ascii_art tool 与 generateAsciiArt 助手`

## 3. Dispatch Case + buildContext 扩展

- [x] 3.1 扩展 `src/utils/ai-command-parser.ts` 的 `buildContext` 签名，接受 `currentAsciiArt?: string`，非空时追加 ASCII 区块到系统 prompt
- [x] 3.2 扩展 `DispatchCallbacks` 接口，新增 `onOpenAsciiPreview?: (data: { art: string; description?: string }) => void`
- [x] 3.3 在 `dispatchToolCall` 中新增 `case 'set_ascii_art'`：验证 art 非空且不超大，调 `callbacks.onOpenAsciiPreview`；若回调未接则返回 error
- [x] 3.4 `npm run build`（0 错误）
- [x] 3.5 commit：`feat(ai): dispatchToolCall 分派 set_ascii_art 到预览回调`

## 4. AsciiPreviewPanel 组件 + 样式

- [x] 4.1 新建 `src/components/AsciiPreviewPanel.tsx`（~230 行）：Drawer 组件，含双栏并排预览、AI/本地 chip 列表、自由输入框、Apply/Discard 按钮、Escape 关闭、loading 态互斥、error 显示
- [x] 4.2 新建 `src/styles/ascii-preview.css`（~80 行）：Drawer 定位、slide-in 动画、双栏 grid、chip 样式、按钮样式、响应式
- [x] 4.3 在 `src/index.css` 追加 `@import './styles/ascii-preview.css'`
- [x] 4.4 `npm run build`（0 错误）
- [x] 4.5 commit：`feat(ui): AsciiPreviewPanel 组件与样式`

## 5. CommandPalette 集成

- [x] 5.1 在 `src/components/CommandPalette.tsx` 中新增 `asciiPreview` state：`useState<{ art: string; description?: string } | null>(null)`
- [x] 5.2 在 `streamChat` 调用时传入 `currentAsciiArt: settings.customAsciiArt ?? settings.asciiArt`
- [x] 5.3 在 `dispatchToolCall` 的 callbacks 参数中追加 `onOpenAsciiPreview`
- [x] 5.4 在 CommandPalette 根节点底部挂载 `{asciiPreview && activeProvider && <AsciiPreviewPanel .../>}`，传 `onApply` → `setSettings`、`onClose` → `setAsciiPreview(null)`、`onRequestAI` → `generateAsciiArt(activeProvider, ...)`
- [x] 5.5 `npm run build`（0 错误）
- [x] 5.6 commit：`feat: CommandPalette 集成 AsciiPreviewPanel`

## 6. i18n 文案 + 过时说明清理

- [x] 6.1 在 `src/i18n/locales/en.ts` 追加 17 个 ASCII 相关 keys（`ascii.title`、`ascii.label.*`、`ascii.group.*`、`ascii.chip.*`、`ascii.input.placeholder`、`ascii.action.*`）
- [x] 6.2 在 `src/i18n/locales/zh.ts` 追加同 17 个 keys 的中文文案
- [x] 6.3 修改 `aiProviders.usageHint`（英/中）：将 "Type `!` in the command palette to trigger AI mode" 替换为准确描述（"Type a request in the command palette; select \"Ask AI\" or press Enter." / "在命令面板输入请求，选择\"Ask AI\"或按 Enter。"）
- [x] 6.4 修改 `README.md`：删除 Command Palette 段落的 "type `!` for AI commands"，删除 AI Command Interpreter 段落的 "Type `!` in the command palette to trigger AI mode"
- [x] 6.5 `npm run build`（0 错误）
- [x] 6.6 commit：`docs: 补齐 ASCII 编辑器 i18n 文案并清理过时 ! 前缀说明`

## 7. 端到端手动验证

- [x] 7.1 未配 AI provider：命令面板输入普通文本 → 只走搜索，无「修改 ASCII 艺术」与「Ask AI」项，无异常（dev server 验证）
- [x] 7.2 修改现有（专用入口）：输入"给猫加个帽子" → 出现「修改 ASCII 艺术」候选项 → 点击 → Drawer 打开并自动生成首轮 → 预览可见 → Apply → 主界面 ASCII 更新且 asciiArtSource='custom'
- [ ] 7.3 完全替换 + Discard：重新输入"换成一条龙" → Drawer 预览 → Discard → 主界面不变
- [x] 7.4 本地 chip + undo：Drawer 打开 → 点本地 chip（翻转/放大/裁空）即时生效、无网络 → undo 逐帧回退；asciiUtils 纯函数 15/15 断言通过
- [ ] 7.5 自由输入：Drawer 内输入"更简约" → 发送 → 预览刷新
- [ ] 7.6 ESC 关闭：Drawer 中按 ESC → 关闭，主界面不变
- [x] 7.7 语言切换机制：/language English → 界面文案全英文，无 `[missing translation]`；切回中文正常（dev server 验证；Drawer 内文案待真实打开后复验）