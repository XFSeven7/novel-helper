import React, { useEffect, useMemo, useState } from "react";
import { RELATION_TYPE_OPTIONS } from "../../constants/relationTypes";
import type { FocusRelation } from "../../utils/relationsGraph";

export function RelationEditDrawer({
  open,
  busy,
  focusChar,
  editing,
  characterNames,
  onClose,
  onSave,
  onDelete
}: {
  open: boolean;
  busy: boolean;
  focusChar: string | null;
  editing: FocusRelation | null;
  characterNames: string[];
  onClose: () => void;
  onSave: (payload: {
    ownerName: string;
    ownerIndex: number | null;
    targetName: string;
    types: string[];
    emotionalPolarity: string;
    conflictIndex: string;
    sharedSecrets: string[];
  }) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const ownerName = editing?.ownerName ?? focusChar ?? "";
  const [targetName, setTargetName] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [emotionalPolarity, setEmotionalPolarity] = useState("");
  const [conflictIndex, setConflictIndex] = useState("");
  const [secretsText, setSecretsText] = useState("");

  const otherOptions = useMemo(
    () => characterNames.filter((n) => n !== ownerName),
    [characterNames, ownerName]
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTargetName(editing.other);
      setTypes([...editing.types]);
      setEmotionalPolarity(editing.emotionalPolarity);
      setConflictIndex(editing.conflictIndex);
      setSecretsText(editing.sharedSecrets.join("\n"));
    } else {
      setTargetName("");
      setTypes([]);
      setEmotionalPolarity("");
      setConflictIndex("");
      setSecretsText("");
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  function toggleType(value: string) {
    setTypes((prev) => (prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]));
  }

  return (
    <div className="modalBackdrop relationDrawerBackdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="modalPanel modalPanelOpaque relationDrawerPanel"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "编辑关系" : "添加关系"}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modalHeading">{editing ? "编辑关系" : "添加关系"}</h3>
        <p className="muted relationDrawerHint">关系记录在「{ownerName}」名下维护。</p>

        <div className="modalField">
          <label className="modalLabel">本方</label>
          <input className="modalInput" value={ownerName} disabled readOnly />
        </div>

        <div className="modalField">
          <label className="modalLabel">对方</label>
          <input
            className="modalInput"
            list="relation-target-names"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder="选择或输入角色名"
            disabled={busy}
          />
          <datalist id="relation-target-names">
            {otherOptions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        <div className="modalField">
          <label className="modalLabel">关系类型</label>
          <div className="relationTypePickers">
            {RELATION_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`relationTypeChip${types.includes(opt.value) ? " relationTypeChipActive" : ""}`}
                disabled={busy}
                onClick={() => toggleType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="modalField">
          <label className="modalLabel">情感</label>
          <input
            className="modalInput"
            value={emotionalPolarity}
            onChange={(e) => setEmotionalPolarity(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="modalField">
          <label className="modalLabel">冲突</label>
          <input
            className="modalInput"
            value={conflictIndex}
            onChange={(e) => setConflictIndex(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="modalField">
          <label className="modalLabel">共同秘密</label>
          <textarea
            className="modalTextarea"
            rows={3}
            value={secretsText}
            onChange={(e) => setSecretsText(e.target.value)}
            placeholder="一行一个"
            disabled={busy}
          />
        </div>

        <div className="modalActions modalActionsWrap">
          {editing && onDelete ? (
            <button type="button" className="btnModalDanger" disabled={busy} onClick={() => void onDelete()}>
              删除
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btnModalPrimary"
            disabled={busy || !ownerName || !targetName.trim()}
            onClick={() =>
              void onSave({
                ownerName,
                ownerIndex: editing?.ownerIndex ?? null,
                targetName: targetName.trim(),
                types,
                emotionalPolarity,
                conflictIndex,
                sharedSecrets: secretsText
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              })
            }
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
