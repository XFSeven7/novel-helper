import React, { useEffect, useState } from "react";
import { getBookStats, type BookStats } from "../api";

type Props = {
  busy: boolean;
  activeBook: string | null;
  chapters: { id: string; title: string; wordCount: number }[];
  onSetStatus: (msg: string) => void;
};

export function StatsPanel({ busy, activeBook, chapters, onSetStatus }: Props) {
  const [stats, setStats] = useState<BookStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeBook) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBookStats(activeBook)
      .then((r) => {
        if (!cancelled) setStats(r.stats);
      })
      .catch((e: any) => {
        if (!cancelled) onSetStatus(e?.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeBook]);

  if (!activeBook) {
    return <div className="muted auditPanelEmpty">请先选择一本书。</div>;
  }

  if (loading) {
    return <div className="muted auditPanelEmpty" style={{ padding: 20 }}>加载统计中...</div>;
  }

  if (!stats) {
    return <div className="muted auditPanelEmpty">暂无统计数据。</div>;
  }

  const maxDailyWords = Math.max(...stats.dailyBreakdown.map((d) => d.words), 1);
  const maxChapterWords = Math.max(...stats.chapterWordCounts.map((c) => c.wordCount), 1);

  return (
    <div style={{ padding: "10px" }}>
      {/* 概览卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <StatCard label="总字数" value={formatNum(stats.totalWords)} />
        <StatCard label="章节数" value={String(stats.totalChapters)} />
        <StatCard label="平均每章" value={formatNum(stats.avgChapterLength)} />
        <StatCard
          label="最长章"
          value={formatNum(stats.maxChapterWordCount)}
          sub={truncate(stats.maxChapterTitle, 16)}
        />
        <StatCard
          label="最短章"
          value={formatNum(stats.minChapterWordCount)}
          sub={truncate(stats.minChapterTitle, 16)}
        />
        <StatCard
          label={stats.streak > 0 ? `连续写作 ${stats.streak} 天` : "未连续"}
          value={stats.daysSinceLastWrite > 0 ? `停更 ${stats.daysSinceLastWrite} 天` : "今日已更新"}
          sub={stats.lastWriteDate ? `最近更新: ${stats.lastWriteDate}` : ""}
        />
      </div>

      {/* 每日写作量趋势 */}
      <div style={{ marginBottom: 16 }}>
        <div className="auditCharDetailLabel" style={{ marginBottom: 6 }}>每日写作量</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100, padding: "4px 0" }}>
          {stats.dailyBreakdown.slice(-30).map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.words} 字 (${d.chapters} 章)`}
              style={{
                flex: 1,
                background: d.words > 0 ? "var(--accent)" : "var(--border)",
                height: `${Math.max(2, (d.words / maxDailyWords) * 100)}px`,
                minWidth: 4,
                borderRadius: "2px 2px 0 0",
                opacity: d.words > 0 ? 0.8 : 0.3
              }}
            />
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          近 30 天日写作量（条柱越高=写得越多）
        </div>
      </div>

      {/* 每章字数柱状图 */}
      <div style={{ marginBottom: 16 }}>
        <div className="auditCharDetailLabel" style={{ marginBottom: 6 }}>章节长度分布</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, padding: "4px 0" }}>
          {stats.chapterWordCounts.map((ch) => (
            <div
              key={ch.index}
              title={`第${ch.index}章: ${ch.wordCount} 字`}
              style={{
                flex: 1,
                background: "var(--accent)",
                height: `${Math.max(2, (ch.wordCount / maxChapterWords) * 80)}px`,
                minWidth: 3,
                borderRadius: "2px 2px 0 0",
                opacity: 0.7
              }}
            />
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          每章字数（从左到右按章节顺序）
        </div>
      </div>

      {/* 累积字数 */}
      <div>
        <div className="auditCharDetailLabel" style={{ marginBottom: 6 }}>累积字数趋势</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, padding: "4px 0" }}>
          {stats.cumulativeWords.map((c) => (
            <div
              key={c.index}
              title={`第${c.index}章: 累积 ${c.words} 字`}
              style={{
                flex: 1,
                background: "var(--accent)",
                height: `${Math.max(2, (c.words / stats.totalWords) * 80)}px`,
                minWidth: 3,
                borderRadius: "2px 2px 0 0",
                opacity: 0.7
              }}
            />
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          总字数: {formatNum(stats.totalWords)}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "var(--bg2)",
      borderRadius: 6,
      padding: "8px 10px",
      border: "1px solid var(--border)"
    }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub ? <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return n.toLocaleString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}
