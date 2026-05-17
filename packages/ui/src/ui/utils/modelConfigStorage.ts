import {
  MODEL_ACTIVE_ID_STORAGE_KEY,
  MODEL_CONFIGS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type ThemePreference
} from "../constants";
import type { ModelConfig, ModelProviderId } from "../api";

export const BUILTIN_MODEL_PROVIDERS: Array<{ id: ModelProviderId; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "gemini", label: "Gemini" },
  { id: "qwen", label: "千问(通义千问)" },
  { id: "ollama", label: "Ollama(本地)" },
  { id: "custom", label: "自定义服务" }
];

export function defaultConfigFor(provider: ModelProviderId): ModelConfig {
  const id = `${provider}-${Date.now()}`;
  if (provider === "openai")
    return {
      id,
      label: "OpenAI",
      provider,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      testUrl: "https://api.openai.com/v1/models",
      model: "gpt-4.1-mini"
    };
  if (provider === "deepseek")
    return {
      id,
      label: "DeepSeek",
      provider,
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "",
      testUrl: "https://api.deepseek.com/v1/models",
      model: "deepseek-chat"
    };
  if (provider === "gemini")
    return {
      id,
      label: "Gemini",
      provider,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "",
      testUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      model: "gemini-1.5-flash"
    };
  if (provider === "qwen")
    return {
      id,
      label: "千问",
      provider,
      baseUrl: "https://dashscope.aliyuncs.com/api/v1",
      apiKey: "",
      testUrl: "https://dashscope.aliyuncs.com/api/v1/models",
      model: "qwen-plus"
    };
  if (provider === "ollama")
    return {
      id,
      label: "Ollama(本地)",
      provider,
      baseUrl: "http://127.0.0.1:11434",
      apiKey: "",
      testUrl: "http://127.0.0.1:11434/api/tags",
      model: ""
    };
  return {
    id,
    label: "自定义",
    provider: "custom",
    baseUrl: "",
    apiKey: "",
    testUrl: "",
    model: "",
    extraHeadersJson: "{}"
  };
}

export function loadModelConfigs(): { configs: ModelConfig[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(MODEL_CONFIGS_STORAGE_KEY);
    const activeId = localStorage.getItem(MODEL_ACTIVE_ID_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ModelConfig[]) : [];
    const byProvider = new Map<ModelProviderId, ModelConfig>();
    if (Array.isArray(parsed)) {
      for (const c of parsed) {
        if (!c?.provider) continue;
        if (!byProvider.has(c.provider)) byProvider.set(c.provider, c);
      }
    }
    const configs = BUILTIN_MODEL_PROVIDERS.map((p) => byProvider.get(p.id) ?? defaultConfigFor(p.id));
    return { configs, activeId: activeId || configs[0]?.id || null };
  } catch {
    const configs = BUILTIN_MODEL_PROVIDERS.map((p) => defaultConfigFor(p.id));
    return { configs, activeId: configs[0]?.id || null };
  }
}

function resolveSystemTheme(): ThemePreference {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function migrateLegacyTheme(raw: string | null): ThemePreference {
  if (raw === "light" || raw === "dark") return raw;
  if (raw === "system") return resolveSystemTheme();
  if (!raw) return resolveSystemTheme();
  const darkLegacy = new Set(["default", "midnight", "forest", "sunset", "ocean", "loam"]);
  const lightLegacy = new Set(["paper", "sepia", "village", "meadow", "clay"]);
  if (darkLegacy.has(raw)) return "dark";
  if (lightLegacy.has(raw)) return "light";
  return resolveSystemTheme();
}

export function loadThemePreference(): ThemePreference {
  try {
    return migrateLegacyTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}
