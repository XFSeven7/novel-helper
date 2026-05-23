import { useCallback, useEffect, useRef } from "react";

function syncScrollPosition(source: HTMLElement, target: HTMLElement) {
  const srcMax = source.scrollHeight - source.clientHeight;
  const dstMax = target.scrollHeight - target.clientHeight;
  if (srcMax <= 0 || dstMax <= 0) {
    target.scrollTop = 0;
    return;
  }
  const ratio = source.scrollTop / srcMax;
  target.scrollTop = ratio * dstMax;
}

/** 左右两个可滚动容器按比例同步 scrollTop */
export function useSyncScrollPair(enabled: boolean, resetKey?: string) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef<"left" | "right" | null>(null);

  const sync = useCallback((from: "left" | "right") => {
    const src = from === "left" ? leftRef.current : rightRef.current;
    const dst = from === "left" ? rightRef.current : leftRef.current;
    if (!src || !dst) return;
    lockRef.current = from === "left" ? "right" : "left";
    syncScrollPosition(src, dst);
    requestAnimationFrame(() => {
      lockRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    const onLeft = () => {
      if (lockRef.current === "right") return;
      sync("left");
    };
    const onRight = () => {
      if (lockRef.current === "left") return;
      sync("right");
    };

    left.addEventListener("scroll", onLeft, { passive: true });
    right.addEventListener("scroll", onRight, { passive: true });
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
    };
  }, [enabled, sync, resetKey]);

  useEffect(() => {
    if (!enabled) return;
    leftRef.current && (leftRef.current.scrollTop = 0);
    rightRef.current && (rightRef.current.scrollTop = 0);
  }, [enabled, resetKey]);

  return { leftRef, rightRef };
}
