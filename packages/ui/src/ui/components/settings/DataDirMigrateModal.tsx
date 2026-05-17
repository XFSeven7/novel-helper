import React, { useState } from "react";

export function DataDirMigrateModal(props: {
  busy: boolean;
  sourceDir: string;
  targetDir: string;
  onCancel: () => void;
  onSwitchOnly: () => void;
  onMigrate: (deleteSource: boolean) => void;
}) {
  const { busy, sourceDir, targetDir, onCancel, onSwitchOnly, onMigrate } = props;
  const [deleteSource, setDeleteSource] = useState(true);

  return (
    <div className="modalBackdrop" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className="modalPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-dir-migrate-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="data-dir-migrate-heading" className="modalHeading">
          迁移写作数据
        </h2>
        <p className="modalChapterGapBody">
          是否将当前写作数据从下方目录迁移到新目录？选择迁移时，目标文件夹须为空。
        </p>
        <p className="muted settingsDataDirMigratePath">
          <span className="settingsDataDirMigrateLabel">当前</span>
          <code>{sourceDir}</code>
        </p>
        <p className="muted settingsDataDirMigratePath">
          <span className="settingsDataDirMigrateLabel">新目录</span>
          <code>{targetDir}</code>
        </p>
        <label className="toggle settingsDataDirMigrateCheck">
          <input
            type="checkbox"
            checked={deleteSource}
            disabled={busy}
            onChange={(e) => setDeleteSource(e.target.checked)}
          />
          迁移成功后删除原目录数据
        </label>
        <div className="modalActions">
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btnModalSecondary" disabled={busy} onClick={onSwitchOnly}>
            否，仅切换目录
          </button>
          <button
            type="button"
            className="btnModalPrimary"
            disabled={busy}
            onClick={() => onMigrate(deleteSource)}
          >
            {busy ? "迁移中…" : "是，迁移数据"}
          </button>
        </div>
      </div>
    </div>
  );
}
