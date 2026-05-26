import React, { useState } from "react";
import type { FeatureModelsResponse, ModelConfig } from "../../api";
import { generateReaderPersonas } from "../../api";
import { ReaderPersonasModal } from "./ReaderPersonasModal";

function ModelSelect(props: {
  value: string;
  disabled?: boolean;
  configs: ModelConfig[];
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="settingsFeatureSelect"
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value="">（未选择）</option>
      {props.configs.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
          {c.model ? ` · ${c.model}` : ""}
        </option>
      ))}
    </select>
  );
}

function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const text = e.message.trim();
  if (!text) return "请求失败";
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* not JSON */
  }
  return text;
}

function isReaderSettingsDirty(
  draft: FeatureModelsResponse | null,
  saved: FeatureModelsResponse | null | undefined
): boolean {
  if (!draft) return false;
  if (!saved) return true;
  if (Boolean(draft.features?.readerCommentsEnabled) !== Boolean(saved.features?.readerCommentsEnabled)) {
    return true;
  }
  if ((draft.featureModels?.readerComments ?? null) !== (saved.featureModels?.readerComments ?? null)) {
    return true;
  }
  if (draft.readerComments?.commentsPerChapterMin !== saved.readerComments?.commentsPerChapterMin) {
    return true;
  }
  if (draft.readerComments?.commentsPerChapterMax !== saved.readerComments?.commentsPerChapterMax) {
    return true;
  }
  return false;
}

export function SettingsFeaturesPanel(props: {
  feature: FeatureModelsResponse | null;
  savedFeature?: FeatureModelsResponse | null;
  okConfigs: ModelConfig[];
  onChange: (patch: Partial<FeatureModelsResponse>) => void;
  onSave: () => void | Promise<void>;
  onPoolRefresh?: () => void | Promise<void>;
  saveBusy: boolean;
}) {
  const f = props.feature;
  const enabled = Boolean(f?.features?.readerCommentsEnabled);
  const organizeId = f?.featureModels?.organize ?? f?.activeId ?? "";
  const readerId = f?.featureModels?.readerComments ?? "";
  const pool = f?.readerPersonaPool;
  const rc = f?.readerComments;
  const commentsMin = rc?.commentsPerChapterMin ?? pool?.commentsPerChapterMin ?? 10;
  const commentsMax = rc?.commentsPerChapterMax ?? pool?.commentsPerChapterMax ?? 16;
  const settingsDirty = isReaderSettingsDirty(f, props.savedFeature);

  const [modalOpen, setModalOpen] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function showFeedback(msg: string, kind: "ok" | "err" = "ok") {
    setFeedback({ msg, kind });
    window.setTimeout(() => setFeedback(null), 3200);
  }

  async function onGenerateReaders() {
    if (!enabled) {
      showFeedback("请先启用模拟评论", "err");
      return;
    }
    if (!readerId) {
      showFeedback("请先选择评论模型", "err");
      return;
    }
    const count = Math.round(generateCount);
    if (count < 1 || count > 50) {
      showFeedback("生成数量须在 1–50 之间", "err");
      return;
    }
    setGenerateBusy(true);
    try {
      if (isReaderSettingsDirty(f, props.savedFeature)) {
        await props.onSave();
      }
      const res = await generateReaderPersonas(count);
      showFeedback(`已添加 ${res.added} 位读者`, "ok");
      await props.onPoolRefresh?.();
    } catch (e: unknown) {
      const msg = formatApiError(e);
      if (msg.includes("模拟评论未开启")) {
        showFeedback("请先点击「保存功能设置」后再生成", "err");
      } else {
        showFeedback(msg, "err");
      }
    } finally {
      setGenerateBusy(false);
    }
  }

  function patchComments(patch: Partial<NonNullable<FeatureModelsResponse["readerComments"]>>) {
    const base = rc ?? {
      maxAiCommentsPerChapter: 6,
      commentsPerChapterMin: 10,
      commentsPerChapterMax: 16,
      useChapterAnalysisInput: true,
      npcReplyProbability: 0.3,
      readerReplyReaderProbability: 0.25,
      inviteCooldownMs: 300_000
    };
    props.onChange({ readerComments: { ...base, ...patch } });
  }

  return (
    <>
      <div className="settingsDataDirPanel">
        <p className="muted settingsDataDirHint">功能模型与模拟评论</p>
        <div className="settingsDataDirContent">
          <div className="modelField">
            <div className="navSubtitle">内容整理</div>
            <p className="muted settingsFeatureInlineDesc">本章分析、审计、写作包等</p>
            <div className="settingsDataDirRow settingsFeatureModelRow">
              <span className="muted">模型</span>
              <ModelSelect
                value={organizeId}
                configs={props.okConfigs}
                onChange={(id) =>
                  props.onChange({
                    featureModels: { ...f?.featureModels, organize: id || null },
                    activeId: id || null
                  })
                }
              />
            </div>
          </div>

          <div className="modelField">
            <div className="settingsFeatureSectionHead">
              <div className="navSubtitle">模拟评论</div>
              <label className="settingsFeatureSwitch">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    props.onChange({
                      features: { ...f?.features, readerCommentsEnabled: e.target.checked }
                    })
                  }
                />
                <span>{enabled ? "已启用" : "未启用"}</span>
              </label>
            </div>

            {pool ? (
              <div className="settingsDataDirRow settingsReaderPoolRow">
                <span className="muted">
                  {pool.totalCount} 位读者（内置 {pool.builtinCount} · 扩展 {pool.customCount}）
                </span>
                <button type="button" className="btnSort" onClick={() => setModalOpen(true)}>
                  查看读者
                </button>
              </div>
            ) : null}

            <div className={`settingsDataDirRow settingsFeatureModelRow ${!enabled ? "isDisabled" : ""}`}>
              <span className="muted">每章评论</span>
              <span className="settingsCommentsRange">
                <label className="settingsCommentsRangeField">
                  <span className="muted">最少</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    disabled={!enabled}
                    value={commentsMin}
                    onChange={(e) => patchComments({ commentsPerChapterMin: Number(e.target.value) })}
                  />
                </label>
                <label className="settingsCommentsRangeField">
                  <span className="muted">最多</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    disabled={!enabled}
                    value={commentsMax}
                    onChange={(e) => patchComments({ commentsPerChapterMax: Number(e.target.value) })}
                  />
                </label>
              </span>
            </div>

            <div className={`settingsDataDirRow settingsFeatureModelRow ${!enabled ? "isDisabled" : ""}`}>
              <span className="muted">评论模型</span>
              <ModelSelect
                value={readerId}
                disabled={!enabled}
                configs={props.okConfigs}
                onChange={(id) =>
                  props.onChange({
                    featureModels: { ...f?.featureModels, readerComments: id || null }
                  })
                }
              />
            </div>

            <div className={`settingsDataDirRow settingsFeatureModelRow ${!enabled ? "isDisabled" : ""}`}>
              <span className="muted">生成新读者</span>
              <span className="settingsGenerateReaders">
                <input
                  type="number"
                  min={1}
                  max={50}
                  disabled={!enabled || generateBusy}
                  value={generateCount}
                  onChange={(e) => setGenerateCount(Number(e.target.value))}
                  aria-label="生成读者数量"
                />
                <button
                  type="button"
                  className="btnSort"
                  disabled={!enabled || generateBusy}
                  onClick={() => void onGenerateReaders()}
                >
                  {generateBusy ? "生成中…" : "生成"}
                </button>
              </span>
            </div>

            <p className="muted settingsFeatureInlineDesc">
              读者池全库共享；存稿时自动邀请新读者（10–30 人，有冷却）。存稿后评论在后台生成。
            </p>
            {settingsDirty ? (
              <p className="muted settingsFeatureInlineDesc settingsFeatureDirtyHint">
                有未保存的更改；点击「生成」时会先自动保存功能设置。
              </p>
            ) : null}

            {feedback ? (
              <p
                className={`settingsDataDirFeedback ${feedback.kind === "err" ? "settingsDataDirFeedbackErr" : ""}`}
                role="status"
              >
                {feedback.msg}
              </p>
            ) : null}

            <button
              type="button"
              className="btnModalPrimary"
              disabled={props.saveBusy}
              onClick={() => void props.onSave()}
            >
              {props.saveBusy ? "保存中…" : "保存功能设置"}
            </button>
          </div>
        </div>
      </div>
      {modalOpen ? (
        <ReaderPersonasModal totalHint={pool?.totalCount} onClose={() => setModalOpen(false)} />
      ) : null}
    </>
  );
}
