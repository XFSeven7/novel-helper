import React from "react";
import type { ChapterMeta, TimelineIndex } from "../../api";
import {
  deleteTimelineRange,
  hideAuditCharacter,
  markTimelineEvent
} from "../../api";
import { auditCharacterRoleClass } from "../../utils/auditCharacters";
import { auditCharStateExtraRows, auditCharTopExtraRows } from "../../utils/auditDiff";
import { ForeshadowPanel } from "./ForeshadowPanel";
import { MemoryPanel } from "./MemoryPanel";
import { PlacePanel } from "./PlacePanel";
import { RelationsNav } from "./RelationsNav";

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
  relationsFocusChar: string | null;
  setRelationsFocusChar: React.Dispatch<React.SetStateAction<string | null>>;
  relationsTypeFilter: string | null;
  setRelationsTypeFilter: React.Dispatch<React.SetStateAction<string | null>>;
  relationsOnlyWithRelations: boolean;
  setRelationsOnlyWithRelations: React.Dispatch<React.SetStateAction<boolean>>;
  onRelationsAddRequest: () => void;
  auditCharactersSearch: string;
  setAuditCharactersSearch: React.Dispatch<React.SetStateAction<string>>;
  expandedAuditCharIds: Record<string, boolean>;
  setExpandedAuditCharIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
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
  placeRevealTarget?: { group: string; name: string } | null;
  onPlaceRevealHandled?: () => void;
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
  relationsFocusChar,
  setRelationsFocusChar,
  relationsTypeFilter,
  setRelationsTypeFilter,
  relationsOnlyWithRelations,
  setRelationsOnlyWithRelations,
  onRelationsAddRequest,
  auditCharactersSearch,
  setAuditCharactersSearch,
  expandedAuditCharIds,
  setExpandedAuditCharIds,
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
  placeRevealTarget,
  onPlaceRevealHandled,
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
          人物关系
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
      <RelationsNav
        busy={busy}
        auditCharactersIndex={auditCharactersIndex}
        focusChar={relationsFocusChar}
        onFocusChar={setRelationsFocusChar}
        search={relationsSearch}
        onSearch={setRelationsSearch}
        typeFilter={relationsTypeFilter}
        onTypeFilter={setRelationsTypeFilter}
        onlyWithRelations={relationsOnlyWithRelations}
        onOnlyWithRelations={setRelationsOnlyWithRelations}
        onAddRelation={onRelationsAddRequest}
      />
    ) : globalTab === "places" ? (
    <PlacePanel
      busy={busy}
      activeBook={activeBook}
      chapters={chapters}
      auditPlacesIndex={auditPlacesIndex}
      setAuditPlacesIndex={setAuditPlacesIndex}
      setHiddenPlacePanelOpen={setHiddenPlacePanelOpen}
      setStatus={setStatus}
      openEditPlace={openEditPlace}
      onOpenChapter={onOpenChapter}
      revealTarget={placeRevealTarget}
      onRevealHandled={onPlaceRevealHandled}
    />
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
    <ForeshadowPanel
      busy={busy}
      activeBook={activeBook}
      chapters={chapters}
      auditForeshadowsIndex={auditForeshadowsIndex}
      setAuditForeshadowsIndex={setAuditForeshadowsIndex}
      foreshadowExpanded={foreshadowExpanded}
      setForeshadowExpanded={setForeshadowExpanded}
      setForeshadowCreateOpen={setForeshadowCreateOpen}
      setHiddenForeshadowPanelOpen={setHiddenForeshadowPanelOpen}
      setStatus={setStatus}
      openEditForeshadow={openEditForeshadow}
      onOpenChapter={onOpenChapter}
    />
      )}
    </div>
    </>
  );
}
