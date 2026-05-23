import React, { useMemo, useState } from "react";
import type { ChapterMeta, OutlineAiMode, OutlineIndex, VolumeOutline } from "../../api";
import { useOutline } from "../../hooks/useOutline";
import { OutlineAiPreviewModal } from "./OutlineAiPreviewModal";
import { OutlineMainlinePanel } from "./OutlineMainlinePanel";
import { OutlineTextarea } from "./OutlineTextarea";
import { appConfirm } from "../../dialog/dialog";

export type OutlineWorkspaceProps = {
  slug: string;
  chapters: ChapterMeta[];
  busy: boolean;
  activeModelId: string | null;
  bookSynopsis?: string;
  onOpenChapter: (chapter: ChapterMeta) => void;
  onStatus?: (msg: string) => void;
  /** 变更时强制重新拉取 outline（如规划同步到本书后） */
  refreshToken?: number;
};

type SubTab = "book" | "stages" | "volumes" | "chapters";

export function OutlineWorkspace({
  slug,
  chapters,
  busy,
  activeModelId,
  bookSynopsis,
  onOpenChapter,
  onStatus,
  refreshToken = 0
}: OutlineWorkspaceProps) {
  const { outline, loading, saving, aiBusy, err, updateOutline, runAi, applyPreview, saveNow } = useOutline(
    slug,
    refreshToken
  );
  const [subTab, setSubTab] = useState<SubTab>("book");
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [selectedChapterFilename, setSelectedChapterFilename] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<Partial<OutlineIndex> | { report: string } | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [targetVolumes, setTargetVolumes] = useState(3);
  const [lastAiMode, setLastAiMode] = useState<OutlineAiMode | null>(null);
  const [snowflakeOpen, setSnowflakeOpen] = useState(false);

  const chapterByFilename = useMemo(() => new Map(chapters.map((c) => [c.filename, c])), [chapters]);

  const selectedVolume = outline?.volumes.find((v) => v.id === selectedVolumeId) ?? outline?.volumes[0] ?? null;

  if (loading && !outline) {
    return <OutlineEmpty>加载大纲…</OutlineEmpty>;
  }
  if (!outline) {
    return <OutlineEmpty>{err || "无法加载大纲"}</OutlineEmpty>;
  }

  const disabled = busy || saving || aiBusy;

  const triggerAi = async (mode: OutlineAiMode, extra?: { volumeId?: string; chapterFilename?: string }) => {
    setLastAiMode(mode);
    try {
      onStatus?.("AI 生成中…");
      const { preview, warnings } = await runAi({
        mode,
        modelConfigId: activeModelId,
        instruction: aiInstruction.trim() || undefined,
        volumeId: extra?.volumeId ?? selectedVolume?.id,
        chapterFilename: extra?.chapterFilename ?? selectedChapterFilename ?? undefined,
        options: {
          logline: outline.book.logline,
          targetVolumes: mode === "snowflake" ? targetVolumes : undefined,
          useWorld: true,
          useForeshadows: true,
          useTimeline: true
        }
      });
      setAiPreview(preview);
      setAiWarnings(warnings || []);
      setAiModalOpen(true);
      onStatus?.("AI 完成，请预览");
    } catch {
      onStatus?.("AI 失败");
    }
  };

  const applyAi = async (overwrite: boolean) => {
    if (!aiPreview) return;
    try {
      await applyPreview(aiPreview, overwrite);
      setAiModalOpen(false);
      setAiPreview(null);
      onStatus?.("已应用 AI 大纲");
    } catch {
      onStatus?.("应用失败");
    }
  };

  const addVolume = () => {
    const id = `vol-${Date.now()}`;
    const order = (outline.volumes.length ? Math.max(...outline.volumes.map((v) => v.order)) : 0) + 1;
    updateOutline((prev) => ({
      ...prev,
      volumes: [...prev.volumes, { id, title: `第${order}卷`, order, synopsis: "", chapterFilenames: [] }]
    }));
    setSelectedVolumeId(id);
    setSubTab("volumes");
  };

  const assignToVolume = (volumeId: string, filename: string) => {
    updateOutline((prev) => {
      const volumes = prev.volumes.map((v) => {
        const without = v.chapterFilenames.filter((f) => f !== filename);
        if (v.id === volumeId) return { ...v, chapterFilenames: [...without, filename] };
        return { ...v, chapterFilenames: without };
      });
      const ungroupedFilenames = prev.ungroupedFilenames.filter((f) => f !== filename);
      return { ...prev, volumes, ungroupedFilenames };
    });
  };

  const removeFromVolume = (volumeId: string, filename: string) => {
    updateOutline((prev) => {
      const volumes = prev.volumes.map((v) =>
        v.id === volumeId ? { ...v, chapterFilenames: v.chapterFilenames.filter((f) => f !== filename) } : v
      );
      const ungroupedFilenames = prev.ungroupedFilenames.includes(filename)
        ? prev.ungroupedFilenames
        : [...prev.ungroupedFilenames, filename];
      return { ...prev, volumes, ungroupedFilenames };
    });
  };

  const updateChapterPlan = (filename: string, patch: Partial<OutlineIndex["chapterPlans"][string]>) => {
    updateOutline((prev) => ({
      ...prev,
      chapterPlans: {
        ...prev.chapterPlans,
        [filename]: { ...(prev.chapterPlans[filename] || {}), ...patch, updatedAt: new Date().toISOString() }
      }
    }));
  };

  const deleteVolume = async (volumeId: string) => {
    const vol = outline.volumes.find((v) => v.id === volumeId);
    if (!vol) return;
    const n = vol.chapterFilenames.length;
    const msg =
      n === 0
        ? `删除卷「${vol.title}」？`
        : `卷内 ${n} 章将移回「未分卷」，并删除卷「${vol.title}」。确定继续？`;
    if (!(await appConfirm({ message: msg, variant: "danger" }))) return;
    const moving = vol.chapterFilenames;
    const remaining = outline.volumes.filter((v) => v.id !== volumeId);
    updateOutline((prev) => {
      const ungroupedSet = new Set([...prev.ungroupedFilenames, ...moving]);
      return {
        ...prev,
        volumes: prev.volumes.filter((v) => v.id !== volumeId),
        ungroupedFilenames: [...ungroupedSet]
      };
    });
    setSelectedVolumeId((current) => (current === volumeId ? (remaining[0]?.id ?? null) : current));
  };

  const plan = selectedChapterFilename ? outline.chapterPlans[selectedChapterFilename] : undefined;

  return (
    <OutlineRoot>
      <div className="outlineHeader">
        <OutlineToolbar>
          <OutlineStatus saving={saving} aiBusy={aiBusy} err={err} />
          <OutlineAiMenu disabled={disabled} onSelect={(mode) => void triggerAi(mode)} />
          <button
            type="button"
            className="btnSort"
            disabled={disabled}
            onClick={() => void saveNow(outline)}
            title="立即保存"
          >
            保存
          </button>
        </OutlineToolbar>

        <OutlineInstruction value={aiInstruction} disabled={disabled} onChange={setAiInstruction} />

        <OutlineSubTabs subTab={subTab} onChange={setSubTab} />
      </div>

      <div className="outlineBody">
      {subTab === "book" ? (
        <BookPanel
          outline={outline}
          bookSynopsis={bookSynopsis}
          disabled={disabled}
          onBookChange={(book) => updateOutline((prev) => ({ ...prev, book }))}
          onOpenSnowflake={() => setSnowflakeOpen(true)}
        />
      ) : null}

      {subTab === "stages" ? (
        <OutlineMainlinePanel
          book={outline.book}
          disabled={disabled}
          onBookChange={(book) => updateOutline((prev) => ({ ...prev, book }))}
        />
      ) : null}

      {subTab === "volumes" ? (
        <VolumesPanel
          outline={outline}
          chapters={chapters}
          selectedVolume={selectedVolume}
          disabled={disabled}
          onSelectVolume={setSelectedVolumeId}
          onAddVolume={addVolume}
          onUpdateVolume={(vol) =>
            updateOutline((prev) => ({
              ...prev,
              volumes: prev.volumes.map((v) => (v.id === vol.id ? vol : v))
            }))
          }
          onAssign={assignToVolume}
          onRemove={removeFromVolume}
          onDeleteVolume={deleteVolume}
          onBatchPlans={(volumeId) => void triggerAi("volumeChapterPlans", { volumeId })}
        />
      ) : null}

      {subTab === "chapters" ? (
        <ChaptersPanel
          outline={outline}
          chapterByFilename={chapterByFilename}
          chapterCount={chapters.length}
          selectedFilename={selectedChapterFilename}
          plan={plan}
          disabled={disabled}
          onSelect={(filename) => {
            setSelectedChapterFilename(filename);
          }}
          onOpenChapter={onOpenChapter}
          onUpdatePlan={updateChapterPlan}
          onRefinePlan={(filename) => void triggerAi("refineChapterPlan", { chapterFilename: filename })}
          onFromChapters={() => void triggerAi("fromChapters")}
        />
      ) : null}
      </div>

      <SnowflakeDialog
        open={snowflakeOpen}
        busy={aiBusy}
        disabled={disabled}
        targetVolumes={targetVolumes}
        logline={outline.book.logline || ""}
        onTargetVolumesChange={setTargetVolumes}
        onClose={() => setSnowflakeOpen(false)}
        onGenerate={() => {
          setSnowflakeOpen(false);
          void triggerAi("snowflake");
        }}
      />

      <OutlineAiPreviewModal
        open={aiModalOpen}
        busy={aiBusy}
        preview={aiPreview}
        chapters={chapters}
        aiMode={lastAiMode}
        chapterCount={chapters.length}
        warnings={aiWarnings}
        onClose={() => setAiModalOpen(false)}
        onApply={applyAi}
      />
    </OutlineRoot>
  );
}

function OutlineRoot({ children }: { children: React.ReactNode }) {
  return <div className="auditPanel outlinePanel">{children}</div>;
}

function OutlineEmpty({ children }: { children: React.ReactNode }) {
  return <div className="auditPanel outlinePanel empty">{children}</div>;
}

function OutlineToolbar({ children }: { children: React.ReactNode }) {
  return <div className="outlineToolbar">{children}</div>;
}

function OutlineStatus({ saving, aiBusy, err }: { saving: boolean; aiBusy: boolean; err: string }) {
  const t = aiBusy ? "AI…" : saving ? "保存中…" : err ? err : "已同步";
  return <span className="muted outlineStatus">{t}</span>;
}

function OutlineAiMenu({
  disabled,
  onSelect
}: {
  disabled: boolean;
  onSelect: (mode: OutlineAiMode) => void;
}) {
  return (
    <select
      className="outlineAiSelect"
      disabled={disabled}
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value as OutlineAiMode;
        if (v) onSelect(v);
        e.target.value = "";
      }}
    >
      <option value="">AI ▾</option>
      <option value="foreshadowAudit">伏笔体检报告</option>
    </select>
  );
}

function OutlineInstruction({
  value,
  disabled,
  onChange
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      className="outlineInstruction outlineInput"
      placeholder="AI 补充说明（可选）"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function OutlineSubTabs({ subTab, onChange }: { subTab: SubTab; onChange: (t: SubTab) => void }) {
  const tabs: { id: SubTab; label: string }[] = [
    { id: "book", label: "全书" },
    { id: "stages", label: "阶段" },
    { id: "volumes", label: "分卷" },
    { id: "chapters", label: "章纲" }
  ];
  return (
    <div className="browserTabsBar" role="tablist" aria-label="大纲层级">
      <div className="browserTabsStrip tabsWrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`browserTab tabCompact ${subTab === t.id ? "active" : ""}`}
            aria-selected={subTab === t.id}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BookPanel(props: {
  outline: OutlineIndex;
  bookSynopsis?: string;
  disabled: boolean;
  onBookChange: (book: OutlineIndex["book"]) => void;
  onOpenSnowflake: () => void;
}) {
  const { outline, bookSynopsis, disabled, onBookChange, onOpenSnowflake } = props;
  const b = outline.book;
  const syn = b.synopsis || {};
  const setSyn = (key: keyof NonNullable<typeof b.synopsis>, val: string) => {
    onBookChange({ ...b, synopsis: { ...syn, [key]: val } });
  };
  return (
    <div className="outlineForm">
      <p className="muted outlineHint">适合开书前或重做全书规划；已有章节正文请在「章纲」中整理。</p>
      {bookSynopsis ? (
        <p className="muted outlineHint">书籍简介（meta）仅作参考，与下方大纲字段独立。</p>
      ) : null}
      <label className="outlineLabel">一句话梗概</label>
      <OutlineTextarea
        rows={2}
        disabled={disabled}
        value={b.logline || ""}
        onChange={(logline) => onBookChange({ ...b, logline })}
      />
      <div className="outlineRow">
        <button type="button" className="btnSort" disabled={disabled} onClick={onOpenSnowflake}>
          从梗概生成全书结构
        </button>
      </div>
      {(
        [
          ["setup", "起因"],
          ["development", "发展"],
          ["twist", "转折"],
          ["climax", "高潮"],
          ["ending", "结局"]
        ] as const
      ).map(([key, label]) => (
        <React.Fragment key={key}>
          <label className="outlineLabel">{label}</label>
          <OutlineTextarea
            rows={3}
            disabled={disabled}
            value={syn[key] || ""}
            onChange={(val) => setSyn(key, val)}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

function VolumesPanel(props: {
  outline: OutlineIndex;
  chapters: ChapterMeta[];
  selectedVolume: VolumeOutline | null;
  disabled: boolean;
  onSelectVolume: (id: string) => void;
  onAddVolume: () => void;
  onUpdateVolume: (vol: VolumeOutline) => void;
  onAssign: (volumeId: string, filename: string) => void;
  onRemove: (volumeId: string, filename: string) => void;
  onDeleteVolume: (volumeId: string) => void;
  onBatchPlans: (volumeId: string) => void;
}) {
  const {
    outline,
    chapters,
    selectedVolume,
    disabled,
    onSelectVolume,
    onAddVolume,
    onUpdateVolume,
    onAssign,
    onRemove,
    onDeleteVolume,
    onBatchPlans
  } = props;
  const vol = selectedVolume;
  const inVol = new Set(vol?.chapterFilenames || []);
  return (
    <div className="outlineSplit">
      <div className="outlineSplitLeft">
        <button type="button" className="btnSort" disabled={disabled} onClick={onAddVolume}>
          + 新建卷
        </button>
        <div className="tree">
          {outline.volumes.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`treeChild ${vol?.id === v.id ? "active" : ""}`}
              onClick={() => onSelectVolume(v.id)}
            >
              {v.title}
            </button>
          ))}
        </div>
      </div>
      <div className="outlineSplitRight">
        {vol ? (
          <>
            <label className="outlineLabel">卷标题</label>
            <input
              className="outlineInput"
              disabled={disabled}
              value={vol.title}
              onChange={(e) => onUpdateVolume({ ...vol, title: e.target.value })}
            />
            <label className="outlineLabel">卷摘要</label>
            <OutlineTextarea
              rows={4}
              disabled={disabled}
              value={vol.synopsis || ""}
              onChange={(synopsis) => onUpdateVolume({ ...vol, synopsis })}
            />
            <div className="outlineRow">
              <button type="button" className="btnSort" disabled={disabled} onClick={() => onBatchPlans(vol.id)}>
                AI 生成本卷章纲
              </button>
              <button
                type="button"
                className="btnDanger btnSort"
                disabled={disabled}
                onClick={() => onDeleteVolume(vol.id)}
              >
                删除本卷
              </button>
            </div>
            <p className="outlineLabel">卷内章节</p>
            <ul className="outlineChapterList">
              {vol.chapterFilenames.map((f) => {
                const c = chapters.find((x) => x.filename === f);
                return (
                  <li key={f}>
                    {c?.id || f}
                    <button type="button" disabled={disabled} onClick={() => onRemove(vol.id, f)}>
                      移出
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="outlineLabel">未分卷（点击加入本卷）</p>
            <ul className="outlineChapterList">
              {outline.ungroupedFilenames.map((f) => {
                const c = chapters.find((x) => x.filename === f);
                return (
                  <li key={f}>
                    <button type="button" disabled={disabled || inVol.has(f)} onClick={() => onAssign(vol.id, f)}>
                      + {c?.id || f}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted">请新建或选择分卷</p>
        )}
      </div>
    </div>
  );
}

function ChaptersPanel(props: {
  outline: OutlineIndex;
  chapterByFilename: Map<string, ChapterMeta>;
  chapterCount: number;
  selectedFilename: string | null;
  plan: OutlineIndex["chapterPlans"][string] | undefined;
  disabled: boolean;
  onSelect: (filename: string) => void;
  onOpenChapter: (c: ChapterMeta) => void;
  onUpdatePlan: (filename: string, patch: Partial<OutlineIndex["chapterPlans"][string]>) => void;
  onRefinePlan: (filename: string) => void;
  onFromChapters: () => void;
}) {
  const {
    outline,
    chapterByFilename,
    chapterCount,
    selectedFilename,
    plan,
    disabled,
    onSelect,
    onOpenChapter,
    onUpdatePlan,
    onRefinePlan,
    onFromChapters
  } = props;

  const treeChapters = (filenames: string[]) =>
    filenames.map((f) => {
      const c = chapterByFilename.get(f);
      if (!c) return null;
      return (
        <button
          key={f}
          type="button"
          className={`treeChild ${selectedFilename === f ? "active" : ""}`}
          onClick={() => onSelect(f)}
        >
          {c.id}
        </button>
      );
    });

  const filename = selectedFilename;
  const ch = filename ? chapterByFilename.get(filename) : null;

  return (
    <div className="outlineChaptersLayout">
      <div className="outlineChaptersAi">
        <button type="button" className="btnSort" disabled={disabled || chapterCount === 0} onClick={onFromChapters}>
          从已有章节归纳章纲
        </button>
        <p className="muted outlineHint">
          读取各章标题 + 正文前 800 字，以及书籍简介、时间线、伏笔索引（非全书审计记忆）。
        </p>
      </div>
      <div className="outlineSplit">
      <ChapterTree outline={outline} treeChapters={treeChapters} />
      <div className="outlineSplitRight">
        {filename && ch ? (
          <>
            <ChapterPlanHeader
              chapter={ch}
              disabled={disabled}
              onOpen={() => onOpenChapter(ch)}
              onRefine={() => onRefinePlan(filename)}
            />
            <label className="outlineLabel">本章核心</label>
            <OutlineTextarea
              rows={2}
              disabled={disabled}
              value={plan?.core || ""}
              onChange={(core) => onUpdatePlan(filename, { core })}
            />
            <label className="outlineLabel">场景</label>
            <OutlineTextarea
              rows={3}
              disabled={disabled}
              placeholder="场景 / 地点，可多行"
              value={plan?.scenes || ""}
              onChange={(scenes) => onUpdatePlan(filename, { scenes })}
            />
            <label className="outlineLabel">情节要点（每行一条）</label>
            <OutlineTextarea
              rows={4}
              disabled={disabled}
              value={(plan?.beats || []).join("\n")}
              onChange={(text) =>
                onUpdatePlan(filename, {
                  beats: text
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean)
                })
              }
            />
            <label className="outlineLabel">结尾钩子</label>
            <OutlineTextarea
              rows={2}
              disabled={disabled}
              value={plan?.hook || ""}
              onChange={(hook) => onUpdatePlan(filename, { hook })}
            />
          </>
        ) : (
          <p className="muted">选择章节编辑章纲</p>
        )}
      </div>
      </div>
    </div>
  );
}

function SnowflakeDialog({
  open,
  busy,
  disabled,
  targetVolumes,
  logline,
  onTargetVolumesChange,
  onClose,
  onGenerate
}: {
  open: boolean;
  busy: boolean;
  disabled: boolean;
  targetVolumes: number;
  logline: string;
  onTargetVolumesChange: (n: number) => void;
  onClose: () => void;
  onGenerate: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  if (!open) return null;

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <div
        className="modalPanel modalPanelOpaque outlineSnowflakeModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snowflake-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeaderRow">
          <h2 id="snowflake-dialog-title" className="modalHeading">
            从梗概生成全书结构
          </h2>
          <button type="button" className="btnModalSecondary" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </div>
        <div className="modalBodyScroll">
          <p className="muted outlineHint">
            根据一句话梗概生成五段梗概与分卷草案；不会创建新的章节文件。
          </p>
          {!logline.trim() ? (
            <p className="outlineSnowflakeWarn">建议先在大纲中填写「一句话梗概」，生成结果会更贴切。</p>
          ) : null}
          <label className="outlineLabel">建议分卷数</label>
          <input
            type="number"
            className="outlineInput"
            min={1}
            max={20}
            disabled={disabled || busy}
            value={targetVolumes}
            onChange={(e) => onTargetVolumesChange(Math.min(20, Math.max(1, Number(e.target.value) || 3)))}
          />
          <button
            type="button"
            className="btnSort outlineSnowflakeHelpToggle"
            onClick={() => setShowHelp((v) => !v)}
          >
            {showHelp ? "收起说明" : "什么是雪花写作法？"}
          </button>
          {showHelp ? (
            <p className="muted outlineHint">
              雪花写作法：从一句核心梗概逐步扩展为段落、人物与分卷结构。此处仅生成全书级草案，细节请在分卷与章纲中继续完善。
            </p>
          ) : null}
        </div>
        <div className="modalActions">
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="button" className="btnModalPrimary" disabled={disabled || busy} onClick={onGenerate}>
            {busy ? "生成中…" : "生成预览"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChapterTree({
  outline,
  treeChapters
}: {
  outline: OutlineIndex;
  treeChapters: (filenames: string[]) => React.ReactNode;
}) {
  return (
    <div className="outlineSplitLeft tree">
      {outline.volumes.map((v) => (
        <div key={v.id}>
          <VolumeLabel>{v.title}</VolumeLabel>
          {treeChapters(v.chapterFilenames)}
        </div>
      ))}
      <VolumeLabel>未分卷</VolumeLabel>
      {treeChapters(outline.ungroupedFilenames)}
    </div>
  );
}

function VolumeLabel({ children }: { children: React.ReactNode }) {
  return <div className="outlineVolumeLabel">{children}</div>;
}

function ChapterPlanHeader({
  chapter,
  disabled,
  onOpen,
  onRefine
}: {
  chapter: ChapterMeta;
  disabled: boolean;
  onOpen: () => void;
  onRefine: () => void;
}) {
  return (
    <div className="outlineRow">
      <strong>{chapter.id}</strong>
      <button type="button" className="btnSort" disabled={disabled} onClick={onOpen}>
        打开正文
      </button>
      <button type="button" className="btnSort" disabled={disabled} onClick={onRefine}>
        AI 润色章纲
      </button>
    </div>
  );
}
