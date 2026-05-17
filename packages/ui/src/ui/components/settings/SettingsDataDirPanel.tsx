import React, { useEffect, useRef, useState } from "react";
import { getAppSettings, pickAppDataDirectory, putAppSettings, type AppSettings } from "../../api";
import { DataDirMigrateModal } from "./DataDirMigrateModal";

const FEEDBACK_MS = 3200;

const SOURCE_LABEL: Record<AppSettings["source"], string> = {
  env: "环境变量",
  file: "设置文件",
  default: "默认"
};

function normalizePath(p: string) {
  const t = p.trim();
  return t.replace(/\/+$/, "") || t;
}

export function SettingsDataDirPanel(props: {
  busy: boolean;
  onDataDirChanged: () => void | Promise<void>;
}) {
  const { busy, onDataDirChanged } = props;
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState("");
  const [migrateModal, setMigrateModal] = useState<{ sourceDir: string; targetDir: string } | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  function showFeedback(msg: string, kind: "ok" | "err" = "ok") {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ msg, kind });
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, FEEDBACK_MS);
  }

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getAppSettings()
      .then((s) => {
        if (cancelled) return;
        setInfo(s);
        setDraft(s.fileDataDir ?? s.effectiveDataDir);
      })
      .catch((e: unknown) => showFeedback(e instanceof Error ? e.message : String(e), "err"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onPickDirectory() {
    if (!info || info.envLocked) return;
    setPicking(true);
    try {
      const result = await pickAppDataDirectory();
      if (!result.cancelled) setDraft(result.path);
    } catch (e: unknown) {
      showFeedback(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setPicking(false);
    }
  }

  async function applySave(migrate: boolean, deleteSource: boolean) {
    if (!info || info.envLocked) return;
    setSaving(true);
    try {
      const result = await putAppSettings({ dataDir: draft, migrate, deleteSource });
      let msg = "数据目录已更新，书架已刷新。";
      if (result.deleteSourceWarning) {
        msg += ` 未能删除原目录：${result.deleteSourceWarning}，请手动清理。`;
      }
      showFeedback(msg, "ok");
      const next = await getAppSettings();
      setInfo(next);
      setDraft(next.fileDataDir ?? next.effectiveDataDir);
      setMigrateModal(null);
      await onDataDirChanged();
    } catch (e: unknown) {
      showFeedback(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setSaving(false);
    }
  }

  function onSaveClick() {
    if (!info || info.envLocked) return;
    const target = draft.trim();
    if (!target) return;
    if (normalizePath(target) === normalizePath(info.effectiveDataDir)) {
      showFeedback("路径未变更。", "ok");
      return;
    }
    setMigrateModal({ sourceDir: info.effectiveDataDir, targetDir: target });
  }

  if (loading) return <div className="muted auditPanelEmpty">加载中…</div>;
  if (!info) return null;

  const locked = busy || info.envLocked || picking || saving;

  return (
    <>
      <div className="settingsDataDirPanel">
        <p className="muted settingsDataDirHint">书籍数据保存地址</p>
        <div className="settingsDataDirContent">
          <div className="settingsDataDirRow">
            <span className="muted">当前地址</span>
            <code className="settingsDataDirPath">{info.effectiveDataDir}</code>
            <span className="settingsDataDirSource">{SOURCE_LABEL[info.source]}</span>
          </div>
          <div className="modelField">
            <div className="navSubtitle">书籍保存地址</div>
            <div className="settingsDataDirInputRow">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={locked}
                readOnly={!info.envLocked}
                placeholder="/Users/you/Documents/novel-data"
                title={draft}
              />
              {!info.envLocked ? (
                <button
                  type="button"
                  className="btnSort settingsDataDirPickBtn"
                  disabled={locked}
                  onClick={() => void onPickDirectory()}
                  title="打开系统文件夹选择器"
                >
                  {picking ? "选择中…" : "修改"}
                </button>
              ) : null}
            </div>
          </div>
          {feedback ? (
            <p
              className={`settingsDataDirFeedback ${feedback.kind === "err" ? "settingsDataDirFeedbackErr" : ""}`}
              role="status"
            >
              {feedback.msg}
            </p>
          ) : null}
          {info.envLocked ? (
            <p className="muted">已通过环境变量 NOVEL_HELPER_DATA_DIR 指定，无法在应用内修改。</p>
          ) : (
            <button
              type="button"
              className="btnModalPrimary"
              disabled={locked || !draft.trim()}
              onClick={onSaveClick}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          )}
        </div>
      </div>
      {migrateModal ? (
        <DataDirMigrateModal
          busy={saving}
          sourceDir={migrateModal.sourceDir}
          targetDir={migrateModal.targetDir}
          onCancel={() => !saving && setMigrateModal(null)}
          onSwitchOnly={() => void applySave(false, false)}
          onMigrate={(deleteSource) => void applySave(true, deleteSource)}
        />
      ) : null}
    </>
  );
}
