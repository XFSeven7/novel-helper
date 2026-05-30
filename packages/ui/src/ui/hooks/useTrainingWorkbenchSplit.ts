import { useEffect, useRef, useState } from "react";
import { clamp } from "../utils/math";
import { useLocalStorageState } from "./useLocalStorageState";

const MIN_PANE_PX = 280;

export function useTrainingWorkbenchSplit(mode: "learn" | "practice" | "copybook") {
  const storageKey =
    mode === "learn"
      ? "training:splitRatio:learn"
      : mode === "copybook"
        ? "training:splitRatio:copybook"
        : "training:splitRatio:practice";

  const [ratio, setRatio] = useLocalStorageState<number>({
    key: storageKey,
    defaultValue: 0.5,
    parse: (raw) => {
      const n = raw ? Number(raw) : 0.5;
      return clamp(Number.isFinite(n) ? n : 0.5, 0.25, 0.75);
    },
    serialize: (v) => String(v)
  });

  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; ratio: number; width: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      const el = containerRef.current;
      if (!st || !el) return;
      const dx = ev.clientX - st.x;
      const next = clamp(st.ratio + dx / st.width, 0.25, 0.75);
      setRatio(next);
    };
    const onUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setRatio]);

  function startDrag(ev: React.MouseEvent) {
    const el = containerRef.current;
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    if (width < MIN_PANE_PX * 2) return;
    dragRef.current = { x: ev.clientX, ratio, width };
    setDragging(true);
  }

  return {
    containerRef,
    ratio,
    dragging,
    startDrag,
    minPanePx: MIN_PANE_PX
  };
}
