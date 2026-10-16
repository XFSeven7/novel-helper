const STYLE_ID = "novel-helper-custom-font";
const FACES_STYLE_ID = "novel-helper-custom-font-faces";

const SYSTEM_STACK =
  'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

const HARMONY_STACK =
  '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

const SOURCE_HAN_STACK =
  '"Source Han Sans SC", "Source Han Sans CN", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';

const NOTO_STACK =
  '"Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif';

const YAHEI_STACK = '"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans SC", sans-serif';

const SANS_STACK =
  'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

const SERIF_STACK =
  'ui-serif, "PingFang SC", "Noto Serif SC", "Songti SC", "Source Han Serif SC", serif';

const SONG_STACK = '"Songti SC", SimSun, "Noto Serif SC", serif';

const KAI_STACK = '"Kaiti SC", KaiTi, "STKaiti", serif';

export const FONT_PRESET_STACKS: Record<string, string> = {
  system: SYSTEM_STACK,
  harmony: HARMONY_STACK,
  sourceHan: SOURCE_HAN_STACK,
  noto: NOTO_STACK,
  yahei: YAHEI_STACK,
  sans: SANS_STACK,
  serif: SERIF_STACK,
  song: SONG_STACK,
  kai: KAI_STACK
};

export function customFontFamilyName(id: string): string {
  return `NovelHelperCustom-${id}`;
}

export function customFontIdFromFontId(fontId: string): string | null {
  if (!fontId.startsWith("custom:")) return null;
  const id = fontId.slice("custom:".length).trim();
  return id || null;
}

export function resolveFontFamily(fontId: string): string {
  const customId = customFontIdFromFontId(fontId);
  if (customId) return `"${customFontFamilyName(customId)}", ${SYSTEM_STACK}`;
  return FONT_PRESET_STACKS[fontId] ?? FONT_PRESET_STACKS.system;
}

function apiBase(): string {
  return (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:3177";
}

export function fontFileUrl(id: string): string {
  return `${apiBase()}/api/fonts/${encodeURIComponent(id)}/file`;
}

export function ensureCustomFontFaces(ids: string[]): void {
  let styleEl = document.getElementById(FACES_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = FACES_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = [...new Set(ids.filter(Boolean))]
    .map((id) => {
      const family = customFontFamilyName(id);
      return `@font-face{font-family:"${family}";src:url("${fontFileUrl(id)}");font-display:swap;}`;
    })
    .join("\n");
}

export function applyFontToDocument(fontId?: string): void {
  const root = document.documentElement;
  const customId = fontId ? customFontIdFromFontId(fontId) : null;
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (customId) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    const url = fontFileUrl(customId);
    const family = customFontFamilyName(customId);
    styleEl.textContent = `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
  } else if (styleEl) {
    styleEl.textContent = "";
  }
  if (!fontId || fontId === "system") {
    root.style.removeProperty("--app-font-family");
  } else {
    root.style.setProperty("--app-font-family", resolveFontFamily(fontId));
  }
}
