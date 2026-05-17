import React, { useCallback, useEffect, useRef } from "react";

export type OutlineTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
};

/** 随内容增高，不出现框内滚动条 */
export function OutlineTextarea({ value, onChange, disabled, rows = 2, placeholder }: OutlineTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(el.scrollHeight, 0)}px`;
  }, []);

  useEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  return (
    <textarea
      ref={ref}
      className="outlineTextarea"
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        syncHeight();
      }}
    />
  );
}
