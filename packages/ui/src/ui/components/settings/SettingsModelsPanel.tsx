import React, { useMemo, useState } from "react";
import {
  clearModelBenchmarkHistory,
  getModelBenchmarkHistory,
  patchModelBenchmarkRecordClient,
  runModelBenchmark,
  type ModelBenchmarkRecord,
  type ModelConfig
} from "../../api";
import { AppSelect } from "../common/AppSelect";
import { BUILTIN_MODEL_PROVIDERS_NO_CUSTOM, defaultConfigFor } from "../../utils/modelConfigStorage";
import {
  buildModelSelectOptions,
  parseModelConfigId,
  resolveModelSelectLabel
} from "../../utils/modelSelectOptions";

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
  const okConfigs = useMemo(() => modelConfigs.filter((c) => c.lastTestOk), [modelConfigs]);

  const [benchOpen, setBenchOpen] = useState(false);
  const [benchModelSelectValue, setBenchModelSelectValue] = useState<string>("");
  const benchModelOptions = useMemo(() => buildModelSelectOptions(okConfigs), [okConfigs]);
  const benchModelLabel = useMemo(
    () => resolveModelSelectLabel(okConfigs, benchModelSelectValue),
    [okConfigs, benchModelSelectValue]
  );
  const [benchInput, setBenchInput] = useState<string>("");
  const [benchBusy, setBenchBusy] = useState(false);
  const [benchErr, setBenchErr] = useState<string>("");
  const [benchOutput, setBenchOutput] = useState<string>("");
  const [benchRecord, setBenchRecord] = useState<ModelBenchmarkRecord | null>(null);
  const [benchHistory, setBenchHistory] = useState<ModelBenchmarkRecord[]>([]);

  function recordTotalMs(r: ModelBenchmarkRecord): number | undefined {
    const client = r.timeline?.client_total_ms;
    if (typeof client === "number" && Number.isFinite(client)) return Math.max(0, client);
    const server = r.durations?.server_total_ms;
    if (typeof server === "number" && Number.isFinite(server)) return Math.max(0, server);
    const tl = r.timeline;
    if (typeof tl?.t_srv_respond_done_ms === "number" && typeof tl?.t_srv_received_ms === "number") {
      return Math.max(0, tl.t_srv_respond_done_ms - tl.t_srv_received_ms);
    }
    return undefined;
  }

  function fmtSeconds(ms: number | null | undefined): string {
    if (typeof ms !== "number" || !Number.isFinite(ms)) return "-";
    const v = Math.max(0, ms);
    return `${(v / 1000).toFixed(2)}s`;
  }

  async function openBenchmarkModal() {
    if (busy) return;
    setBenchErr("");
    setBenchOutput("");
    setBenchRecord(null);
    setBenchBusy(false);
    setBenchOpen(true);

    const options = buildModelSelectOptions(okConfigs);
    setBenchModelSelectValue((prev) => {
      if (prev && options.some((o) => o.value === prev)) return prev;
      return options[0]?.value ?? "";
    });
    try {
      const res = await getModelBenchmarkHistory(50);
      setBenchHistory(res.items || []);
    } catch {
      // ignore: history is optional UX
    }
  }

  async function runBenchmarkNow() {
    if (benchBusy || busy) return;
    if (!okConfigs.length) {
      setBenchErr("没有可用模型，请先在设置中配置并测试连接。");
      return;
    }
    const parsed = parseModelConfigId(benchModelSelectValue);
    const modelConfigId = parsed?.configId?.trim() ?? "";
    const input = benchInput.trim();
    if (!modelConfigId) {
      setBenchErr("请选择模型。");
      return;
    }
    if (!input) {
      setBenchErr("请输入测试内容。");
      return;
    }
    setBenchErr("");
    setBenchBusy(true);
    setBenchOutput("");
    setBenchRecord(null);
    const tStart = performance.now();
    try {
      const res = await runModelBenchmark({
        modelConfigId,
        model: parsed?.modelName,
        input,
        client: {}
      });
      const tDone = performance.now();
      const clientTotalMs = Math.max(0, tDone - tStart);
      const record = res.record;
      record.timeline = {
        ...record.timeline,
        client_total_ms: clientTotalMs
      };
      void patchModelBenchmarkRecordClient(record.id, { client_total_ms: clientTotalMs }).catch(() => {});
      setBenchRecord(record);
      setBenchOutput(res.outputText || "");
      setBenchHistory((prev) => [record, ...prev].slice(0, 50));
    } catch (e: any) {
      setBenchErr(e?.message || String(e));
    } finally {
      setBenchBusy(false);
    }
  }

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

          <div className="modelCustomSection">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div className="navSubtitle">模型测速</div>
              <button type="button" className="btnSort" disabled={busy} onClick={() => void openBenchmarkModal()}>
                + 新测速
              </button>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              输入一段文本，调用所选模型生成输出，并展示端到端与分段耗时（本地接口 / 上游模型等）。
            </div>
          </div>
        </div>
      )}

      {benchOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onClick={() => {
            if (!benchBusy) setBenchOpen(false);
          }}
        >
          <div
            className="modalPanel modalPanelOpaque modalPanelLarge modalPanelNoClip"
            role="dialog"
            aria-modal="true"
            aria-label="模型测速"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modalHeading">模型测速</h2>

            <div className="modalField">
              <label className="modalLabel">
                模型<span className="modalReq">*</span>
              </label>
              <AppSelect
                value={benchModelSelectValue}
                displayLabel={benchModelLabel}
                options={benchModelOptions}
                disabled={benchBusy || busy}
                emptyText="没有可用模型，请先测试连接"
                onChange={setBenchModelSelectValue}
              />
              <div className="muted" style={{ marginTop: 6 }}>
                仅显示已连接的配置；与「功能」页模型列表一致。请先在该配置里点「测试连接」。
              </div>
            </div>

            <div className="modalScrollBody">
              <div className="modalField">
                <label className="modalLabel">
                  输入文本<span className="modalReq">*</span>
                </label>
                <textarea
                  className="modalTextarea"
                  value={benchInput}
                  onChange={(e) => setBenchInput(e.target.value)}
                  placeholder="随便输入一些内容，点击开始测速…"
                  disabled={benchBusy || busy}
                />
              </div>

              {benchErr ? (
                <div className="muted" style={{ color: "var(--danger)", marginBottom: 10, whiteSpace: "pre-wrap" }}>
                  {benchErr}
                </div>
              ) : null}

              <div className="modalActions modalActionsWrap">
                <button
                  type="button"
                  className="btnModalSecondary"
                  disabled={benchBusy || busy}
                  onClick={() => setBenchOpen(false)}
                >
                  关闭
                </button>
                <button
                  type="button"
                  className="btnModalPrimary"
                  disabled={benchBusy || busy}
                  onClick={() => void runBenchmarkNow()}
                >
                  {benchBusy ? "测速中..." : "开始测速"}
                </button>
              </div>

              {benchRecord ? (
                <div style={{ marginTop: 14 }}>
                <div className="navSubtitle">耗时流水线（s）</div>
                  <div className="muted" style={{ marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                  <div>端到端总耗时：{fmtSeconds(recordTotalMs(benchRecord))}</div>
                  <div>本地接口总耗时：{fmtSeconds(benchRecord.durations?.server_total_ms)}</div>
                  <div>本地接口内部开销：{fmtSeconds(benchRecord.durations?.server_overhead_ms)}</div>
                  <div>上游模型首 token：{fmtSeconds(benchRecord.durations?.model_ttfb_ms)}</div>
                  <div>上游模型完整生成：{fmtSeconds(benchRecord.durations?.model_total_ms)}</div>
                  <div>本地接口后处理：{fmtSeconds(benchRecord.durations?.server_postprocess_ms)}</div>
                  <div>本地接口写回：{fmtSeconds(benchRecord.durations?.server_respond_ms)}</div>
                  </div>

                  <div className="navSubtitle" style={{ marginTop: 12 }}>
                    模型输出
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      margin: "8px 0 0",
                      padding: "10px 12px",
                      border: "1px solid var(--border)",
                      background: "var(--panel2, var(--panel))",
                      maxHeight: 240,
                      overflow: "auto"
                    }}
                  >
                    {benchOutput || "(空)"}
                  </pre>
                </div>
              ) : null}

              {benchHistory.length ? (
                <div style={{ marginTop: 16 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="navSubtitle">最近记录（最多 50 条）</div>
                    <button
                      type="button"
                      className="btnSort btnSortCompact"
                      disabled={benchBusy || busy}
                    onClick={async () => {
                      if (benchBusy || busy) return;
                      try {
                        await clearModelBenchmarkHistory();
                      } catch {
                        // ignore: still clear locally for UX
                      }
                      setBenchHistory([]);
                        if (benchRecord) {
                          setBenchRecord(null);
                          setBenchOutput("");
                        }
                      }}
                    title="删除测速记录"
                    >
                      清空记录
                    </button>
                  </div>
                  <ul className="modelTestModelList" role="list" style={{ marginTop: 8 }}>
                    {benchHistory.slice(0, 10).map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="modelTestModelItem"
                          disabled={benchBusy || busy}
                          title="点击查看该次结果"
                          onClick={() => {
                            setBenchRecord(r);
                            setBenchOutput(r.outputPreview || "");
                          }}
                        >
                        {r.ok ? "✅" : "❌"} {r.modelLabel}
                        {r.modelName ? ` · ${r.modelName}` : ""} · {new Date(r.createdAt).toLocaleString()} ·{" "}
                        {fmtSeconds(recordTotalMs(r))}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
