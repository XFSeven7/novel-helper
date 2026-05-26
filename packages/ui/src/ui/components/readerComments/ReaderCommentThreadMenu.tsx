import React, { useEffect, useRef, useState } from "react";

export function ReaderCommentThreadMenu(props: {
  pinned?: boolean;
  disabled?: boolean;
  onPin: (pinned: boolean) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="readerCommentMenuWrap" ref={wrapRef}>
      <button
        type="button"
        className="readerCommentMenuBtn"
        disabled={props.disabled}
        aria-label="评论操作"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋯
      </button>
      {open ? (
        <div className="readerCommentMenuPopover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              props.onPin(!props.pinned);
              setOpen(false);
            }}
          >
            {props.pinned ? "取消置顶" : "置顶"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="readerCommentMenuDanger"
            onClick={() => {
              if (window.confirm("确定删除这条评论？")) {
                props.onDelete();
              }
              setOpen(false);
            }}
          >
            删除
          </button>
        </div>
      ) : null}
    </div>
  );
}
