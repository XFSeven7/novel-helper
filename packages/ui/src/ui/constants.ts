export type MobilePresetId =
  | "iphone-se"
  | "iphone-14"
  | "iphone-14-pro-max"
  | "pixel-7"
  | "galaxy-s21"
  | "ipad-mini";

export const MOBILE_PRESETS: Array<{ id: MobilePresetId; label: string; w: number; h: number }> = [
  { id: "iphone-se", label: "iPhone SE (375×667)", w: 375, h: 667 },
  { id: "iphone-14", label: "iPhone 14 (390×844)", w: 390, h: 844 },
  { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max (430×932)", w: 430, h: 932 },
  { id: "pixel-7", label: "Pixel 7 (412×915)", w: 412, h: 915 },
  { id: "galaxy-s21", label: "Galaxy S21 (360×800)", w: 360, h: 800 },
  { id: "ipad-mini", label: "iPad mini (768×1024)", w: 768, h: 1024 }
];

export type ThemeId = "midnight" | "forest" | "ocean" | "paper";

export type ThemePresetMeta = {
  id: ThemeId;
  label: string;
  previewBg: string;
  previewAccent: string;
};

export const THEME_PRESETS: ThemePresetMeta[] = [
  { id: "midnight", label: "暗夜紫", previewBg: "#0b1020", previewAccent: "#8b5cf6" },
  { id: "forest", label: "墨林", previewBg: "#0a1410", previewAccent: "#34d399" },
  { id: "ocean", label: "海蓝", previewBg: "#081420", previewAccent: "#38bdf8" },
  { id: "paper", label: "宣纸", previewBg: "#f6f2ea", previewAccent: "#7c3aed" }
];

/** @deprecated 使用 ThemeId */
export type ThemePreference = ThemeId;

export const GITHUB_REPO_URL = "https://github.com/XFSeven7/novel-helper";

export const THEME_STORAGE_KEY = "novel-helper-theme";
/** v2：默认左右栏均展开（false = 未收起） */
export const NAV_COLLAPSED_STORAGE_KEY = "novel-helper-nav-collapsed-v2";
export const RIGHT_COLLAPSED_STORAGE_KEY = "novel-helper-right-collapsed-v3";
export const LAYOUT3_SPLIT_STORAGE_KEY = "novel-helper-layout3-splits";
export const MODEL_CONFIGS_STORAGE_KEY = "novel-helper-model-configs";
export const MODEL_ACTIVE_ID_STORAGE_KEY = "novel-helper-model-active-id";

export const CHARACTER_ROLE_OPTIONS = ["主角", "配角", "反派", "盟友", "路人", "其他"] as const;
export type CharacterRole = (typeof CHARACTER_ROLE_OPTIONS)[number];

