import React from "react";

export type SettingsTabId = "models" | "features" | "data" | "shortcuts";

export function SettingsPage(props: {
  tab: SettingsTabId;
  onTabChange: (t: SettingsTabId) => void;
  modelsPanel: React.ReactNode;
  featuresPanel: React.ReactNode;
  dataDirPanel: React.ReactNode;
  shortcutsPanel: React.ReactNode;
}) {
  return (
    <div className="settingsPage">
      <div className="browserTabsBar" role="tablist" aria-label="设置">
        <div className="browserTabsStrip">
          <button
            type="button"
            role="tab"
            className={`browserTab ${props.tab === "models" ? "active" : ""}`}
            aria-selected={props.tab === "models"}
            onClick={() => props.onTabChange("models")}
          >
            模型
          </button>
          <button
            type="button"
            role="tab"
            className={`browserTab ${props.tab === "features" ? "active" : ""}`}
            aria-selected={props.tab === "features"}
            onClick={() => props.onTabChange("features")}
          >
            功能
          </button>
          <button
            type="button"
            role="tab"
            className={`browserTab ${props.tab === "data" ? "active" : ""}`}
            aria-selected={props.tab === "data"}
            onClick={() => props.onTabChange("data")}
          >
            数据目录
          </button>
          <button
            type="button"
            role="tab"
            className={`browserTab ${props.tab === "shortcuts" ? "active" : ""}`}
            aria-selected={props.tab === "shortcuts"}
            onClick={() => props.onTabChange("shortcuts")}
          >
            快捷键
          </button>
        </div>
      </div>
      <div className="settingsPageBody">
        {props.tab === "models"
          ? props.modelsPanel
          : props.tab === "features"
            ? props.featuresPanel
            : props.tab === "data"
              ? props.dataDirPanel
              : props.shortcutsPanel}
      </div>
    </div>
  );
}
