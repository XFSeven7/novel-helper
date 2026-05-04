# novelHelper

本项目是一个 **本地写小说的网页端**：在网页里新建/编辑章节与状态卡，服务端会把内容写到你电脑的本地文件夹里（Markdown）。

## 开发启动

### 1) 安装依赖

```bash
pnpm install
```

### 2) 启动服务端 + 网页端

```bash
pnpm dev
```

- UI: `http://127.0.0.1:5177`
- Server: `http://127.0.0.1:3177`

## 本地文件落盘位置

默认写到仓库根目录下：

- `book/<bookSlug>/meta.json`
- `book/<bookSlug>/chapters/*.md`
- `book/<bookSlug>/story/*.md`
- `book/<bookSlug>/story/characters/*.md`（角色卡一人一文件）

也可以通过环境变量指定：

```bash
NOVEL_HELPER_DATA_DIR="/你的/写作目录" pnpm -C packages/server dev
```

