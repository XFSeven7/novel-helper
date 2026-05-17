import React from "react";
import type { ChapterMeta, TimelineIndex } from "../../api";
import {
  deleteTimelineRange,
  hideAuditCharacter,
  hideAuditForeshadow,
  hideAuditPlace,
  markTimelineEvent
} from "../../api";
import { auditCharacterRoleClass } from "../../utils/auditCharacters";
import { auditCharStateExtraRows, auditCharTopExtraRows } from "../../utils/auditDiff";
import { MemoryPanel } from "./MemoryPanel";

export type GlobalTabId = "auditCharacters" | "relations" | "places" | "timeline" | "foreshadows";

export type GlobalInfoPanelProps = {
  busy: boolean;
  activeBook: string;
  chapters: ChapterMeta[];
  globalTab: GlobalTabId;
  setGlobalTab: React.Dispatch<React.SetStateAction<GlobalTabId>>;
  auditCharactersIndex: any;
  setAuditCharactersIndex: (index: any) => void;
  auditPlacesIndex: any;
  setAuditPlacesIndex: (index: any) => void;
  auditForeshadowsIndex: any;
  setAuditForeshadowsIndex: (index: any) => void;
  timelineIndex: TimelineIndex | null;
  setTimelineIndex: (index: TimelineIndex | null) => void;
  timelineBusy: boolean;
  setTimelineBusy: (busy: boolean) => void;
  relationsSearch: string;
  setRelationsSearch: React.Dispatch<React.SetStateAction<string>>;
  relationsOnlyTyped: boolean;
  setRelationsOnlyTyped: React.Dispatch<React.SetStateAction<boolean>>;
  auditCharactersSearch: string;
  setAuditCharactersSearch: React.Dispatch<React.SetStateAction<string>>;
  expandedAuditCharIds: Record<string, boolean>;
  setExpandedAuditCharIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  placeGroupCollapsed: Record<string, boolean>;
  setPlaceGroupCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  placeTextExpanded: Record<string, boolean>;
  setPlaceTextExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  foreshadowExpanded: Record<string, boolean>;
  setForeshadowExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  memoryTab: "chapters" | "ranges";
  setMemoryTab: React.Dispatch<React.SetStateAction<"chapters" | "ranges">>;
  memoryExpanded: Record<string, boolean>;
  setMemoryExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  memoryChaptersSortDesc: boolean;
  setMemoryChaptersSortDesc: React.Dispatch<React.SetStateAction<boolean>>;
  memoryRangesSortDesc: boolean;
  setMemoryRangesSortDesc: React.Dispatch<React.SetStateAction<boolean>>;
  timelineShowDoneEvents: boolean;
  setTimelineShowDoneEvents: React.Dispatch<React.SetStateAction<boolean>>;
  timelineCompressStart: string;
  setTimelineCompressStart: React.Dispatch<React.SetStateAction<string>>;
  timelineCompressEnd: string;
  setTimelineCompressEnd: React.Dispatch<React.SetStateAction<string>>;
  setHiddenCharPanelOpen: (open: boolean) => void;
  setHiddenPlacePanelOpen: (open: boolean) => void;
  setHiddenForeshadowPanelOpen: (open: boolean) => void;
  setForeshadowCreateOpen: (open: boolean) => void;
  setStatus: (msg: string) => void;
  openEditCharacter: (c: unknown) => void;
  openEditPlace: (p: unknown) => void;
  openEditForeshadow: (f: unknown) => void;
  onCompressRangeWithMerge: (startChapter: number, endChapter: number) => void;
  onRefreshTimeline: () => void;
  onOpenChapter: (chapter: ChapterMeta) => void;
};

export function GlobalInfoPanel({
  busy,
  activeBook,
  chapters,
  globalTab,
  setGlobalTab,
  auditCharactersIndex,
  setAuditCharactersIndex,
  auditPlacesIndex,
  setAuditPlacesIndex,
  auditForeshadowsIndex,
  setAuditForeshadowsIndex,
  timelineIndex,
  setTimelineIndex,
  timelineBusy,
  setTimelineBusy,
  relationsSearch,
  setRelationsSearch,
  relationsOnlyTyped,
  setRelationsOnlyTyped,
  auditCharactersSearch,
  setAuditCharactersSearch,
  expandedAuditCharIds,
  setExpandedAuditCharIds,
  placeGroupCollapsed,
  setPlaceGroupCollapsed,
  placeTextExpanded,
  setPlaceTextExpanded,
  foreshadowExpanded,
  setForeshadowExpanded,
  memoryTab,
  setMemoryTab,
  memoryExpanded,
  setMemoryExpanded,
  memoryChaptersSortDesc,
  setMemoryChaptersSortDesc,
  memoryRangesSortDesc,
  setMemoryRangesSortDesc,
  timelineShowDoneEvents,
  setTimelineShowDoneEvents,
  timelineCompressStart,
  setTimelineCompressStart,
  timelineCompressEnd,
  setTimelineCompressEnd,
  setHiddenCharPanelOpen,
  setHiddenPlacePanelOpen,
  setHiddenForeshadowPanelOpen,
  setForeshadowCreateOpen,
  setStatus,
  openEditCharacter,
  openEditPlace,
  openEditForeshadow,
  onCompressRangeWithMerge,
  onRefreshTimeline,
  onOpenChapter
}: GlobalInfoPanelProps) {
  return (
    <>
    <div className="browserTabsBar" role="tablist" aria-label="全局信息分类">
      <div className="browserTabsStrip">
        <button
          type="button"
          role="tab"
          className={`browserTab ${globalTab === "auditCharacters" ? "active" : ""}`}
          aria-selected={globalTab === "auditCharacters"}
          onClick={() => setGlobalTab("auditCharacters")}
          disabled={busy}
        >
          角色
        </button>
        <button
          type="button"
          role="tab"
          className={`browserTab ${globalTab === "relations" ? "active" : ""}`}
          aria-selected={globalTab === "relations"}
          onClick={() => setGlobalTab("relations")}
          disabled={busy}
        >
          关系图
        </button>
        <button
          type="button"
          role="tab"
          className={`browserTab ${globalTab === "places" ? "active" : ""}`}
          aria-selected={globalTab === "places"}
          onClick={() => setGlobalTab("places")}
          disabled={busy}
        >
          地点
        </button>
        <button
          type="button"
          role="tab"
          className={`browserTab ${globalTab === "timeline" ? "active" : ""}`}
          aria-selected={globalTab === "timeline"}
          onClick={() => setGlobalTab("timeline")}
          disabled={busy}
        >
          全书记忆
        </button>
        <button
          type="button"
          role="tab"
          className={`browserTab ${globalTab === "foreshadows" ? "active" : ""}`}
          aria-selected={globalTab === "foreshadows"}
          onClick={() => setGlobalTab("foreshadows")}
          disabled={busy}
        >
          伏笔
        </button>
        {/* 资料卡页签入口已移除：合并功能改在"编辑角色"弹窗内 */}
      </div>
    </div>
    <div className="navGlobalScroll">
      {globalTab === "auditCharacters" ? (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "var(--bg)",
          padding: "2px 0 8px",
          borderBottom: "1px solid var(--border)"
        }}
      >
        <input
          className="auditRelationsSearch"
          value={auditCharactersSearch}
          onChange={(e) => setAuditCharactersSearch(e.target.value)}
          placeholder="搜索角色:名字 / 身份 / 标签..."
          disabled={busy}
        />
      </div>
      <div className="auditCharScroll">
        <div className="auditCharList">
        {Array.isArray(auditCharactersIndex?.characters) &&
        (auditCharactersIndex.characters as any[]).length ? (
          (() => {
            const all = (auditCharactersIndex.characters as any[])
              .map((c) => ({
                ...c,
                name: String(c?.name || "").trim()
              }))
              .filter((c) => c.name);
            const hiddenSet = new Set(
              Array.isArray(auditCharactersIndex?.hiddenNames)
                ? (auditCharactersIndex.hiddenNames as any[]).map((x) => String(x))
                : []
            );
            const visible = all.filter((c) => !hiddenSet.has(c.name));
            const q = auditCharactersSearch.trim().toLowerCase();
            const match = (c: any) => {
              if (!q) return true;
              const name = String(c?.name || "").trim();
              const role = String(c?.role || "").trim();
              const tags = Array.isArray(c?.tags)
                ? (c.tags as unknown[]).map((x) => String(x)).filter(Boolean).join(" ")
                : "";
              const hay = `${name} ${role} ${tags}`.toLowerCase();
              return hay.includes(q);
            };
            const filtered = visible.filter(match);

            return (
              <>
                {filtered.map((c) => {
                  const name = String(c?.name || "").trim() || "未命名";
                  const id = name;
                  const open = !!expandedAuditCharIds[id];
                  const roleStr =
                    typeof c?.role === "string" && c.role.trim() ? c.role.trim() : "";
                  const st = c?.state && typeof c.state === "object" ? c.state : {};
                  const loc = String((st as any).location ?? "").trim();
                  const inj = String((st as any).injuries ?? "").trim();
                  const items = Array.isArray((st as any).items)
                    ? ((st as any).items as unknown[]).map((x) => String(x)).filter(Boolean)
                    : [];
                  const money = (st as any).moneyChange;
                  const tagArr = Array.isArray(c?.tags)
                    ? (c.tags as unknown[]).map((x) => String(x)).filter(Boolean)
                    : [];
                  const personality = String((c as any)?.personalityAnalysis ?? "").trim();

                  return (
                    <div key={id} className="auditCharCard" data-char-name={name}>
                      <div className="auditCharCardHeadRow">
                        <button
                          type="button"
                          className="auditCharCardHead"
                          aria-expanded={open}
                          onClick={() =>
                            setExpandedAuditCharIds((prev) => ({ ...prev, [id]: !prev[id] }))
                          }
                          onDoubleClick={() => {
                            openEditCharacter(c);
                          }}
                          disabled={busy}
                          title="双击可编辑角色属性"
                        >
                          <span className="auditCharIcon" aria-hidden>
                            ◎
                          </span>
                          <span className="auditCharName">{name}</span>
                          <span className="auditCharBadges">
                            {roleStr ? (
                              <span className={auditCharacterRoleClass(roleStr)}>{roleStr}</span>
                            ) : null}
                          </span>
                          <span className={`auditCharChevron ${open ? "open" : ""}`} aria-hidden>
                            ›
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btnSort btnCharEdit"
                          disabled={busy || !activeBook}
                          onClick={() => openEditCharacter(c)}
                          title="编辑角色属性"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btnSort btnCharHide"
                          disabled={busy || !activeBook}
                          onClick={async () => {
                            if (!activeBook) return;
                            try {
                              const { index } = await hideAuditCharacter(activeBook, {
                                name,
                                hidden: true
                              });
                              setAuditCharactersIndex(index);
                            } catch (e: any) {
                              setStatus(e?.message || String(e));
                            }
                          }}
                          title="隐藏该角色(全书范围)"
                        >
                          隐藏
                        </button>
                      </div>

                      {open ? (
                        <div className="auditCharCardBody">
                          {/* Logic & Status(账本最关心) */}
                          {roleStr ? (
                            <div className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">身份</div>
                              <div className="auditCharDetailValue">{roleStr}</div>
                            </div>
                          ) : null}
                          {tagArr.length ? (
                            <div className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">标签</div>
                              <div className="auditCharDetailValue">{tagArr.join("、")}</div>
                            </div>
                          ) : null}
                          {loc ? (
                            <div className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">地点</div>
                              <div className="auditCharDetailValue">{loc}</div>
                            </div>
                          ) : null}
                          {inj ? (
                            <div className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">伤势与状态</div>
                              <div className="auditCharDetailValue">{inj}</div>
                            </div>
                          ) : null}
                          {items.length ? (
                            <div className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">随身物品</div>
                              <div className="auditCharDetailValue">{items.join("、")}</div>
                            </div>
                          ) : null}
                          {money !== undefined && money !== null && money !== "" ? (
                            <div className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">金钱变动</div>
                              <div className="auditCharDetailValue">{String(money)}</div>
                            </div>
                          ) : null}

                          {(() => {
                            const social = (c as any)?.socialTags;
                            if (!social || typeof social !== "object") return null;
                            const profession = String((social as any)?.profession || "").trim();
                            const cls = String((social as any)?.class || "").trim();
                            const titles = Array.isArray((social as any)?.titles)
                              ? (social as any).titles.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            const other = Array.isArray((social as any)?.other)
                              ? (social as any).other.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            const lines: string[] = [];
                            if (profession) lines.push(`职业:${profession}`);
                            if (cls) lines.push(`阶级:${cls}`);
                            if (titles.length) lines.push(`头衔:${titles.join("、")}`);
                            if (other.length) lines.push(`其他:${other.join("、")}`);
                            if (!lines.length) return null;
                            return (
                              <div className="auditCharDetailRow">
                                <div className="auditCharDetailLabel">社会身份</div>
                                <div className="auditCharDetailValue">{lines.join(";")}</div>
                              </div>
                            );
                          })()}

                          {Array.isArray((c as any)?.historicalDebts) && (c as any).historicalDebts.length ? (
                            <div className="auditCharQuotes">
                              <div className="auditCharDetailLabel">历史债</div>
                              <div className="auditCharDetailValue">
                                {(c as any).historicalDebts
                                  .map((x: any) => String(x).trim())
                                  .filter(Boolean)
                                  .map((t: string, i: number) => (
                                    <div key={`debt-${i}`}>- {t}</div>
                                  ))}
                              </div>
                            </div>
                          ) : null}

                          {Array.isArray((c as any)?.occurredNotes) && (c as any).occurredNotes.length ? (
                            <div className="auditCharQuotes">
                              <div className="auditCharDetailLabel">发生过的事情</div>
                              <div className="auditCharDetailValue">
                                {(c as any).occurredNotes
                                  .map((x: any) => String(x).trim())
                                  .filter(Boolean)
                                  .map((t: string, i: number) => (
                                    <div key={`occ-${i}`}>- {t}</div>
                                  ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Narrative Drives */}
                          {(() => {
                            const nd = (c as any)?.narrativeDrives;
                            if (!nd || typeof nd !== "object") return null;
                            const want = String((nd as any)?.want || "").trim();
                            const need = String((nd as any)?.need || "").trim();
                            const moral = String((nd as any)?.moralCompass || "").trim();
                            const flaws = Array.isArray((nd as any)?.flaws)
                              ? (nd as any).flaws.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            const blind = Array.isArray((nd as any)?.blindSpots)
                              ? (nd as any).blindSpots.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            if (!want && !need && !moral && !flaws.length && !blind.length) return null;
                            return (
                              <div className="auditCharQuotes">
                                <div className="auditCharDetailLabel">叙事驱动力</div>
                                <div className="auditCharDetailValue">
                                  {want ? <div>Want:{want}</div> : null}
                                  {need ? <div>Need:{need}</div> : null}
                                  {moral ? <div>道德罗盘:{moral}</div> : null}
                                  {flaws.length ? (
                                    <div>
                                      缺陷:{flaws.join("、")}
                                    </div>
                                  ) : null}
                                  {blind.length ? (
                                    <div>
                                      盲点:{blind.join("、")}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Fingerprints */}
                          {(() => {
                            const fp = (c as any)?.fingerprints;
                            if (!fp || typeof fp !== "object") return null;
                            const ling = Array.isArray((fp as any)?.linguisticStyle)
                              ? (fp as any).linguisticStyle.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            const catchp = Array.isArray((fp as any)?.catchphrases)
                              ? (fp as any).catchphrases.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            const man = Array.isArray((fp as any)?.mannerisms)
                              ? (fp as any).mannerisms.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                            const mask = Array.isArray((fp as any)?.mask) ? (fp as any).mask : [];
                            const maskLines = mask
                              .map((m: any) => ({
                                context: String(m?.context || "").trim(),
                                persona: String(m?.persona || "").trim()
                              }))
                              .filter((m: any) => m.context || m.persona)
                              .map((m: any) => `${m.context || "(场景)"}:${m.persona || "(人设)"}`);
                            if (!ling.length && !catchp.length && !man.length && !maskLines.length) return null;
                            return (
                              <div className="auditCharQuotes">
                                <div className="auditCharDetailLabel">表现力指纹</div>
                                <div className="auditCharDetailValue">
                                  {ling.length ? <div>语气/句式:{ling.join("、")}</div> : null}
                                  {catchp.length ? <div>口癖:{catchp.join("、")}</div> : null}
                                  {man.length ? <div>动作:{man.join("、")}</div> : null}
                                  {maskLines.length ? <div>面具:{maskLines.join(";")}</div> : null}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Relational Hooks */}
                          {(() => {
                            const rh = (c as any)?.relationalHooks;
                            if (!rh || typeof rh !== "object") return null;
                            const rel = Array.isArray((rh as any)?.relations) ? (rh as any).relations : [];
                            const freeText = String((rh as any)?.freeText || "").trim();
                            const relRows = rel
                              .map((r: any) => ({
                                targetName: String(r?.targetName || "").trim(),
                                emotionalPolarity: String(r?.emotionalPolarity || "").trim(),
                                conflictIndex: String(r?.conflictIndex || "").trim(),
                                sharedSecrets: Array.isArray(r?.sharedSecrets)
                                  ? r.sharedSecrets.map((x: any) => String(x).trim()).filter(Boolean)
                                  : []
                              }))
                              .filter((r: any) => r.targetName);
                            if (!relRows.length && !freeText) return null;
                            return (
                              <div className="auditCharQuotes">
                                <div className="auditCharDetailLabel">关系钩子</div>
                                <div className="auditCharDetailValue">
                                  {relRows.length ? (
                                    <div>
                                      {relRows.map((r: any, i: number) => (
                                        <div key={`rel-${r.targetName}-${i}`}>
                                          - {r.targetName}
                                          {r.emotionalPolarity ? ` · 情感:${r.emotionalPolarity}` : ""}
                                          {r.conflictIndex ? ` · 冲突:${r.conflictIndex}` : ""}
                                          {r.sharedSecrets.length ? ` · 秘密:${r.sharedSecrets.join("、")}` : ""}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {freeText ? <div style={{ marginTop: relRows.length ? 6 : 0 }}>{freeText}</div> : null}
                                </div>
                              </div>
                            );
                          })()}

                          {auditCharStateExtraRows(st as Record<string, unknown>).map(([lk, lv], ri) => (
                            <div key={`st-${lk}-${ri}`} className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">{lk}</div>
                              <div className="auditCharDetailValue">{lv}</div>
                            </div>
                          ))}
                          {auditCharTopExtraRows(c as Record<string, unknown>).map(([lk, lv], ri) => (
                            <div key={`ex-${lk}-${ri}`} className="auditCharDetailRow">
                              <div className="auditCharDetailLabel">{lk}</div>
                              <div className="auditCharDetailValue">{lv}</div>
                            </div>
                          ))}
                          {personality ? (
                            <div className="auditCharQuotes">
                              <div className="auditCharDetailLabel">性格分析</div>
                              <div className="auditCharDetailValue">{personality}</div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div className="muted auditHiddenSummary">
                  {(() => {
                    const hidden = all.filter((c) => hiddenSet.has(c.name));
                    if (!hidden.length) return null;
                    return (
                      <button
                        type="button"
                        className="btnLinkMuted"
                        disabled={busy || !activeBook}
                        onClick={() => setHiddenCharPanelOpen(true)}
                      >
                        已隐藏 {hidden.length}/{all.length} 个角色,点击查看
                      </button>
                    );
                  })()}
                </div>
              </>
            );
          })()
        ) : (
          <div className="muted auditPanelEmpty">暂无角色库。完成一次分析后会自动沉淀到这里。</div>
        )}
        </div>
      </div>
    </>
    ) : globalTab === "relations" ? (
    <>
      <div className="row" style={{ padding: "10px" }}>
        <input
          value={relationsSearch}
          onChange={(e) => setRelationsSearch(e.target.value)}
          placeholder="搜索关系:角色名 / types / 情感 / 冲突..."
          disabled={busy}
        />
        <label className="toggle">
          <input
            type="checkbox"
            checked={relationsOnlyTyped}
            onChange={(e) => setRelationsOnlyTyped(e.target.checked)}
            disabled={busy}
          />
          仅显示有 types
        </label>
      </div>
      <div className="tree relationsTree">
        {(() => {
          const typeLabels: Record<string, string> = {
            "narrative.Ally": "盟友",
            "narrative.Mentor": "导师",
            "narrative.Antagonist": "反派",
            "narrative.Rival": "竞争对手",
            "narrative.Support": "后勤/NPC",
            "narrative.Harbinger": "先驱",
            "tie.KindredSpirit": "至交",
            "tie.LoveInterest": "恋人",
            "tie.Kinship": "血亲",
            "tie.ArchNemesis": "宿敌",
            "tie.MutualDisdain": "嫌恶",
            "tie.Admiration": "崇拜",
            "tie.Indebtedness": "亏欠",
            "hidden.Judas": "背叛者",
            "hidden.Guardian": "保护者",
            "hidden.Foil": "镜像/对照组",
            "karma.Contractual": "契约关系",
            "karma.Symbiotic": "共生关系",
            "karma.InformationGap": "信息差"
          };
          const chars: any[] = Array.isArray(auditCharactersIndex?.characters)
            ? (auditCharactersIndex.characters as any[])
                .map((c) => ({ ...c, name: String(c?.name || "").trim() }))
                .filter((c) => c.name)
            : [];
          const edges: any[] = [];
          for (const c of chars) {
            const src = String(c?.name || "").trim();
            const rels = Array.isArray(c?.relationalHooks?.relations) ? c.relationalHooks.relations : [];
            for (const r of rels) {
              const targetName = String(r?.targetName || "").trim();
              if (!targetName) continue;
              const types = Array.isArray(r?.types) ? r.types.map((x: any) => String(x).trim()).filter(Boolean) : [];
              edges.push({
                source: src,
                target: targetName,
                types,
                emotionalPolarity: String(r?.emotionalPolarity || "").trim(),
                conflictIndex: String(r?.conflictIndex || "").trim(),
                sharedSecrets: Array.isArray(r?.sharedSecrets)
                  ? r.sharedSecrets.map((x: any) => String(x).trim()).filter(Boolean)
                  : []
              });
            }
          }
          const q = relationsSearch.trim().toLowerCase();
          const filtered = edges.filter((e) => {
            if (relationsOnlyTyped && !e.types.length) return false;
            if (!q) return true;
            const typesZh = e.types.map((t: string) => typeLabels[t] || t).join(",");
            const hay = `${e.source} ${e.target} ${typesZh} ${e.emotionalPolarity} ${e.conflictIndex} ${e.sharedSecrets.join(" ")}`
              .toLowerCase()
              .trim();
            return hay.includes(q);
          });
          if (!filtered.length) return <div className="muted auditPanelEmpty">暂无关系数据(或被筛选条件隐藏)。</div>;
          return filtered.map((e, idx) => {
            const typesZh = e.types.map((t: string) => typeLabels[t] || t).filter(Boolean);
            return (
              <div key={`${e.source}__${e.target}__${idx}`} className="treeChild">
                <div className="row">
                  <div className="muted">{e.source}</div>
                  <div className="muted">→</div>
                  <div>{e.target}</div>
                  <button
                    type="button"
                    className="btnMini"
                    disabled={busy}
                    onClick={() => {
                      const src = chars.find((c) => String(c?.name || "").trim() === e.source);
                      if (src) openEditCharacter(src);
                    }}
                    title="编辑源角色(关系从源角色上维护)"
                  >
                    编辑
                  </button>
                </div>
                {typesZh.length ? <div className="muted">types:{typesZh.join("、")}</div> : null}
                {e.emotionalPolarity ? <div className="muted">情感:{e.emotionalPolarity}</div> : null}
                {e.conflictIndex ? <div className="muted">冲突:{e.conflictIndex}</div> : null}
                {Array.isArray(e.sharedSecrets) && e.sharedSecrets.length ? (
                  <div className="muted">秘密:{e.sharedSecrets.join("、")}</div>
                ) : null}
              </div>
            );
          });
        })()}
      </div>
    </>
    ) : globalTab === "places" ? (
    <div className="placePanel">
      {Array.isArray(auditPlacesIndex?.places) && (auditPlacesIndex.places as any[]).length ? (
        (() => {
          const all = (auditPlacesIndex.places as any[])
            .map((p) => ({ ...p, name: String(p?.name || "").trim() }))
            .filter((p) => p.name);
          const hiddenSet = new Set(
            Array.isArray(auditPlacesIndex?.hiddenNames)
              ? (auditPlacesIndex.hiddenNames as any[]).map((x) => String(x))
              : []
          );
          const visible = all.filter((p) => !hiddenSet.has(p.name));
          const inferGroup = (name: string) => {
            const n = String(name || "").trim();
            if (!n) return "未分组";
            // 常见写法:青石村·晒谷场 / 青石村-晒谷场 / 青石村 晒谷场
            const m = n.split(/[·•\-\/\s]+/).map((s) => s.trim()).filter(Boolean);
            return m[0] ? m[0] : "未分组";
          };
          const groups = new Map<string, any[]>();
          for (const p of visible) {
            const g = String((p as any).group || "").trim() || inferGroup(p.name);
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(p);
          }
          const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
          return (
            <>
              <div className="placeList">
                {groupNames.map((g) => {
                  const list = groups.get(g) || [];
                  const collapsed = !!placeGroupCollapsed[g];
                  return (
                    <div key={g} className="placeGroup">
                      <button
                        type="button"
                        className="placeGroupHead"
                        onClick={() => setPlaceGroupCollapsed((prev) => ({ ...prev, [g]: !prev[g] }))}
                        disabled={busy}
                      >
                        <span className="placeGroupTitle">{g}</span>
                        <span className="muted placeGroupCount">{list.length}</span>
                        <span className={`placeGroupChevron ${collapsed ? "" : "open"}`} aria-hidden>
                          ›
                        </span>
                      </button>
                      {!collapsed ? (
                        <div className="placeGroupBody placeGroupBodyCompact">
                          {list.map((p) => {
                            const key = `${g}::${p.name}`;
                            const expanded = !!placeTextExpanded[key];
                            const noteText = String(p.lastNote || "").trim() || "-";
                            const noteNeedToggle = noteText.length >= 36;
                            const descText = String(p.description || "").trim() || "-";
                            const meta = p.lastChapter ? `第 ${p.lastChapter} 章` : "";
                            return (
                              <div key={p.name} className="placeItem" data-place-name={p.name}>
                                <div className="placeItemTop">
                                  <div className="placeItemTitleRow">
                                    <div className="placeName">{p.name}</div>
                                    {meta ? <div className="muted placeItemMeta">{meta}</div> : null}
                                  </div>
                                  <div className="row placeItemActions">
                                    <button
                                      type="button"
                                      className="btnMini"
                                      disabled={busy || !activeBook}
                                      onClick={() => openEditPlace(p)}
                                    >
                                      编辑
                                    </button>
                                    <button
                                      type="button"
                                      className="btnMini"
                                      disabled={busy || !activeBook}
                                      onClick={async () => {
                                        if (!activeBook) return;
                                        try {
                                          const { index } = await hideAuditPlace(activeBook, { name: p.name, hidden: true });
                                          setAuditPlacesIndex(index);
                                        } catch (e: any) {
                                          setStatus(e?.message || String(e));
                                        }
                                      }}
                                    >
                                      隐藏
                                    </button>
                                  </div>
                                </div>

                                <div className="placeItemBody">
                                  <div className="placeItemLine">
                                    <span className="placeItemLabel">简述</span>
                                    <span className="placeItemValue">{descText}</span>
                                  </div>
                                  <div className="placeItemLine">
                                    <span className="placeItemLabel">本地发生</span>
                                    <span className="placeItemValue">
                                      <span className={expanded ? "placeNote" : "placeNote placeNoteClamp2"}>{noteText}</span>
                                      {noteNeedToggle ? (
                                        <button
                                          type="button"
                                          className="btnLinkMuted placeNoteToggle"
                                          onClick={() => setPlaceTextExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                                          disabled={busy}
                                        >
                                          {expanded ? "收起" : "...展开"}
                                        </button>
                                      ) : null}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="muted auditHiddenSummary">
                {(() => {
                  const hidden = all.filter((p) => hiddenSet.has(p.name));
                  if (!hidden.length) return null;
                  return (
                    <button
                      type="button"
                      className="btnLinkMuted"
                      disabled={busy || !activeBook}
                      onClick={() => setHiddenPlacePanelOpen(true)}
                    >
                      已隐藏 {hidden.length}/{all.length} 个地点,点击查看
                    </button>
                  );
                })()}
              </div>
            </>
          );
        })()
      ) : (
        <div className="muted auditPanelEmpty">暂无地点卡。完成一次分析后会自动收集地点。</div>
      )}
    </div>
    ) : globalTab === "timeline" ? (
    <MemoryPanel
      busy={busy}
      timelineBusy={timelineBusy}
      activeBook={activeBook}
      timelineIndex={timelineIndex}
      memoryTab={memoryTab}
      setMemoryTab={setMemoryTab}
      memoryExpanded={memoryExpanded}
      setMemoryExpanded={setMemoryExpanded}
      memoryChaptersSortDesc={memoryChaptersSortDesc}
      setMemoryChaptersSortDesc={setMemoryChaptersSortDesc}
      memoryRangesSortDesc={memoryRangesSortDesc}
      setMemoryRangesSortDesc={setMemoryRangesSortDesc}
      timelineShowDoneEvents={timelineShowDoneEvents}
      setTimelineShowDoneEvents={setTimelineShowDoneEvents}
      timelineCompressStart={timelineCompressStart}
      setTimelineCompressStart={setTimelineCompressStart}
      timelineCompressEnd={timelineCompressEnd}
      setTimelineCompressEnd={setTimelineCompressEnd}
      onSetStatus={setStatus}
      onCompressRangeWithMerge={(a, b) => void onCompressRangeWithMerge(a, b)}
      onDeleteRange={async (a, b) => {
        if (!activeBook) return;
        setTimelineBusy(true);
        try {
          const { index } = await deleteTimelineRange(activeBook, { startChapter: a, endChapter: b });
          setTimelineIndex(index);
        } catch (e: any) {
          setStatus(e?.message || String(e));
        } finally {
          setTimelineBusy(false);
        }
      }}
      onMarkTimelineEventStatus={async (id, status) => {
        if (!activeBook) return;
        setTimelineBusy(true);
        try {
          const { index } = await markTimelineEvent(activeBook, { id, status });
          setTimelineIndex(index);
        } catch (err: any) {
          setStatus(err?.message || String(err));
        } finally {
          setTimelineBusy(false);
        }
      }}
    />
    ) : (
    <div className="foreshadowPanel">
      {(() => {
        const all = Array.isArray(auditForeshadowsIndex?.foreshadows)
          ? (auditForeshadowsIndex.foreshadows as any[])
              .map((f) => ({
                ...f,
                id: String(f?.id || "").trim(),
                title: String(f?.title || "").trim()
              }))
              .filter((f) => f.id && f.title)
          : [];
        const hiddenSet = new Set(
          Array.isArray(auditForeshadowsIndex?.hiddenIds)
            ? (auditForeshadowsIndex.hiddenIds as any[]).map((x) => String(x))
            : []
        );
        const visible = all.filter((f) => !hiddenSet.has(f.id));
        const hidden = all.filter((f) => hiddenSet.has(f.id));
        const statusLabel = (s: string) =>
          s === "closed" ? "已回收" : s === "progress" ? "推进中" : "未回收";
        return (
          <>
            <div className="foreshadowTopRow">
              <button
                type="button"
                className="btnSort"
                disabled={busy || !activeBook}
                onClick={() => setForeshadowCreateOpen(true)}
              >
                新增伏笔
              </button>
              <div className="muted">自动来自审计:openLoops / closedLoops(你也可以手动维护)</div>
            </div>

            {visible.length ? (
              <div className="foreshadowList">
                {visible.map((f) => {
                  const st = String(f.status || "open");
                  const badgeCls =
                    st === "closed"
                      ? "foreshadowBadge foreshadowBadgeClosed"
                      : st === "progress"
                        ? "foreshadowBadge foreshadowBadgeProgress"
                        : "foreshadowBadge foreshadowBadgeOpen";
                  const first = Number.isFinite(Number(f.firstChapter)) ? Number(f.firstChapter) : null;
                  const last = Number.isFinite(Number(f.lastChapter)) ? Number(f.lastChapter) : null;
                  const expanded = Boolean(foreshadowExpanded[f.id]);
                  const lastProgressText = String(f.lastProgress || "").trim();
                  const noteText = String(f.note || "").trim();
                  const compactText = lastProgressText || noteText;
                  return (
                    <div key={f.id} className="foreshadowItem" data-foreshadow-id={f.id}>
                      <div className="foreshadowItemTop">
                        <button
                          type="button"
                          className="foreshadowExpandBtn"
                          disabled={busy}
                          onClick={() =>
                            setForeshadowExpanded((prev) => ({
                              ...prev,
                              [f.id]: !Boolean(prev[f.id])
                            }))
                          }
                          aria-expanded={expanded}
                          title={expanded ? "收起" : "展开查看"}
                        >
                          {expanded ? "▾" : "▸"}
                        </button>
                        <div className="foreshadowTitleRow">
                          <div className="foreshadowTitle">{f.title}</div>
                          <span className={badgeCls}>{statusLabel(st)}</span>
                        </div>
                        <div className="foreshadowItemRight row">
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || !activeBook}
                            onClick={() => openEditForeshadow(f)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="btnSort"
                            disabled={busy || !activeBook}
                            onClick={async () => {
                              if (!activeBook) return;
                              try {
                                const { index } = await hideAuditForeshadow(activeBook, {
                                  id: f.id,
                                  hidden: true
                                });
                                setAuditForeshadowsIndex(index);
                              } catch (e: any) {
                                setStatus(e?.message || String(e));
                              }
                            }}
                          >
                            隐藏
                          </button>
                        </div>
                      </div>

                      <div className="foreshadowMeta muted">
                        {first ? (
                          <button
                            type="button"
                            className="btnLinkMuted"
                            disabled={busy || !activeBook}
                            onClick={() => {
                              const c = chapters.find((x) => x.id === String(first));
                              if (c) void onOpenChapter(c);
                            }}
                          >
                            首次:第 {first} 章
                          </button>
                        ) : (
                          <span>首次:-</span>
                        )}
                        <span className="mutedDot">·</span>
                        {last ? (
                          <button
                            type="button"
                            className="btnLinkMuted"
                            disabled={busy || !activeBook}
                            onClick={() => {
                              const c = chapters.find((x) => x.id === String(last));
                              if (c) void onOpenChapter(c);
                            }}
                          >
                            最近:第 {last} 章
                          </button>
                        ) : (
                          <span>最近:-</span>
                        )}
                      </div>

                      {!expanded ? (
                        compactText ? <div className="foreshadowCompact muted">{compactText}</div> : null
                      ) : lastProgressText || noteText ? (
                        <div className="foreshadowDetails">
                          {lastProgressText ? (
                            <div className="foreshadowRow">
                              <div className="foreshadowLabel">最近推进</div>
                              <div className="foreshadowValue">{lastProgressText}</div>
                            </div>
                          ) : null}
                          {noteText ? (
                            <div className="foreshadowRow">
                              <div className="foreshadowLabel">备注</div>
                              <div className="foreshadowValue">{noteText}</div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted auditPanelEmpty">
                暂无伏笔。完成一次审计后会自动沉淀;也可以手动新增。
              </div>
            )}

            <div className="muted auditHiddenSummary">
              {hidden.length ? (
                <button
                  type="button"
                  className="btnLinkMuted"
                  disabled={busy || !activeBook}
                  onClick={() => setHiddenForeshadowPanelOpen(true)}
                >
                  已隐藏 {hidden.length}/{all.length} 条伏笔,点击查看
                </button>
              ) : null}
            </div>
          </>
        );
      })()}
    </div>
      )}
    </div>
    </>
  );
}
