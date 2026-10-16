import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteFont,
  listFonts,
  uploadFont,
  type CustomFontDto,
  type FontPresetDto
} from "../../api";
import { useUiPrefField } from "../../uiPrefs/UiPrefsContext";
import {
  customFontIdFromFontId,
  ensureCustomFontFaces,
  resolveFontFamily
} from "../../utils/fontStorage";

const PREVIEW =
  "天地玄黄，宇宙洪荒。The quick brown fox jumps over the lazy dog.";

function formatErr(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  return e.message.trim() || "请求失败";
}

export function SettingsAppearancePanel() {
  const [fontId, setFontId] = useUiPrefField("fontId", "system");
  const [presets, setPresets] = useState<FontPresetDto[]>([]);
  const [custom, setCustom] = useState<CustomFontDto[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectivePreviewId = hoverId ?? fontId ?? "system";
  const previewFamily = useMemo(() => resolveFontFamily(effectivePreviewId), [effectivePreviewId]);

  const currentLabel = useMemo(() => {
    const id = fontId || "system";
    const preset = presets.find((item) => item.id === id);
    if (preset) return preset.displayName;
    const customId = customFontIdFromFontId(id);
    const customFont = customId ? custom.find((item) => item.id === customId) : undefined;
    return customFont?.displayName ?? id;
  }, [fontId, presets, custom]);

  async function refresh() {
    const result = await listFonts();
    setPresets(result.presets);
    ensureCustomFontFaces(result.custom.map((font) => font.id));
    setCustom(result.custom);
  }

  useEffect(() => {
    void refresh().catch((e) => setStatus(formatErr(e)));
  }, []);

  function selectFont(id: string) {
    setFontId(id);
  }

  async function onUpload(file: File) {
    setBusy(true);
    setStatus("");
    try {
      const { font } = await uploadFont(file);
      await refresh();
      selectFont(`custom:${font.id}`);
      setStatus(`已上传：${font.displayName}`);
    } catch (e) {
      setStatus(formatErr(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(id: string, name: string) {
    if (!window.confirm(`删除字体「${name}」？`)) return;
    setBusy(true);
    setStatus("");
    try {
      await deleteFont(id);
      await refresh();
      if (fontId === `custom:${id}`) selectFont("system");
      setStatus("已删除字体");
    } catch (e) {
      setStatus(formatErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settingsAppearance">
      <div className="settingsSection">
        <div className="settingsSectionTitle">当前字体</div>
        <div className="muted">{currentLabel}</div>
      </div>

      <div className="settingsSection">
        <div className="settingsSectionTitle">预置字体</div>
        <div className="fontPickList" role="listbox" aria-label="预置字体">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={fontId === preset.id}
              className={`fontPickItem ${fontId === preset.id ? "active" : ""}`}
              style={{ fontFamily: resolveFontFamily(preset.id) }}
              onMouseEnter={() => setHoverId(preset.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => selectFont(preset.id)}
              disabled={busy}
            >
              {preset.displayName}
            </button>
          ))}
        </div>
      </div>

      <div className="settingsSection">
        <div className="settingsSectionTitle">我的字体</div>
        <div className="row fontUploadRow">
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            className="fontUploadInput"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
          <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "处理中…" : "上传字体"}
          </button>
        </div>
        {custom.length === 0 ? (
          <div className="muted">尚未上传自定义字体</div>
        ) : (
          <div className="fontPickList">
            {custom.map((font) => {
              const id = `custom:${font.id}`;
              return (
                <div key={font.id} className="fontPickRow">
                  <button
                    type="button"
                    className={`fontPickItem ${fontId === id ? "active" : ""}`}
                    style={{ fontFamily: resolveFontFamily(id) }}
                    onMouseEnter={() => setHoverId(id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => selectFont(id)}
                    disabled={busy}
                  >
                    {font.displayName}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() => void onDelete(font.id, font.displayName)}
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="settingsSection">
        <div className="settingsSectionTitle">预览</div>
        <div className="fontPreviewBox" style={{ fontFamily: previewFamily }}>
          <div className="fontPreviewSmall">{PREVIEW}</div>
          <div className="fontPreviewMedium">{PREVIEW}</div>
          <div className="fontPreviewLarge">{PREVIEW}</div>
        </div>
      </div>

      {status ? <div className="muted" role="status">{status}</div> : null}
    </div>
  );
}
