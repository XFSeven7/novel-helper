export const MOBILE_FONT_PX_DEFAULT = 17;
export const MOBILE_FONT_PX_MIN = 14;
export const MOBILE_FONT_PX_MAX = 28;
export const MOBILE_FONT_PX_STEP = 1;
const STORAGE_KEY = "novelHelper.mobileFontPx";

export function readStoredMobileFontPx(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(n) && n >= MOBILE_FONT_PX_MIN && n <= MOBILE_FONT_PX_MAX) return Math.round(n);
  } catch {
    /* ignore */
  }
  return MOBILE_FONT_PX_DEFAULT;
}

export function storeMobileFontPx(px: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    /* ignore */
  }
}

export function clampMobileFontPx(px: number) {
  return Math.min(MOBILE_FONT_PX_MAX, Math.max(MOBILE_FONT_PX_MIN, Math.round(px)));
}
