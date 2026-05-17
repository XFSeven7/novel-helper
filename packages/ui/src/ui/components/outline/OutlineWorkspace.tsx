import React, { useMemo, useState } from "react";
import type { ChapterMeta, OutlineAiMode, OutlineIndex, VolumeOutline } from "../../api";
import { useOutline } from "../../hooks/useOutline";
import { OutlineAiPreviewModal } from "./OutlineAiPreviewModal";
import { OutlineTextarea } from "./OutlineTextarea";

export type OutlineWorkspaceProps = {
  slug: string;
  chapters: ChapterMeta[];
  busy: boolean;
  activeModelId: string | null;
  bookSynopsis?: string;
  onOpenChapter: (chapter: ChapterMeta) => void;
  onStatus?: (msg: string) => void;
};

type SubTab = "book" | "volumes" | "chapters";

export function OutlineWorkspace({
  slug,
  chapters,
  busy,
  activeModelId,
  bookSynopsis,
  onOpenChapter,
  onStatus
}: OutlineWorkspaceProps) {
  const { outline, loading, saving, aiBusy, err, updateOutline, runAi, applyPreview, saveNow } = useOutline(slug);
  const [subTab, setSubTab] = useState<SubTab>("book");
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [selectedChapterFilename, setSelectedChapterFilename] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<Partial<OutlineIndex> | { report: string } | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [targetVolumes, setTargetVolumes] = useState(3);

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
          targetVolumes={targetVolumes}
          disabled={disabled}
          onTargetVolumesChange={setTargetVolumes}
          onBookChange={(book) => updateOutline((prev) => ({ ...prev, book }))}
          onSnowflake={() => void triggerAi("snowflake")}
          onFromChapters={() => void triggerAi("fromChapters")}
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
          onBatchPlans={(volumeId) => void triggerAi("volumeChapterPlans", { volumeId })}
        />
      ) : null}

      {subTab === "chapters" ? (
        <ChaptersPanel
          outline={outline}
          chapters={chapters}
          chapterByFilename={chapterByFilename}
          selectedFilename={selectedChapterFilename}
          plan={plan}
          disabled={disabled}
          onSelect={(filename) => {
            setSelectedChapterFilename(filename);
          }}
          onOpenChapter={onOpenChapter}
          onUpdatePlan={updateChapterPlan}
          onRefinePlan={(filename) => void triggerAi("refineChapterPlan", { chapterFilename: filename })}
        />
      ) : null}
      </div>

      <OutlineAiPreviewModal
        open={aiModalOpen}
        busy={aiBusy}
        preview={aiPreview}
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
      <option value="snowflake">雪花起步</option>
      <option value="fromChapters">从章节反推</option>
      <option value="foreshadowAudit">伏笔体检</option>
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
  targetVolumes: number;
  disabled: boolean;
  onTargetVolumesChange: (n: number) => void;
  onBookChange: (book: OutlineIndex["book"]) => void;
  onSnowflake: () => void;
  onFromChapters: () => void;
}) {
  const { outline, bookSynopsis, targetVolumes, disabled, onTargetVolumesChange, onBookChange, onSnowflake, onFromChapters } =
    props;
  const b = outline.book;
  const syn = b.synopsis || {};
  const setSyn = (key: keyof NonNullable<typeof b.synopsis>, val: string) => {
    onBookChange({ ...b, synopsis: { ...syn, [key]: val } });
  };
  return (
    <div className="outlineForm">
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
        <button type="button" className="btnSort" disabled={disabled} onClick={onSnowflake}>
          雪花起步
        </button>
        <button type="button" className="btnSort" disabled={disabled} onClick={onFromChapters}>
          从章节反推
        </button>
        <label className="outlineInline">
          分卷数
          <input
            type="number"
            min={1}
            max={20}
            disabled={disabled}
            value={targetVolumes}
            onChange={(e) => onTargetVolumesChange(Number(e.target.value) || 3)}
          />
        </label>
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
            <button type="button" className="btnSort" disabled={disabled} onClick={() => onBatchPlans(vol.id)}>
              AI 生成本卷章纲
            </button>
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
  chapters: ChapterMeta[];
  chapterByFilename: Map<string, ChapterMeta>;
  selectedFilename: string | null;
  plan: OutlineIndex["chapterPlans"][string] | undefined;
  disabled: boolean;
  onSelect: (filename: string) => void;
  onOpenChapter: (c: ChapterMeta) => void;
  onUpdatePlan: (filename: string, patch: Partial<OutlineIndex["chapterPlans"][string]>) => void;
  onRefinePlan: (filename: string) => void;
}) {
  const {
    outline,
    chapters,
    chapterByFilename,
    selectedFilename,
    plan,
    disabled,
    onSelect,
    onOpenChapter,
    onUpdatePlan,
    onRefinePlan
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
            <input
              className="outlineInput"
              disabled={disabled}
              value={plan?.scenes || ""}
              onChange={(e) => onUpdatePlan(filename, { scenes: e.target.value })}
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
