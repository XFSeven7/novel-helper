import React, { useEffect, useMemo, useRef, useState } from "react";

export type AppSelectOption = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
};

export type AppSelectProps = {
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  displayLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  noResultsText?: string;
};

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

function optionMatchesQuery(o: AppSelectOption, q: string): boolean {
  if (!q) return true;
  const hay = `${o.label} ${o.group ?? ""}`.toLowerCase();
  return hay.includes(q);
}

export function AppSelect({
  value,
  options,
  onChange,
  placeholder = "（未选择）",
  disabled = false,
  className,
  displayLabel,
  searchable = true,
  searchPlaceholder = "搜索…",
  emptyText = "暂无选项",
  noResultsText = "无匹配项"
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const triggerText =
    displayLabel?.trim() ||
    (value ? selected?.label ?? value : "") ||
    placeholder;

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    return options.filter((o) => optionMatchesQuery(o, q));
  }, [options, query]);

  const { ungrouped, grouped } = useMemo(() => {
    const ungrouped: AppSelectOption[] = [];
    const grouped = new Map<string, AppSelectOption[]>();
    for (const o of filtered) {
      if (o.group) {
        const arr = grouped.get(o.group) ?? [];
        arr.push(o);
        grouped.set(o.group, arr);
      } else {
        ungrouped.push(o);
      }
    }
    return { ungrouped, grouped };
  }, [filtered]);

  const hasVisibleOptions = ungrouped.length > 0 || grouped.size > 0;

  function close() {
    setOpen(false);
    setQuery("");
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function selectOption(next: string) {
    onChange(next);
    close();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className={`appSelectRoot ${className ?? ""}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`appSelectTrigger ${open ? "is-open" : ""} ${!value ? "is-placeholder" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu())}
      >
        <span className="appSelectTriggerText">{triggerText}</span>
        <span className="appSelectCaret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="appSelectMenu" role="listbox" aria-label="选择项">
          {searchable ? (
            <div className="appSelectSearchWrap">
              <input
                ref={searchRef}
                type="search"
                className="appSelectSearch"
                value={query}
                placeholder={searchPlaceholder}
                aria-label="搜索选项"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </div>
          ) : null}
          <div className="appSelectList">
            {options.length === 0 ? (
              <div className="appSelectEmpty">{emptyText}</div>
            ) : !hasVisibleOptions ? (
              <div className="appSelectEmpty">{noResultsText}</div>
            ) : (
              <>
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={`appSelectOption ${!value ? "is-current" : ""}`}
                  onClick={() => selectOption("")}
                >
                  <span className="appSelectOptionLabel">{placeholder}</span>
                  {!value ? <span className="appSelectCheck">✓</span> : null}
                </button>
                {ungrouped.map((o) => (
                  <OptionRow key={o.value} option={o} current={value} onSelect={selectOption} />
                ))}
                {[...grouped.entries()].map(([group, items]) => (
                  <div key={group} className="appSelectGroup">
                    <div className="appSelectGroupTitle">{group}</div>
                    {items.map((o) => (
                      <OptionRow key={o.value} option={o} current={value} onSelect={selectOption} />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OptionRow(props: {
  option: AppSelectOption;
  current: string;
  onSelect: (value: string) => void;
}) {
  const { option, current, onSelect } = props;
  const isCurrent = option.value === current;
  return (
    <button
      type="button"
      role="option"
      aria-selected={isCurrent}
      disabled={option.disabled}
      className={`appSelectOption ${isCurrent ? "is-current" : ""}`}
      onClick={() => onSelect(option.value)}
    >
      <span className="appSelectOptionLabel">{option.label}</span>
      {isCurrent ? <span className="appSelectCheck">✓</span> : null}
    </button>
  );
}
