import { useEffect, useRef, useState } from "react";
import { clamp } from "../utils/math";
import { useUiPrefField } from "../uiPrefs/UiPrefsContext";
import type { UiPrefsLayout3Splits } from "../uiPrefs/types";

const GUIDANCE_W_MIN = 280;
const GUIDANCE_W_MAX = 560;
const GUIDANCE_W_DEFAULT = 400;
const RIGHT_W_MIN = 320;

const DEFAULT_SPLITS: UiPrefsLayout3Splits = {
  navW: 320,
  guidanceW: GUIDANCE_W_DEFAULT,
  rightW: 420
};

function clampSplits(s: UiPrefsLayout3Splits): UiPrefsLayout3Splits {
  return {
    navW: clamp(s.navW, 240, 560),
    guidanceW: clamp(s.guidanceW, GUIDANCE_W_MIN, GUIDANCE_W_MAX),
    rightW: clamp(s.rightW, RIGHT_W_MIN, 720)
  };
}

export function useLayout3Splitters() {
  const [splitsRaw, setSplitsRaw] = useUiPrefField("layout3Splits", DEFAULT_SPLITS);
  const splits = clampSplits({
    navW: typeof splitsRaw.navW === "number" ? splitsRaw.navW : DEFAULT_SPLITS.navW,
    guidanceW: typeof splitsRaw.guidanceW === "number" ? splitsRaw.guidanceW : DEFAULT_SPLITS.guidanceW,
    rightW: typeof splitsRaw.rightW === "number" ? splitsRaw.rightW : DEFAULT_SPLITS.rightW
  });
  const setSplits = (
    updater: UiPrefsLayout3Splits | ((prev: UiPrefsLayout3Splits) => UiPrefsLayout3Splits)
  ) => {
    setSplitsRaw((prev) => {
      const base = clampSplits({
        navW: typeof prev?.navW === "number" ? prev.navW : DEFAULT_SPLITS.navW,
        guidanceW: typeof prev?.guidanceW === "number" ? prev.guidanceW : DEFAULT_SPLITS.guidanceW,
        rightW: typeof prev?.rightW === "number" ? prev.rightW : DEFAULT_SPLITS.rightW
      });
      const next = typeof updater === "function" ? updater(base) : updater;
      return clampSplits(next);
    });
  };

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
  }, [dragging]);

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
