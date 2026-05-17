import React from "react";
import type { ModelConfig } from "../../api";
import { BUILTIN_MODEL_PROVIDERS, defaultConfigFor } from "../../utils/modelConfigStorage";

export type SettingsModelsPanelProps = {
  busy: boolean;
  modelConfigs: ModelConfig[];
  activeModelId: string | null;
  modelConfigEditorId: string | null;
  modelEditorDraft: ModelConfig | null;
  modelTestStatus: string;
  setModelConfigEditorId: (id: string | null) => void;
  setModelEditorDraft: React.Dispatch<React.SetStateAction<ModelConfig | null>>;
  setModelTestStatus: (msg: string) => void;
  setModelState: React.Dispatch<React.SetStateAction<{ configs: ModelConfig[]; activeId: string | null }>>;
  openModelConfigEditor: (id: string) => void;
  testModelConfigDraft: () => void | Promise<void>;
  saveModelConfigDraft: () => void;
  setStatus: (msg: string) => void;
};

export function SettingsModelsPanel(props: SettingsModelsPanelProps) {
  const {
    busy,
    modelConfigs,
    activeModelId,
    modelConfigEditorId,
    modelEditorDraft,
    modelTestStatus,
    setModelConfigEditorId,
    setModelEditorDraft,
    setModelTestStatus,
    setModelState,
    openModelConfigEditor,
    testModelConfigDraft,
    saveModelConfigDraft,
    setStatus
  } = props;

  return (
    <div className="homeModelConfig">
      {modelConfigEditorId && modelEditorDraft ? (
        <div className="homeModelEditor">
          <div className="row">
            <button
              type="button"
              className="btnBack"
              onClick={() => {
                setModelConfigEditorId(null);
                setModelEditorDraft(null);
                setModelTestStatus("");
              }}
              disabled={busy}
            >
              返回列表
            </button>
            <button
              type="button"
              className="btnSort"
              onClick={() => {
                setModelState((prev) => ({ ...prev, activeId: modelEditorDraft.id }));
                setStatus("已设为当前模型。");
              }}
              disabled={busy}
            >
              设为当前
            </button>
          </div>
          <div className="modelField">
            <div className="navSubtitle">名称</div>
            <input
              value={modelEditorDraft.label}
              onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, label: e.target.value })}
              disabled={busy}
            />
          </div>
          <div className="modelField">
            <div className="navSubtitle">API Key</div>
            <input
              value={modelEditorDraft.apiKey}
              onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, apiKey: e.target.value })}
              placeholder="可留空(如 Ollama)"
              disabled={busy}
            />
          </div>
          <div className="modelField">
            <div className="navSubtitle">测试地址</div>
            <input
              value={modelEditorDraft.testUrl}
              onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, testUrl: e.target.value })}
              placeholder="例如 https://api.openai.com/v1/models"
              disabled={busy}
            />
          </div>
          <div className="modelField">
            <div className="navSubtitle">模型名(可选)</div>
            <input
              value={modelEditorDraft.model ?? ""}
              onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, model: e.target.value })}
              placeholder="例如 gpt-4.1-mini / deepseek-chat / gemini-1.5-flash"
              disabled={busy}
            />
          </div>
          {modelEditorDraft.provider === "custom" ? (
            <div className="modelField">
              <div className="navSubtitle">额外 Headers(JSON,可选)</div>
              <textarea
                className="modelHeadersTextarea"
                value={modelEditorDraft.extraHeadersJson ?? ""}
                onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, extraHeadersJson: e.target.value })}
                placeholder='例如 {"X-My-Header":"123"}'
                disabled={busy}
                rows={3}
              />
            </div>
          ) : null}
          <div className="row">
            <button type="button" className="btnSort" onClick={() => void testModelConfigDraft()} disabled={busy}>
              测试连接
            </button>
            <button
              type="button"
              className="btnModalPrimary"
              onClick={() => saveModelConfigDraft()}
              disabled={busy || !modelEditorDraft.label.trim()}
            >
              保存
            </button>
          </div>
          {modelTestStatus ? <div className="empty">{modelTestStatus}</div> : null}
        </div>
      ) : (
        <div className="homeModelList">
          <div className="modelProviderGrid">
            {BUILTIN_MODEL_PROVIDERS.map((p) => {
              const c = modelConfigs.find((x) => x.provider === p.id) ?? defaultConfigFor(p.id);
              const configured =
                p.id === "ollama"
                  ? Boolean(c.baseUrl?.trim())
                  : p.id === "custom"
                    ? Boolean(c.testUrl?.trim() || c.baseUrl?.trim())
                    : Boolean(c.apiKey?.trim());
              const statusText = c.lastTestOk ? "已连接" : configured ? "已配置" : "未配置";
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`modelProviderCard ${c.id === activeModelId ? "active" : ""}`}
                  onClick={() => openModelConfigEditor(c.id)}
                  disabled={busy}
                  title="点击配置"
                >
                  <div className="modelProviderTop">
                    <div className="modelProviderName">{p.label}</div>
                    <span className={`modelProviderDot ${c.lastTestOk ? "ok" : configured ? "warn" : "off"}`} />
                  </div>
                  <div className="modelProviderStatus">{statusText}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
