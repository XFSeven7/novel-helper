import React, { useEffect, useRef, useState } from "react";
import { THEME_PRESETS, type ThemeId } from "../../constants";
import { applyThemeToDocument, saveThemeId } from "../../utils/themeStorage";

export type ThemePickerProps = {
  busy: boolean;
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
};

export function ThemePicker({ busy, themeId, onThemeChange }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const snapshotRef = useRef<ThemeId>(themeId);
  const rootRef = useRef<HTMLDivElement>(null);

  function closeMenu(restoreSnapshot: boolean) {
    if (restoreSnapshot) applyThemeToDocument(snapshotRef.current);
    setOpen(false);
  }

  function openMenu() {
    snapshotRef.current = themeId;
    setOpen(true);
  }

  function confirmTheme(id: ThemeId) {
    onThemeChange(id);
    saveThemeId(id);
    snapshotRef.current = id;
    applyThemeToDocument(id);
    setOpen(false);
  }

  function previewTheme(id: ThemeId) {
    applyThemeToDocument(id);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el?.contains(e.target as Node)) closeMenu(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const current = THEME_PRESETS.find((p) => p.id === themeId);

  return (
    <div className="themePickerRoot" ref={rootRef}>
      <button
        type="button"
        className={`btnThemePicker ${open ? "active" : ""}`}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeMenu(true) : openMenu())}
        title="切换主题"
      >
        主题
        {current ? (
          <span
            className="themePickerBtnSwatch"
            style={{ background: current.previewBg, boxShadow: `inset 0 0 0 2px ${current.previewAccent}` }}
            aria-hidden
          />
        ) : null}
      </button>
      {open ? (
        <div
          className="themePickerMenu"
          role="listbox"
          aria-label="选择主题"
          onPointerLeave={() => applyThemeToDocument(snapshotRef.current)}
        >
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={preset.id === themeId}
              className={`themePickerOption ${preset.id === themeId ? "is-current" : ""}`}
              onPointerEnter={() => previewTheme(preset.id)}
              onClick={() => confirmTheme(preset.id)}
            >
              <span
                className="themePickerSwatch"
                style={{
                  background: `linear-gradient(135deg, ${preset.previewBg} 58%, ${preset.previewAccent} 42%)`
                }}
                aria-hidden
              />
              <span className="themePickerLabel">{preset.label}</span>
              {preset.id === themeId ? <span className="themePickerCheck">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
