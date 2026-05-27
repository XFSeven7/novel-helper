import { MODEL_ACTIVE_ID_STORAGE_KEY, MODEL_CONFIGS_STORAGE_KEY } from "../constants";
import type { ModelConfig, ModelProviderId } from "../api";

export const BUILTIN_MODEL_PROVIDERS: Array<{ id: ModelProviderId; label: string }> = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "gemini", label: "Gemini" },
  { id: "qwen", label: "千问(通义千问)" },
  { id: "ollama", label: "Ollama(本地)" },
  { id: "custom", label: "自定义服务" }
];

export const BUILTIN_MODEL_PROVIDERS_NO_CUSTOM = BUILTIN_MODEL_PROVIDERS.filter((p) => p.id !== "custom");

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
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    testUrl: "https://openrouter.ai/api/v1/models",
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
    const customs: ModelConfig[] = [];
    if (Array.isArray(parsed)) {
      for (const c of parsed) {
        if (!c?.provider) continue;
        if (c.provider === "custom") {
          customs.push(c);
          continue;
        }
        if (!byProvider.has(c.provider)) byProvider.set(c.provider, c);
      }
    }
    const builtin = BUILTIN_MODEL_PROVIDERS_NO_CUSTOM.map((p) => byProvider.get(p.id) ?? defaultConfigFor(p.id));
    const configs = [...builtin, ...customs];
    const nextActiveId = activeId && configs.some((c) => c.id === activeId) ? activeId : configs[0]?.id || null;
    return { configs, activeId: nextActiveId };
  } catch {
    const configs = BUILTIN_MODEL_PROVIDERS_NO_CUSTOM.map((p) => defaultConfigFor(p.id));
    return { configs, activeId: configs[0]?.id || null };
  }
}

export { loadThemeId as loadThemePreference, migrateLegacyTheme, saveThemeId as saveThemePreference } from "./themeStorage";
