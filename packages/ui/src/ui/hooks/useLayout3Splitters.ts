import { useEffect, useRef, useState } from "react";
import { LAYOUT3_SPLIT_STORAGE_KEY } from "../constants";
import { clamp } from "../utils/math";
import { useLocalStorageState } from "./useLocalStorageState";

const GUIDANCE_W_MIN = 280;
const GUIDANCE_W_MAX = 560;
const GUIDANCE_W_DEFAULT = 400;
const RIGHT_W_MIN = 320;

export function useLayout3Splitters() {
  const [splits, setSplits] = useLocalStorageState<{ navW: number; guidanceW: number; rightW: number }>({
    key: LAYOUT3_SPLIT_STORAGE_KEY,
    defaultValue: { navW: 320, guidanceW: GUIDANCE_W_DEFAULT, rightW: 420 },
    parse: (raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        const navW = typeof parsed?.navW === "number" ? parsed.navW : 320;
        const guidanceW =
          typeof parsed?.guidanceW === "number" ? parsed.guidanceW : GUIDANCE_W_DEFAULT;
        const rightW = typeof parsed?.rightW === "number" ? parsed.rightW : 420;
        return {
          navW: clamp(navW, 240, 560),
          guidanceW: clamp(guidanceW, GUIDANCE_W_MIN, GUIDANCE_W_MAX),
          rightW: clamp(rightW, RIGHT_W_MIN, 720)
        };
      } catch {
        return { navW: 320, guidanceW: GUIDANCE_W_DEFAULT, rightW: 420 };
      }
    }
  });

  const [dragging, setDragging] = useState<null | "nav" | "guidance" | "right">(null);
  const dragStartRef = useRef<{
    kind: "nav" | "guidance" | "right";
    x: number;
    navW: number;
    guidanceW: number;
    rightW: number;
  } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const st = dragStartRef.current;
      if (!st) return;
      const dx = ev.clientX - st.x;
      if (st.kind === "nav") {
        const navW = clamp(st.navW + dx, 240, 560);
        setSplits((v) => ({ ...v, navW }));
      } else if (st.kind === "guidance") {
        const guidanceW = clamp(st.guidanceW + dx, GUIDANCE_W_MIN, GUIDANCE_W_MAX);
        setSplits((v) => ({ ...v, guidanceW }));
      } else {
        const rightW = clamp(st.rightW - dx, RIGHT_W_MIN, 720);
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
    guidanceW: splits.guidanceW,
    rightW: splits.rightW,
    setSplits,
    dragging,
    setDragging,
    dragStartRef,
    rightWMin: RIGHT_W_MIN
  } as const;
}
