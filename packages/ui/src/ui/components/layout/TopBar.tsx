import React from "react";
import { THEME_OPTIONS, type ThemePreference } from "../../constants";
import { IconFullscreenEnter, IconFullscreenExit } from "./LayoutIcons";
import { toggleDocumentFullscreen } from "./fullscreen";

export type TopBarProps = {
  busy: boolean;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  fullscreenOn: boolean;
  onGoHome: () => void;
  onFullscreenError: (message: string) => void;
};

export function TopBar({
  busy,
  themePreference,
  onThemeChange,
  fullscreenOn,
  onGoHome,
  onFullscreenError
}: TopBarProps) {
  return (
    <header className="topbar">
      <button type="button" className="brand brandButton" onClick={() => void onGoHome()} title="返回书架">
        novel-helper
      </button>
      <div className="hint">
        默认写入 <code>book/</code>(可用 <code>NOVEL_HELPER_DATA_DIR</code> 指定根目录)
      </div>
      <div className="topbarRight">
        <div className="themeLabel">外观</div>
        <select
          className="select"
          value={themePreference}
          onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
          disabled={busy}
          title="跟随系统:随操作系统浅色/深色自动切换"
        >
          {THEME_OPTIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`btnFullscreenToggle ${fullscreenOn ? "active" : ""}`}
          onClick={() =>
            void toggleDocumentFullscreen().catch(() =>
              onFullscreenError("无法切换全屏:浏览器不支持或权限被拒绝。")
            )
          }
          title={fullscreenOn ? "退出全屏(Esc)" : "全屏显示"}
          aria-label={fullscreenOn ? "退出全屏" : "全屏"}
          aria-pressed={fullscreenOn}
        >
          {fullscreenOn ? <IconFullscreenExit /> : <IconFullscreenEnter />}
        </button>
      </div>
    </header>
  );
}
