import { useEffect, useRef, useState } from "react";
import { clamp } from "../utils/math";
import { useLocalStorageState } from "./useLocalStorageState";

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 390;

export function useMobilePhoneWidth() {
  const [width, setWidth] = useLocalStorageState<number>({
    key: "novelHelper.mobilePhoneW",
    defaultValue: DEFAULT_WIDTH,
    parse: (raw) => {
      const n = raw ? Number(raw) : DEFAULT_WIDTH;
      return clamp(Number.isFinite(n) ? n : DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH);
    },
    serialize: (v) => String(Math.round(v))
  });

  const [dragging, setDragging] = useState(false);
  /** edge: 右缘拖宽跟指针同向；左缘反向（框居中时两边都能拉宽） */
  const dragRef = useRef<{ x: number; width: number; edge: "left" | "right" } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      const dx = ev.clientX - st.x;
      const delta = st.edge === "right" ? dx : -dx;
      setWidth(clamp(st.width + delta, MIN_WIDTH, MAX_WIDTH));
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

  function startDrag(edge: "left" | "right", ev: React.MouseEvent) {
    ev.preventDefault();
    dragRef.current = { x: ev.clientX, width, edge };
    setDragging(true);
  }

  return { width, dragging, startDrag };
}
