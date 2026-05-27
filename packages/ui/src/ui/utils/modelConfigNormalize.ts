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

export function normalizeModelConfig(cfg: ModelConfig): ModelConfig {
  return normalizeCustomModelConfig(cfg);
}
