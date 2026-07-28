## Why

新标签页的 ASCII 艺术目前只能通过设置面板手动编辑或上传图片转换。用户希望在对话中直接让 AI 修改或生成 ASCII 艺术，获得更自然的交互体验——"给猫加个帽子"后立即预览，满意再写入。

## What Changes

- 新增 `set_ascii_art` AI tool（LLM 通过命令面板对话触发）
- 新增 `AsciiPreviewPanel` 右侧 Drawer 组件（双栏对比预览 + Apply/Discard）
- 新增 `asciiUtils` 纯函数工具集（翻转/缩放/裁空行等本地操作）
- 扩展 `buildContext` 与 `dispatchToolCall` 以支持 ASCII 上下文注入与预览回调
- 新增 `generateAsciiArt` 助手函数（面板内多轮 refinement 专用）
- 新增中英双语 i18n 文案（17 个 keys）
- 清理过时的 `!` 前缀说明（`aiProviders.usageHint` 提示文案、README）

## Capabilities

### New Capabilities
- `ai-ascii-art`: 用户通过自然语言对话让 AI 修改或生成 ASCII 艺术，预览后 Apply 或 Discard。支持多轮 refinement（AI chips 与自由输入）和本地调整（翻转/缩放/裁空行）。

### Modified Capabilities

无。不修改现有 capability 的行为。

## Impact

- `src/hooks/useAIProviders.ts`：AI_TOOLS 新增一个条目，streamChat 参数扩展，导出新函数
- `src/utils/ai-command-parser.ts`：buildContext 扩展，dispatchToolCall 新增回调类型与 case
- `src/components/CommandPalette.tsx`：新增 state 与挂载点
- `src/components/AsciiPreviewPanel.tsx`（新）：Drawer 组件
- `src/utils/asciiUtils.ts`（新）：纯函数工具集
- `src/styles/ascii-preview.css`（新）：Drawer 样式
- `src/i18n/locales/en.ts`、`zh.ts`：+17 个 keys，清理 1 处过时文案
- `README.md`：清理过时前缀说明
- 无 storage schema 变更，无 manifest 变更，无新依赖