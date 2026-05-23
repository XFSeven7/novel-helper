# novelHelper

本地写小说的网页助手：在浏览器里管理书籍、章节与设定，正文与资料自动保存为电脑上的 Markdown / JSON 文件。数据完全在本地，无需云端账号。

## 目录

- [功能概览](#功能概览)
- [快速开始](#快速开始)
- [开发与构建](#开发与构建)
- [模型与数据目录](#模型与数据目录)
- [书籍数据说明](#书籍数据说明)
- [项目结构](#项目结构)
- [设计文档](#设计文档)
- [截图](#截图与演示)
- [许可](#许可)

---

## 功能概览

### 书架与章节写作

- **书架**：新建 / 打开书籍；简介编辑；缺失章节序号提示与补齐。
- **章节编辑**：中间栏编辑正文，自动保存为 `chapters/*.md`。
- **章节目录**：排序、审阅状态、草稿不同步提示。
- **历史存稿**：顶栏「存稿」保存版本；侧栏对照历史稿，可还原到磁盘正文。
- **全屏**：顶栏全屏；左 / 右栏可收起。

### 新书规划（书架「新书规划」页签）

- 分步向导：梗概、主线阶段、对话规则等，支持 AI 辅助生成与调整。
- 可**并行保留多条规划**，完成后创建书籍或绑定已有书。
- 书内「回顾 / 继续规划」：归档的规划 session 可再次打开，同步梗概、大纲阶段等。

### 大纲（左栏「大纲」）

- `outline.json`：全书梗概、分卷、章纲、主线阶段（「阶段」子页）。
- AI：雪花扩写、反推、章纲、伏笔体检等（需配置模型）。
- 与建书规划结果联动写入。

### 作者备注（左栏「备注」）

- 每书独立 **多笔记本**（默认「规划」不可删），条目纯文本。
- Enter 保存、Shift+Enter 换行；置顶、排序、迁移、编辑模式删笔记本。
- 数据：`notes/index.json`（与 `story/notes.md` 不互通）。

### 全局信息（左栏）

| 页签 | 说明 |
|------|------|
| **进行中** | 审计进度与待办摘要 |
| **全局信息** | 角色库、地点库、组织库、伏笔等（审计沉淀） |
| **灵感库** | 命名 / 设定灵感生成与回收站 |
| **统计** | 日更字数、热力图、章节长度、累积趋势、停更提醒 |

### 本章与正文工具（右侧 / 顶栏）

- **本章分析（流式）**：SSE 进度；切章不中断；分析结果按章落盘。
- **审计阅读**：正文高亮角色 / 地点等，悬浮卡片，可跳转右侧对象。
- **润色 / 章节调整**：左右对照，一键替换正文。
- **时间线**：章摘要、区间压缩、事件完成态、推荐压缩区间。

### 设置（顶栏齿轮）

- **模型**：OpenAI / DeepSeek / Gemini / 千问 / Ollama / 自定义等；测试通过后用于分析、审计、润色、规划等。
- **数据目录**：写作数据根目录；系统文件夹选择器；可选**迁移**到新的空目录（保存后立即生效）。

### 交互规范

- 确认 / 提示统一使用应用内对话框（`appAlert` / `appConfirm`），**不要**使用浏览器原生 `alert` / `confirm`。

---

## 快速开始

### 环境

- Node.js 18+
- [pnpm](https://pnpm.io/) 10+

### 安装与启动

```bash
pnpm install
pnpm dev
```

| 服务 | 地址 |
|------|------|
| 网页 UI | http://127.0.0.1:5177 |
| API | http://127.0.0.1:3177 |

修改 `packages/server` 或 `packages/ui` 后，若 HMR 未生效，可在项目根目录执行：

```bash
pnpm dev:restart
```

### 生产构建后本地运行

```bash
pnpm install
pnpm build
pnpm dev
```

### 用 CLI 初始化独立项目（可选）

```bash
pnpm --filter novel-helper build
novel-helper init /path/to/my-novel-project
cd /path/to/my-novel-project
pnpm install && pnpm dev
```

---

## 开发与构建

```bash
pnpm install          # 安装依赖
pnpm dev              # 并行启动 ui + server
pnpm dev:restart      # 释放 3177 / 5177 等端口后重启
pnpm build            # 构建全部 workspace 包
```

| 包 | 说明 |
|----|------|
| `packages/ui` | Vite + React 前端 |
| `packages/server` | Fastify API，读写本地文件 |
| `packages/cli` | `novel-helper init` 脚手架 |

前端开发时，`tsx watch` 与 Vite HMR 通常无需每次全量重启；仅端口占用或状态异常时再 `dev:restart`。

---

## 模型与数据目录

1. 顶栏 **设置 → 模型**：添加配置并测试连接。
2. **设置 → 数据目录**：指定书籍保存根目录；可选迁移（目标须为空文件夹）。

**Ollama** 使用 OpenAI 兼容 `/v1` 接口，便于流式输出。

### 数据目录解析优先级

1. 环境变量 `NOVEL_HELPER_DATA_DIR`（最高；设置页中目录只读展示）
2. 仓库根目录 `.novel-helper/config.json` 的 `dataDir`
3. 默认 `<仓库根>/book`

```bash
NOVEL_HELPER_DATA_DIR="/你的/写作目录" pnpm dev
```

应用配置（不随书籍迁移）：

```json
{ "dataDir": "/Users/you/Documents/my-novels" }
```

---

## 书籍数据说明

每本书以 **`bookId`（UUID）** 为磁盘目录名（`meta.json` 内同名字段）；可选 `slug` 仅作展示别名。

```
<数据根>/
├── _settings/
│   └── model-configs.json      # 全书模型配置
└── <bookId>/
    ├── meta.json                 # 书名、简介、setupSessionId 等
    ├── chapters/*.md             # 章节正文
    ├── story/                    # 资料 Markdown
    │   ├── characters/*.md
    │   ├── timeline.md / world.md / …
    ├── outline.json              # 结构化大纲
    ├── notes/index.json          # 作者备注（页签「备注」）
    ├── meta/
    │   ├── audit/                # 审计索引、分析文本等
    │   ├── inspiration/          # 灵感库
    │   └── writing-log.json      # 写作统计
    └── …
```

**写作统计**：章节保存时按正向增量累加日更；统计 API `GET /api/books/:bookId/stats`（可选 `?backfill=mtime` 粗估历史）。

**规划 session**：`meta/book-setup/`（书架「新书规划」列表，与书内回顾联动）。

---

## 项目结构

```
novelHelper/
├── packages/
│   ├── ui/                 # 前端
│   │   └── src/ui/
│   │       ├── dialog/     # 统一 alert / confirm
│   │       ├── components/
│   │       └── App.tsx
│   ├── server/             # 后端 API
│   │   └── src/
│   │       ├── bookSetup/  # 建书规划
│   │       ├── bookNotes/  # 作者备注
│   │       └── fsStore.ts
│   └── cli/                # 初始化模板
├── scripts/
│   └── restart-dev.sh
├── book/                   # 默认数据目录（可改）
├── .novel-helper/          # 本地配置（gitignore）
└── docs/
    ├── assets/             # README 截图
    └── superpowers/specs/  # 功能设计说明
```

---

## 设计文档

较新的功能在 `docs/superpowers/specs/` 下有设计说明，例如：

- 建书规划与 `bookId` 改造
- 作者备注（多笔记本）
- 应用内对话框（替代原生 alert / confirm）

实现前可先阅读对应 spec。

---

## 常见操作

| 目标 | 操作 |
|------|------|
| 新建书 | 书架 → 新建；或「新书规划」走完向导后创建 |
| 写章节 | 打开书 → 新建章节 → 中间栏编辑 |
| 配置 AI | 设置 → 模型 |
| 改数据目录 | 设置 → 数据目录 |
| 本章分析 / 审计 | 右侧「本章分析」；正文「审计」阅读模式 |
| 润色 / 调整 | 章节工具栏 → 对照确认 → 一键更换 |
| 写作统计 | 左栏「全局信息」→「统计」 |
| 随记备注 | 左栏「备注」→ 底部输入，Enter 保存 |
| 回顾规划 | 书内大纲区 / 简介侧「回顾规划」 |

---

## 截图与演示

### 分析

![分析过程演示](docs/assets/analysis.png)

### 审计

![审计功能截图](docs/assets/audit.png)

### 润色

![润色功能截图](docs/assets/polish.png)

---

## 许可

仅供本地写作与学习使用；商用或再分发请自行补充许可声明。
