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

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "novel-helper-theme";
export const NAV_COLLAPSED_STORAGE_KEY = "novel-helper-nav-collapsed";
export const LAYOUT3_SPLIT_STORAGE_KEY = "novel-helper-layout3-splits";
export const MODEL_CONFIGS_STORAGE_KEY = "novel-helper-model-configs";
export const MODEL_ACTIVE_ID_STORAGE_KEY = "novel-helper-model-active-id";

export const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "白天" },
  { id: "dark", label: "黑夜" }
];

export const CHARACTER_ROLE_OPTIONS = ["主角", "配角", "反派", "盟友", "路人", "其他"] as const;
export type CharacterRole = (typeof CHARACTER_ROLE_OPTIONS)[number];

