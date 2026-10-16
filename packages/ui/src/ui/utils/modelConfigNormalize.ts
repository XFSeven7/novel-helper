import type { ModelConfig } from "../api";

/** 自定义 OpenAI 兼容服务：补全 baseUrl / testUrl，避免只填测试地址导致分析报 Invalid URL。 */
export function normalizeCustomModelConfig(cfg: ModelConfig): ModelConfig {
  if (cfg.provider !== "custom") return cfg;

  let baseUrl = (cfg.baseUrl || "").trim().replace(/\/$/, "");
  let testUrl = (cfg.testUrl || "").trim();

  const tryParse = (raw: string) => {
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  };

  if (!baseUrl && testUrl) {
    const u = tryParse(testUrl);
    if (u) {
      if (u.pathname.endsWith("/models")) {
        baseUrl = testUrl.replace(/\/models\/?$/, "");
      } else if (/\/v\d+(\/)?$/.test(u.pathname) || u.pathname === "/api/v1") {
        baseUrl = testUrl.replace(/\/$/, "");
        if (!testUrl.endsWith("/models")) {
          testUrl = `${baseUrl}/models`;
        }
      }
    }
  }

  if (baseUrl && !testUrl) {
    testUrl = `${baseUrl}/models`;
  }

  return { ...cfg, baseUrl, testUrl };
}

function clampRequestTimeoutSec(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  if (n <= 0) return undefined;
  return Math.min(Math.max(n, 30), 3600);
}

export function normalizeModelConfig(cfg: ModelConfig): ModelConfig {
  const next = normalizeCustomModelConfig(cfg);
  if (next.provider !== "ollama" && next.provider !== "lmstudio") {
    if (next.requestTimeoutSec == null) return next;
    const { requestTimeoutSec: _drop, ...rest } = next;
    return rest;
  }
  const requestTimeoutSec = clampRequestTimeoutSec(next.requestTimeoutSec);
  if (requestTimeoutSec == null) {
    const { requestTimeoutSec: _drop, ...rest } = next;
    return rest;
  }
  return { ...next, requestTimeoutSec };
}
