import { useEffect, useRef, useState } from "react";
import { LAYOUT3_SPLIT_STORAGE_KEY } from "../constants";
import { clamp } from "../utils/math";
import { useLocalStorageState } from "./useLocalStorageState";

export function useLayout3Splitters() {
  const [splits, setSplits] = useLocalStorageState<{ navW: number; rightW: number }>({
    key: LAYOUT3_SPLIT_STORAGE_KEY,
    defaultValue: { navW: 320, rightW: 420 },
    parse: (raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        const navW = typeof parsed?.navW === "number" ? parsed.navW : 320;
        const rightW = typeof parsed?.rightW === "number" ? parsed.rightW : 420;
        return { navW: clamp(navW, 240, 560), rightW: clamp(rightW, 320, 720) };
      } catch {
        return { navW: 320, rightW: 420 };
      }
    }
  });

  const [dragging, setDragging] = useState<null | "nav" | "right">(null);
  const dragStartRef = useRef<{ kind: "nav" | "right"; x: number; navW: number; rightW: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const st = dragStartRef.current;
      if (!st) return;
      const dx = ev.clientX - st.x;
      if (st.kind === "nav") {
        const navW = clamp(st.navW + dx, 240, 560);
        setSplits((v) => ({ ...v, navW }));
      } else {
        const rightW = clamp(st.rightW - dx, 320, 720);
        setSplits((v) => ({ ...v, rightW }));
      }
    };
    const onUp = () => {
      setDragging(null);
      dragStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setSplits]);

  return {
    navW: splits.navW,
    rightW: splits.rightW,
    setSplits,
    dragging,
    setDragging,
    dragStartRef
  } as const;
}

