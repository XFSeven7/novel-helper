import React, { useCallback, useId, useMemo, useRef, useState } from "react";

export type StatsLineChartPoint = {
  key: string;
  value: number;
  title: string;
};

type Props = {
  points: StatsLineChartPoint[];
  height?: number;
  short?: boolean;
  xStartLabel?: string;
  xEndLabel?: string;
  emptyLabel?: string;
};

const VB_W = 400;
const VB_H = 80;
const PAD_X = 6;
const PAD_Y = 10;

export function StatsLineChart({
  points,
  height = 100,
  short = false,
  xStartLabel,
  xEndLabel,
  emptyLabel = "暂无数据"
}: Props) {
  const fillId = useId().replace(/:/g, "");
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const max = Math.max(...points.map((p) => p.value), 1);
    const n = points.length;
    const innerW = VB_W - PAD_X * 2;
    const innerH = VB_H - PAD_Y * 2;

    const xy = points.map((p, i) => {
      const x = PAD_X + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = PAD_Y + innerH - (p.value / max) * innerH;
      return { x, y, point: p };
    });

    const lineD = xy
      .map(({ x, y }, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");
    const bottom = VB_H - PAD_Y;
    const areaD = `${lineD} L ${xy[xy.length - 1]!.x.toFixed(2)} ${bottom} L ${xy[0]!.x.toFixed(2)} ${bottom} Z`;

    return { lineD, areaD, xy, bottom };
  }, [points]);

  const pickNearestIndex = useCallback(
    (clientX: number) => {
      if (!geometry || !plotRef.current) return null;
      const rect = plotRef.current.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const viewX = ((clientX - rect.left) / rect.width) * VB_W;
      let best = 0;
      let bestDist = Infinity;
      geometry.xy.forEach(({ x }, i) => {
        const dist = Math.abs(x - viewX);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      return best;
    },
    [geometry]
  );

  const handlePlotMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const idx = pickNearestIndex(e.clientX);
      setActiveIndex(idx);
    },
    [pickNearestIndex]
  );

  const handlePlotLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (!geometry) {
    return <div className="statsLineChart statsLineChart--empty muted">{emptyLabel}</div>;
  }

  const active = activeIndex !== null ? geometry.xy[activeIndex] : null;

  return (
    <div className={`statsLineChart${short ? " statsLineChart--short" : ""}`}>
      <div
        ref={plotRef}
        className="statsLineChartPlot"
        style={{ height: short ? 80 : height }}
      >
        <svg
          className="statsLineChartSvg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-hidden
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <path className="statsLineChartArea" d={geometry.areaD} fill={`url(#${fillId})`} />
          <path
            className="statsLineChartLine"
            d={geometry.lineD}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {active ? (
            <line
              className="statsLineChartGuide"
              x1={active.x}
              x2={active.x}
              y1={PAD_Y}
              y2={geometry.bottom}
            />
          ) : null}
        </svg>
        {geometry.xy.map(({ x, y, point }, i) => (
          <span
            key={point.key}
            className={`statsLineChartDot${activeIndex === i ? " statsLineChartDot--active" : ""}`}
            style={{
              left: `${(x / VB_W) * 100}%`,
              top: `${(y / VB_H) * 100}%`
            }}
            aria-hidden
          />
        ))}
        <div
          className="statsLineChartHit"
          onMouseMove={handlePlotMove}
          onMouseLeave={handlePlotLeave}
          aria-hidden
        />
        {active ? (
          <div
            className="statsLineChartTooltip"
            style={{
              left: `${(active.x / VB_W) * 100}%`,
              top: `${(active.y / VB_H) * 100}%`
            }}
            role="tooltip"
          >
            {active.point.title}
          </div>
        ) : null}
      </div>
      {xStartLabel || xEndLabel ? (
        <div className="statsLineChartLabels muted">
          <span>{xStartLabel ?? ""}</span>
          <span>{xEndLabel ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}
