#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";
import { fileURLToPath } from "node:url";

function usage() {
  console.log(`novel-helper

用法：
  novel-helper init <dir>
  novel-helper            # 在项目目录启动（pnpm install -> pnpm dev）
`);
}

function isHelp(arg?: string) {
  return arg === "-h" || arg === "--help" || arg === "help";
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  // Node 20+ 支持 fs.cp
  await fs.cp(src, dest, { recursive: true, errorOnExist: false });
}

async function initProject(targetDir: string) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js -> ../template
  const templateDir = path.resolve(here, "..", "template");
  if (!(await exists(templateDir))) {
    throw new Error(`模板目录不存在：${templateDir}`);
  }

  const absTarget = path.resolve(process.cwd(), targetDir);
  if (await exists(absTarget)) {
    const entries = await fs.readdir(absTarget);
    if (entries.length > 0) throw new Error(`目标目录非空：${absTarget}`);
  }
  await copyDir(templateDir, absTarget);

  const pkgPath = path.join(absTarget, "package.json");
  if (await exists(pkgPath)) {
    const raw = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    pkg.name = path.basename(absTarget);
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
  }

  console.log(`已初始化项目：${absTarget}`);
  console.log(`下一步：cd ${targetDir} && novel-helper`);
}

async function runProject(cwd: string) {
  const nodeModules = path.join(cwd, "node_modules");
  if (!(await exists(nodeModules))) {
    console.log("检测到未安装依赖，正在执行 pnpm install …");
    await execa("pnpm", ["install"], { cwd, stdio: "inherit" });
  }
  console.log("启动开发模式：pnpm dev …");
  await execa("pnpm", ["dev"], { cwd, stdio: "inherit" });
}

async function main() {
  const [cmd, arg1] = process.argv.slice(2);
  if (!cmd || isHelp(cmd)) {
    usage();
    return;
  }
  if (cmd === "init") {
    if (!arg1 || isHelp(arg1)) {
      usage();
      process.exitCode = 1;
      return;
    }
    await initProject(arg1);
    return;
  }

  // 默认当作 run：在当前目录启动
  if (cmd === "run") {
    await runProject(process.cwd());
    return;
  }

  // 未识别命令：按 run 处理（兼容 `novel-helper` 直接启动）
  await runProject(process.cwd());
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});

