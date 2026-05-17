import React, { useMemo, useState } from "react";
import {
  buildContributionWeeks,
  buildMonthLabels,
  buildWordsByDate,
  countYearStats,
  maxWordsInYear,
  wordLevel
} from "./contributionCalendarLayout";

type Props = {
  writingActivity: { date: string; words: number }[];
  availableYears: number[];
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function WritingContributionCalendar({ writingActivity, availableYears }: Props) {
  const todayYear = new Date().getFullYear();
  const defaultYear = availableYears.includes(todayYear)
    ? todayYear
    : availableYears[availableYears.length - 1] ?? todayYear;

  const [year, setYear] = useState(defaultYear);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const wordsByDate = useMemo(() => buildWordsByDate(writingActivity), [writingActivity]);

  const weeks = useMemo(
    () => buildContributionWeeks(year, wordsByDate, todayStr),
    [year, wordsByDate, todayStr]
  );

  const monthLabels = useMemo(() => buildMonthLabels(weeks, year), [weeks, year]);
  const maxWords = useMemo(() => maxWordsInYear(weeks), [weeks]);
  const { activeDays, totalWords } = useMemo(() => countYearStats(weeks), [weeks]);
  const noActivity = activeDays === 0;

  const minYear = availableYears[0] ?? year;
  const maxYear = availableYears[availableYears.length - 1] ?? year;
  const weekCount = weeks.length;

  return (
    <div
      className="contribCalendar"
      data-no-activity={noActivity || undefined}
      style={{ ["--contrib-weeks" as string]: String(weekCount) }}
    >
      <div className="contribCalendarToolbar">
        <div className="contribYearNav" role="group" aria-label="选择年份">
          <button
            type="button"
            className="contribYearBtn"
            disabled={year <= minYear}
            onClick={() => setYear((y) => Math.max(minYear, y - 1))}
            aria-label="上一年"
          >
            ‹
          </button>
          <select
            className="contribYearSelect"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="年份"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="contribYearBtn"
            disabled={year >= maxYear}
            onClick={() => setYear((y) => Math.min(maxYear, y + 1))}
            aria-label="下一年"
          >
            ›
          </button>
        </div>
        <p className="contribYearSummary muted">
          {year} 年写作 {activeDays} 天 · 共 {formatNum(totalWords)} 字
          {activeDays > 0 ? ` · 活跃日日均 ${formatNum(Math.round(totalWords / activeDays))} 字` : ""}
        </p>
      </div>

      <div className="contribCalendarBody">
        <div className="contribCalendarInner">
          <div className="contribMonthRow" aria-hidden>
            <span className="contribWeekdaySpacer" />
            <div
              className="contribMonthTrack"
              style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))` }}
            >
              {weeks.map((_, weekIndex) => {
                const label = monthLabels.find((m) => m.weekIndex === weekIndex);
                return (
                  <span key={weekIndex} className="contribMonthCell">
                    {label ? label.label : ""}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="contribGridWrap">
            <div className="contribWeekdayCol" aria-hidden>
              {WEEKDAY_LABELS.map((label, i) => (
                <span
                  key={label}
                  className={`contribWeekdayLabel ${i % 2 === 1 ? "" : "contribWeekdayLabel--dim"}`}
                >
                  {i % 2 === 1 ? label : ""}
                </span>
              ))}
            </div>

            <div className="contribGrid" role="img" aria-label={`${year} 年写作贡献图`}>
              {weeks.map((week, weekIndex) =>
                week.map((day, dayIndex) => {
                  if (!day) {
                    return (
                      <span
                        key={`${weekIndex}-${dayIndex}`}
                        className="contribCell contribCell--pad"
                        aria-hidden
                      />
                    );
                  }
                  const level = day.isFuture ? 0 : wordLevel(day.words, maxWords);
                  return (
                    <span
                      key={day.date}
                      className={`contribCell${day.isFuture ? " contribCell--future" : ""}`}
                      data-level={level}
                      data-future={day.isFuture ? "true" : undefined}
                      title={
                        day.isFuture
                          ? `${day.date}: 未到`
                          : `${day.date}: ${day.words.toLocaleString()} 字`
                      }
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="contribLegend muted">
        <span>少</span>
        <span className="contribCell" data-level={0} aria-hidden />
        <span className="contribCell" data-level={1} aria-hidden />
        <span className="contribCell" data-level={2} aria-hidden />
        <span className="contribCell" data-level={3} aria-hidden />
        <span className="contribCell" data-level={4} aria-hidden />
        <span>多</span>
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return n.toLocaleString();
}
