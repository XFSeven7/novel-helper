import React, { useEffect, useState } from "react";

function formatClock24(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatClockAria(d: Date): string {
  return `当前时间 ${formatClock24(d)}`;
}

function toDateTimeLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${mi}:${s}`;
}

export function TopBarClock({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const label = formatClock24(now);
  const aria = formatClockAria(now);

  return (
    <time className="topbarClock" dateTime={toDateTimeLocal(now)} title={aria} aria-label={aria}>
      {label}
    </time>
  );
}
