import React, { useEffect, useMemo, useState } from "react";
import { getBookStats, type BookStats } from "../api";
import { WritingContributionCalendar } from "./WritingContributionCalendar";
import { StatsLineChart, type StatsLineChartPoint } from "./StatsLineChart";

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

  if (!activeBook) {
    return <div className="muted auditPanelEmpty">请先选择一本书。</div>;
  }

  if (loading) {
    return <div className="muted auditPanelEmpty statsLoading">加载统计中...</div>;
  }

  if (!stats) {
    return <div className="muted auditPanelEmpty">暂无统计数据。</div>;
  }

  const showHiatusAlert = stats.daysSinceLastWrite >= 3;

  const dailyLinePoints: StatsLineChartPoint[] = dailyLast30.map((d) => ({
    key: d.date,
    value: d.words,
    title: `${d.date}: ${d.words.toLocaleString()} 字`
  }));

  const chapterLinePoints: StatsLineChartPoint[] = stats.chapterWordCounts.map((ch) => ({
    key: String(ch.index),
    value: ch.wordCount,
    title: `第${ch.index}章 ${ch.title}: ${ch.wordCount.toLocaleString()} 字`
  }));

  const cumulativeLinePoints: StatsLineChartPoint[] = stats.cumulativeWords.map((c) => ({
    key: String(c.index),
    value: c.words,
    title: `第${c.index}章: 累积 ${formatNum(c.words)} 字`
  }));

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
        <WritingContributionCalendar
          writingActivity={stats.writingActivity ?? []}
          availableYears={
            stats.availableYears?.length
              ? stats.availableYears
              : [new Date().getFullYear()]
          }
        />
      </section>

      <section className="statsSection">
        <div className="auditCharDetailLabel">每日新增字数</div>
        <p className="statsChartHint muted">近 30 日</p>
        <StatsLineChart
          points={dailyLinePoints}
          xStartLabel={dailyLast30[0]?.date.slice(5)}
          xEndLabel={dailyLast30[dailyLast30.length - 1]?.date.slice(5)}
        />
      </section>

      <section className="statsSection">
        <div className="auditCharDetailLabel">章节长度分布</div>
        <StatsLineChart points={chapterLinePoints} short />
      </section>

      <section className="statsSection">
        <div className="auditCharDetailLabel">累积字数趋势</div>
        <StatsLineChart points={cumulativeLinePoints} short />
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
