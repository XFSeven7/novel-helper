import React, { useEffect, useMemo, useState } from "react";
import { getBookStats, type BookStats } from "../api";

type Props = {
  busy: boolean;
  activeBook: string | null;
  chapters: { id: string; title: string; wordCount: number }[];
  statsRefreshKey?: number;
  onSetStatus: (msg: string) => void;
};

export function StatsPanel({ busy, activeBook, statsRefreshKey = 0, onSetStatus }: Props) {
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
    return () => {
      cancelled = true;
    };
  }, [activeBook, statsRefreshKey, onSetStatus]);

  const dailyLast30 = useMemo(() => {
    if (!stats) return [];
    return stats.dailyBreakdown.slice(-30);
  }, [stats]);

  const maxHeatmapWords = useMemo(
    () => Math.max(...dailyLast30.map((d) => d.words), 1),
    [dailyLast30]
  );

  if (!activeBook) {
    return <div className="muted auditPanelEmpty">请先选择一本书。</div>;
  }

  if (loading) {
    return <div className="muted auditPanelEmpty statsLoading">加载统计中...</div>;
  }

  if (!stats) {
    return <div className="muted auditPanelEmpty">暂无统计数据。</div>;
  }

  const maxDailyWords = Math.max(...dailyLast30.map((d) => d.words), 1);
  const maxChapterWords = Math.max(...stats.chapterWordCounts.map((c) => c.wordCount), 1);
  const showHiatusAlert = stats.daysSinceLastWrite >= 3;

  return (
    <div className="statsPanel">
      {showHiatusAlert ? (
        <div className="statsAlert" role="status">
          <strong>已停更 {stats.daysSinceLastWrite} 天</strong>
          {stats.lastWriteDate ? (
            <span className="muted"> · 最近写作：{stats.lastWriteDate}</span>
          ) : (
            <span className="muted"> · 尚无写作记录</span>
          )}
          {stats.streak > 0 ? (
            <span className="muted"> · 此前连续 {stats.streak} 天</span>
          ) : null}
        </div>
      ) : null}

      <div className="statsGrid">
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
          value={
            stats.daysSinceLastWrite === 0
              ? "今日已更新"
              : stats.daysSinceLastWrite === 1
                ? "昨日有写作"
                : `停更 ${stats.daysSinceLastWrite} 天`
          }
          sub={stats.lastWriteDate ? `最近：${stats.lastWriteDate}` : ""}
        />
      </div>

      <section className="statsSection">
        <div className="auditCharDetailLabel">写作频率</div>
        <p className="statsFreqSummary muted">
          近 7 天写作 {stats.activeDaysLast7} 天 · 近 30 天写作 {stats.activeDaysLast30} 天
          {stats.avgNetWordsPerActiveDay30 > 0
            ? ` · 活跃日日均 ${formatNum(stats.avgNetWordsPerActiveDay30)} 字`
            : ""}
        </p>
        <div className="statsHeatmap" aria-label="近30日写作热力">
          {dailyLast30.map((d) => {
            const intensity = d.words > 0 ? 0.35 + 0.65 * (d.words / maxHeatmapWords) : 0.2;
            return (
              <div
                key={d.date}
                className={`statsHeatmapCell ${d.words > 0 ? "active" : ""}`}
                title={`${d.date}: ${d.words} 字`}
                style={d.words > 0 ? { opacity: intensity } : undefined}
              />
            );
          })}
        </div>
        <div className="statsHeatmapLegend muted">左旧右新 · 越深表示当日新增越多</div>
      </section>

      <section className="statsSection">
        <div className="auditCharDetailLabel">每日新增字数</div>
        <div className="statsBarChart">
          {dailyLast30.map((d) => (
            <div
              key={d.date}
              className="statsBar"
              title={`${d.date}: ${d.words} 字`}
              style={{
                height: `${Math.max(2, (d.words / maxDailyWords) * 100)}%`,
                opacity: d.words > 0 ? 0.85 : 0.35
              }}
            />
          ))}
        </div>
        <div className="statsBarLabels muted">
          {dailyLast30.length > 0 ? (
            <>
              <span>{dailyLast30[0]!.date.slice(5)}</span>
              <span>{dailyLast30[dailyLast30.length - 1]!.date.slice(5)}</span>
            </>
          ) : null}
        </div>
      </section>

      <section className="statsSection">
        <div className="auditCharDetailLabel">章节长度分布</div>
        <div className="statsBarChart statsBarChart--short">
          {stats.chapterWordCounts.map((ch) => (
            <div
              key={ch.index}
              className="statsBar"
              title={`第${ch.index}章 ${ch.title}: ${ch.wordCount} 字`}
              style={{ height: `${Math.max(2, (ch.wordCount / maxChapterWords) * 100)}%` }}
            />
          ))}
        </div>
      </section>

      <section className="statsSection">
        <div className="auditCharDetailLabel">累积字数趋势</div>
        <div className="statsBarChart statsBarChart--short">
          {stats.cumulativeWords.map((c) => (
            <div
              key={c.index}
              className="statsBar"
              title={`第${c.index}章: 累积 ${formatNum(c.words)} 字`}
              style={{
                height: `${Math.max(2, (c.words / Math.max(stats.totalWords, 1)) * 100)}%`
              }}
            />
          ))}
        </div>
        <div className="muted statsTotalHint">全书 {formatNum(stats.totalWords)} 字</div>
      </section>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="statsCard">
      <div className="muted statsCardLabel">{label}</div>
      <div className="statsCardValue">{value}</div>
      {sub ? <div className="muted statsCardSub">{sub}</div> : null}
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
