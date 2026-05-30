import React from "react";
import { GITHUB_REPO_URL, type ThemeId } from "../../constants";
import {
  IconFullscreenEnter,
  IconFullscreenExit,
  IconGitHub,
  IconSettings
} from "./LayoutIcons";
import { ThemePicker } from "./ThemePicker";
import { TopBarClock } from "./TopBarClock";
import { toggleDocumentFullscreen } from "./fullscreen";

export type TopBarProps = {
  busy: boolean;
  themeId: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  fullscreenOn: boolean;
  onGoHome: () => void;
  onFullscreenError: (message: string) => void;
  onOpenSettings: () => void;
  navCollapsed: boolean;
  onToggleNav: () => void;
  rightCollapsed: boolean;
  onToggleRight: () => void;
  trainingModeEnabled?: boolean;
  trainingEntryDisabled?: boolean;
  trainingEntryTitle?: string;
  onOpenTraining?: () => void;
};

export function TopBar({
  busy,
  themeId,
  onThemeChange,
  fullscreenOn,
  onGoHome,
  onFullscreenError,
  onOpenSettings,
  navCollapsed,
  onToggleNav,
  rightCollapsed,
  onToggleRight,
  trainingModeEnabled,
  trainingEntryDisabled,
  trainingEntryTitle,
  onOpenTraining
}: TopBarProps) {
  return (
    <header className="topbar">
      <button type="button" className="brand brandButton" onClick={() => void onGoHome()} title="返回书架">
        NovelHelper
      </button>
      <span className="topbarTagline">您的智能小说助理</span>
      <div className="topbarRight">
        <TopBarClock active={fullscreenOn} />
        <div className="layoutSideToggles" role="group" aria-label="侧栏布局">
          <button
            type="button"
            className={`layoutSideToggle ${navCollapsed ? "is-off" : "is-on"}`}
            onClick={onToggleNav}
            disabled={busy}
            aria-label={navCollapsed ? "展开左栏" : "收起左栏"}
            aria-pressed={!navCollapsed}
            title={navCollapsed ? "展开左栏" : "收起左栏"}
          >
            左栏
          </button>
          <button
            type="button"
            className={`layoutSideToggle ${rightCollapsed ? "is-off" : "is-on"}`}
            onClick={onToggleRight}
            disabled={busy}
            aria-label={rightCollapsed ? "展开右栏" : "收起右栏"}
            aria-pressed={!rightCollapsed}
            title={rightCollapsed ? "展开右栏" : "收起右栏"}
          >
            右栏
          </button>
        </div>
        {trainingModeEnabled ? (
          <button
            type="button"
            className="topbarTrainingBtn"
            disabled={busy || trainingEntryDisabled}
            title={trainingEntryTitle ?? "网文写作训练"}
            onClick={() => onOpenTraining?.()}
          >
            训练
          </button>
        ) : null}
        <ThemePicker busy={busy} themeId={themeId} onThemeChange={onThemeChange} />
        <a
          href={GITHUB_REPO_URL}
          className="btnGithubLink"
          target="_blank"
          rel="noopener noreferrer"
          title="打开 GitHub 仓库"
          aria-label="打开 GitHub 仓库"
        >
          <IconGitHub />
        </a>
        <button
          type="button"
          className="btnSettingsToggle"
          onClick={onOpenSettings}
          disabled={busy}
          title="设置"
          aria-label="设置"
        >
          <IconSettings />
        </button>
        <button
          type="button"
          className={`btnFullscreenToggle ${fullscreenOn ? "active" : ""}`}
          onClick={() =>
            void toggleDocumentFullscreen().catch(() =>
              onFullscreenError("无法切换全屏:浏览器不支持或权限被拒绝。")
            )
          }
          title={fullscreenOn ? "退出全屏(Alt+Enter 或 Esc)" : "全屏显示(Alt+Enter)"}
          aria-label={fullscreenOn ? "退出全屏" : "全屏"}
          aria-pressed={fullscreenOn}
        >
          {fullscreenOn ? <IconFullscreenExit /> : <IconFullscreenEnter />}
        </button>
      </div>
    </header>
  );
}
