import type { ModelConfig } from "../api";

export const MODEL_CONFIG_ID_SEP = "::";

export type ModelSelectOption = {
  value: string;
  label: string;
  group?: string;
};

export function parseModelConfigId(raw: string | null | undefined): { configId: string; modelName?: string } | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const sep = t.indexOf(MODEL_CONFIG_ID_SEP);
  if (sep > 0) {
    const configId = t.slice(0, sep);
    const modelName = t.slice(sep + MODEL_CONFIG_ID_SEP.length).trim();
    if (!configId) return null;
    return { configId, modelName: modelName || undefined };
  }
  return { configId: t };
}

export function modelConfigIdMatches(configId: string, raw: string | null | undefined): boolean {
  const parsed = parseModelConfigId(raw);
  return parsed?.configId === configId;
}

/** 将测试连接得到的 lastModels 展开为功能设置里的可选项。 */
export function buildModelSelectOptions(configs: ModelConfig[]): ModelSelectOption[] {
  const out: ModelSelectOption[] = [];
  for (const c of configs) {
    const names = Array.isArray(c.lastModels)
      ? [...new Set(c.lastModels.map((x) => String(x).trim()).filter(Boolean))]
      : [];
    if (names.length) {
      names.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
      for (const name of names) {
        out.push({ value: `${c.id}${MODEL_CONFIG_ID_SEP}${name}`, label: name, group: c.label });
      }
      const defaultModel = (c.model ?? "").trim();
      if (defaultModel && !names.includes(defaultModel)) {
        out.push({
          value: c.id,
          label: `${defaultModel}（配置默认）`,
          group: c.label
        });
      }
      continue;
    }
    const defaultModel = (c.model ?? "").trim();
    out.push({
      value: c.id,
      label: defaultModel ? `${c.label} · ${defaultModel}` : c.label
    });
  }
  return out;
}

export function resolveModelSelectLabel(configs: ModelConfig[], rawId: string | null | undefined): string {
  const parsed = parseModelConfigId(rawId);
  if (!parsed) return "未配置";
  const cfg = configs.find((c) => c.id === parsed.configId);
  if (!cfg) return "未配置";
  if (parsed.modelName) return `${cfg.label} · ${parsed.modelName}`;
  const name = (cfg.model ?? "").trim();
  return name ? `${cfg.label} · ${name}` : cfg.label;
}
