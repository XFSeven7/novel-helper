import React from "react";
import type { ModelConfig } from "../../api";
import { BUILTIN_MODEL_PROVIDERS_NO_CUSTOM, defaultConfigFor } from "../../utils/modelConfigStorage";

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

  const customConfigs = modelConfigs.filter((c) => c.provider === "custom");

  return (
    <div className="homeModelConfig">
      {modelConfigEditorId && modelEditorDraft ? (
        <div className="homeModelEditor">
          <div className="homeModelEditorTop">
            <button
              type="button"
              className="btnBack homeModelBackBtn"
              onClick={() => {
                setModelConfigEditorId(null);
                setModelEditorDraft(null);
                setModelTestStatus("");
              }}
              disabled={busy}
            >
              返回列表
            </button>
            <div className="homeModelEditorTopRight">
              <button
                type="button"
                className="btnSort btnSortCompact"
                onClick={() => {
                  setModelState((prev) => ({ ...prev, activeId: modelEditorDraft.id }));
                  setStatus("已设为当前模型。");
                }}
                disabled={busy}
              >
                设为当前
              </button>
            </div>
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
          {modelEditorDraft.provider === "custom" ? (
            <div className="modelField">
              <div className="navSubtitle">API 基址</div>
              <input
                value={modelEditorDraft.baseUrl}
                onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, baseUrl: e.target.value })}
                placeholder="例如 https://openrouter.ai/api/v1"
                disabled={busy}
              />
              <p className="muted settingsFeatureInlineDesc" style={{ marginTop: 6 }}>
                实际调用地址；OpenRouter 等 OpenAI 兼容网关填到 /v1 即可。
              </p>
            </div>
          ) : null}
          <div className="modelField">
            <div className="navSubtitle">测试地址</div>
            <input
              value={modelEditorDraft.testUrl}
              onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, testUrl: e.target.value })}
              placeholder={
                modelEditorDraft.provider === "custom"
                  ? "例如 https://openrouter.ai/api/v1/models"
                  : "例如 https://api.openai.com/v1/models"
              }
              disabled={busy}
            />
          </div>
          <div className="modelField">
            <div className="navSubtitle">模型名(可选)</div>
            <input
              value={modelEditorDraft.model ?? ""}
              onChange={(e) => setModelEditorDraft({ ...modelEditorDraft, model: e.target.value })}
              placeholder={
                modelEditorDraft.provider === "custom"
                  ? "例如 anthropic/claude-sonnet-4 或 qwen/qwen-2.5-72b-instruct"
                  : "例如 gpt-4.1-mini / deepseek-chat / gemini-1.5-flash"
              }
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
          {modelTestStatus ? <div className="modelTestStatusLine">{modelTestStatus}</div> : null}
          {Array.isArray(modelEditorDraft.lastModels) && modelEditorDraft.lastModels.length > 0 ? (
            <div className="modelTestModelListWrap">
              <div className="navSubtitle">可用模型（{modelEditorDraft.lastModels.length}）</div>
              <ul className="modelTestModelList" role="list">
                {modelEditorDraft.lastModels.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="modelTestModelItem"
                      title="点击填入上方「模型名」"
                      disabled={busy}
                      onClick={() => setModelEditorDraft({ ...modelEditorDraft, model: name })}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="homeModelList">
          <div className="modelProviderGrid">
            {BUILTIN_MODEL_PROVIDERS_NO_CUSTOM.map((p) => {
              const c = modelConfigs.find((x) => x.provider === p.id) ?? defaultConfigFor(p.id);
              const configured =
                p.id === "ollama"
                  ? Boolean(c.baseUrl?.trim())
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

          <div className="modelCustomSection">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <div className="navSubtitle">自定义模型</div>
              <button
                type="button"
                className="btnSort"
                disabled={busy}
                onClick={() => {
                  const cfg = defaultConfigFor("custom");
                  setModelState((prev) => ({ ...prev, configs: [...prev.configs, cfg] }));
                  openModelConfigEditor(cfg.id);
                  setStatus("已新增自定义模型配置。");
                }}
              >
                + 新增
              </button>
            </div>
            {customConfigs.length ? (
              <div className="modelCustomList">
                {customConfigs.map((c) => {
                  const configured = Boolean(c.baseUrl?.trim() && c.apiKey?.trim());
                  const statusText = c.lastTestOk ? "已连接" : configured ? "已配置" : "未配置";
                  return (
                    <div key={c.id} className={`modelCustomRow ${c.id === activeModelId ? "active" : ""}`}>
                      <button
                        type="button"
                        className="modelCustomMain"
                        onClick={() => openModelConfigEditor(c.id)}
                        disabled={busy}
                        title="点击编辑"
                      >
                        <div className="modelCustomName">{c.label?.trim() || "未命名"}</div>
                        <div className="modelCustomMeta muted">
                          {statusText}
                          {c.model?.trim() ? ` · ${c.model.trim()}` : ""}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="modelCustomDel"
                        disabled={busy}
                        title="删除"
                        onClick={() => {
                          setModelState((prev) => {
                            const next = prev.configs.filter((x) => x.id !== c.id);
                            const nextActive =
                              prev.activeId === c.id ? (next[0]?.id ?? null) : prev.activeId;
                            return { configs: next, activeId: nextActive };
                          });
                          setStatus("已删除自定义模型配置。");
                        }}
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>
                还没有自定义模型配置。点击右侧「+ 新增」添加（可自定义名称）。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
