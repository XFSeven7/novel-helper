import React, { useEffect, useMemo, useRef, useState } from "react";
import { updateAuditCharacter } from "../../api";
import { relationTypesToLabels } from "../../constants/relationTypes";
import {
  getRelationsForFocus,
  parseAuditCharacters,
  relationsOverview,
  type FocusRelation,
  type StoredRelation
} from "../../utils/relationsGraph";
import { RelationEditDrawer } from "./RelationEditDrawer";

export function RelationsCenter({
  busy,
  activeBook,
  auditCharactersIndex,
  setAuditCharactersIndex,
  focusChar,
  setFocusChar,
  onStatus,
  addRequestKey,
  onAddRequestConsumed
}: {
  busy: boolean;
  activeBook: string;
  auditCharactersIndex: unknown;
  setAuditCharactersIndex: (index: unknown) => void;
  focusChar: string | null;
  setFocusChar: (name: string | null) => void;
  onStatus: (msg: string) => void;
  addRequestKey?: number;
  onAddRequestConsumed?: () => void;
}) {
  const characters = useMemo(() => parseAuditCharacters(auditCharactersIndex), [auditCharactersIndex]);
  const characterNames = useMemo(() => characters.map((c) => c.name), [characters]);
  const overview = useMemo(() => relationsOverview(characters), [characters]);
  const relations = useMemo(
    () => (focusChar ? getRelationsForFocus(focusChar, characters) : []),
    [focusChar, characters]
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<FocusRelation | null>(null);
  const [saving, setSaving] = useState(false);
  const lastAddRequestKeyRef = useRef(addRequestKey ?? 0);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditing(null);
    onAddRequestConsumed?.();
  }

  useEffect(() => {
    if (addRequestKey === undefined || addRequestKey === 0) {
      lastAddRequestKeyRef.current = 0;
      return;
    }
    if (addRequestKey === lastAddRequestKeyRef.current) return;
    lastAddRequestKeyRef.current = addRequestKey;

    if (!focusChar && characterNames.length) setFocusChar(characterNames[0]!);
    setEditing(null);
    setDrawerOpen(true);
  }, [addRequestKey, focusChar, characterNames, setFocusChar]);

  async function persistOwnerRelations(ownerName: string, nextRelations: StoredRelation[]) {
    const owner = characters.find((c) => c.name === ownerName);
    const rh = owner?.relationalHooks ?? {};
    const { index } = await updateAuditCharacter(activeBook, {
      name: ownerName,
      relationalHooks: {
        ...rh,
        relations: nextRelations,
        freeText: rh.freeText
      }
    });
    setAuditCharactersIndex(index);
  }

  async function handleSave(payload: {
    ownerName: string;
    ownerIndex: number | null;
    targetName: string;
    types: string[];
    emotionalPolarity: string;
    conflictIndex: string;
    sharedSecrets: string[];
  }) {
    const ownerName = payload.ownerName.trim();
    const targetName = payload.targetName.trim();
    if (!ownerName || !targetName) {
      onStatus("请填写对方角色名。");
      return;
    }
    setSaving(true);
    try {
      const owner = characters.find((c) => c.name === ownerName);
      const rels = [...(owner?.relationalHooks?.relations ?? [])];
      const next: StoredRelation = {
        targetName,
        types: payload.types.length ? payload.types : undefined,
        emotionalPolarity: payload.emotionalPolarity.trim() || undefined,
        conflictIndex: payload.conflictIndex.trim() || undefined,
        sharedSecrets: payload.sharedSecrets.length ? payload.sharedSecrets : undefined
      };
      if (payload.ownerIndex != null && payload.ownerIndex >= 0 && payload.ownerIndex < rels.length) {
        rels[payload.ownerIndex] = next;
      } else {
        const dup = rels.findIndex((r) => String(r?.targetName || "").trim() === targetName);
        if (dup >= 0) rels[dup] = next;
        else rels.push(next);
      }
      await persistOwnerRelations(ownerName, rels);
      closeDrawer();
    } catch (e: unknown) {
      onStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rel: FocusRelation) {
    setSaving(true);
    try {
      const owner = characters.find((c) => c.name === rel.ownerName);
      const rels = [...(owner?.relationalHooks?.relations ?? [])];
      if (rel.ownerIndex >= 0 && rel.ownerIndex < rels.length) {
        rels.splice(rel.ownerIndex, 1);
        await persistOwnerRelations(rel.ownerName, rels);
      }
      closeDrawer();
    } catch (e: unknown) {
      onStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!characters.length) {
    return (
      <div className="relationsCenter relationsCenterEmpty">
        <p className="muted">暂无角色库。完成章节分析后，人物关系会自动沉淀到这里。</p>
      </div>
    );
  }

  return (
    <div className="relationsCenter">
      {!focusChar ? (
        <div className="relationsOverview">
          <h3 className="relationsOverviewTitle">人物关系总览</h3>
          <p className="muted relationsOverviewMeta">
            {overview.characterCount} 个角色 · {overview.edgeCount} 条关系记录
            {overview.untypedEdgeCount > 0 ? ` · ${overview.untypedEdgeCount} 条未标注类型` : ""}
          </p>
          <p className="muted">在左侧选择角色，查看以 TA 为中心的关系。</p>
        </div>
      ) : (
        <>
          <div className="relationsCenterHead">
            <h3 className="relationsCenterTitle">{focusChar} 的关系</h3>
            <button
              type="button"
              className="btnSort"
              disabled={busy || saving}
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              + 添加
            </button>
          </div>
          <div className="relationsDetailList">
            {relations.length ? (
              relations.map((rel) => {
                const typesZh = relationTypesToLabels(rel.types);
                return (
                  <div key={`${rel.other}-${rel.ownerName}-${rel.ownerIndex}`} className="relationsCard">
                    <div className="relationsCardHead">
                      <span className="relationsCardOther">{rel.other}</span>
                      <button
                        type="button"
                        className="btnMini"
                        disabled={busy || saving}
                        onClick={() => {
                          setEditing(rel);
                          setDrawerOpen(true);
                        }}
                      >
                        编辑
                      </button>
                    </div>
                    {typesZh.length ? (
                      <div className="relationsCardTags">
                        {typesZh.map((t) => (
                          <span key={t} className="relationsCardTag">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="muted relationsCardMuted">未标注关系类型</div>
                    )}
                    {rel.emotionalPolarity ? (
                      <div className="muted relationsCardMuted">情感：{rel.emotionalPolarity}</div>
                    ) : null}
                    {rel.conflictIndex ? (
                      <div className="muted relationsCardMuted">冲突：{rel.conflictIndex}</div>
                    ) : null}
                    {rel.sharedSecrets.length ? (
                      <div className="muted relationsCardMuted">秘密：{rel.sharedSecrets.join("、")}</div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="muted auditPanelEmpty">该角色暂无关系记录。</div>
            )}
          </div>
        </>
      )}

      <RelationEditDrawer
        open={drawerOpen}
        busy={busy || saving}
        focusChar={focusChar}
        editing={editing}
        characterNames={characterNames}
        onClose={closeDrawer}
        onSave={handleSave}
        onDelete={editing ? () => void handleDelete(editing) : undefined}
      />
    </div>
  );
}
