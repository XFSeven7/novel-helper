import { useEffect, useRef, useState } from "react";
import { clamp } from "../utils/math";
import { useLocalStorageState } from "./useLocalStorageState";

const MIN_WIDTH = 140;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 200;

export function useTrainingTreeNavWidth() {
  const [width, setWidth] = useLocalStorageState<number>({
    key: "training:treeNavWidth",
    defaultValue: DEFAULT_WIDTH,
    parse: (raw) => {
      const n = raw ? Number(raw) : DEFAULT_WIDTH;
      return clamp(Number.isFinite(n) ? n : DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH);
    },
    serialize: (v) => String(Math.round(v))
  });

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      const dx = ev.clientX - st.x;
      setWidth(clamp(st.width + dx, MIN_WIDTH, MAX_WIDTH));
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
  }, [dragging, setWidth]);

  function startDrag(ev: React.MouseEvent) {
    ev.preventDefault();
    dragRef.current = { x: ev.clientX, width };
    setDragging(true);
  }

  return { width, dragging, startDrag, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH };
}
