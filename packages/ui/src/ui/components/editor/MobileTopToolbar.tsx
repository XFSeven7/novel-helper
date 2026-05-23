import React from "react";
import {
  MOBILE_FONT_PX_MAX,
  MOBILE_FONT_PX_MIN,
  MOBILE_FONT_PX_STEP
} from "./mobileFontSize";

export function MobileTopToolbar({
  fontSizePx,
  onFontSizeChange,
  disabled,
  children
}: {
  fontSizePx: number;
  onFontSizeChange: (delta: number) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const atMin = fontSizePx <= MOBILE_FONT_PX_MIN;
  const atMax = fontSizePx >= MOBILE_FONT_PX_MAX;

  return (
    <div className="mobileTopBar" role="toolbar" aria-label="移动预览工具栏">
      {children ? <div className="mobileTopBarActions">{children}</div> : null}
      <div className="mobileTopBarFont" aria-label="字号（左右屏同步）">
        <button
          type="button"
          className="mobileFontBtn"
          disabled={disabled || atMin}
          aria-label="缩小字号"
          title="缩小字号（左右屏同步）"
          onClick={() => onFontSizeChange(-MOBILE_FONT_PX_STEP)}
        >
          −
        </button>
        <span className="mobileFontLabel">{fontSizePx}px</span>
        <button
          type="button"
          className="mobileFontBtn"
          disabled={disabled || atMax}
          aria-label="放大字号"
          title="放大字号（左右屏同步）"
          onClick={() => onFontSizeChange(MOBILE_FONT_PX_STEP)}
        >
          +
        </button>
      </div>
    </div>
  );
}
