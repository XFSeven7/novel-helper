export type ContributionDay = {
  date: string;
  words: number;
  /** 落在展示区间内（含延伸至未来的格子） */
  inRange: boolean;
  /** 晚于今天，尚无写作数据 */
  isFuture: boolean;
};

export type ContributionWeek = (ContributionDay | null)[];

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

export function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function buildWordsByDate(
  activity: { date: string; words: number }[]
): Map<string, number> {
  return new Map(activity.map((a) => [a.date, a.words]));
}

/** GitHub 式：列=周，行=周日(0)…周六(6)；当年含今日至 12/31 的未来空白格 */
export function buildContributionWeeks(
  year: number,
  wordsByDate: Map<string, number>,
  todayStr: string
): ContributionWeek[] {
  const yearStart = `${year}-01-01`;
  const rangeEnd = `${year}-12-31`;

  const jan1Dow = new Date(yearStart + "T12:00:00.000Z").getUTCDay();
  let cursor = addDays(yearStart, -jan1Dow);

  const rangeEndDow = new Date(rangeEnd + "T12:00:00.000Z").getUTCDay();
  const gridEnd = addDays(rangeEnd, 6 - rangeEndDow);

  const weeks: ContributionWeek[] = [];
  while (cursor <= gridEnd) {
    const week: ContributionWeek = [];
    for (let i = 0; i < 7; i++) {
      const inRange = cursor >= yearStart && cursor <= rangeEnd;
      const isFuture = cursor > todayStr;
      week.push(
        inRange
          ? {
              date: cursor,
              words: isFuture ? 0 : (wordsByDate.get(cursor) ?? 0),
              inRange: true,
              isFuture
            }
          : null
      );
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** 月份标签：标在包含该月任意一天的周列上 */
export function buildMonthLabels(
  weeks: ContributionWeek[],
  year: number
): { weekIndex: number; label: string }[] {
  const labels: { weekIndex: number; label: string }[] = [];
  for (let month = 1; month <= 12; month++) {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    const weekIndex = weeks.findIndex((week) =>
      week.some((d) => d?.inRange && d.date.startsWith(prefix))
    );
    if (weekIndex >= 0) {
      labels.push({ weekIndex, label: MONTH_LABELS[month - 1]! });
    }
  }
  return labels;
}

export function countYearStats(weeks: ContributionWeek[]) {
  let activeDays = 0;
  let totalWords = 0;
  for (const week of weeks) {
    for (const day of week) {
      if (!day?.inRange || day.isFuture) continue;
      if (day.words > 0) activeDays++;
      totalWords += day.words;
    }
  }
  return { activeDays, totalWords };
}

/** 按当年最大值分 4 档（类似 GitHub） */
export function wordLevel(words: number, maxWords: number): 0 | 1 | 2 | 3 | 4 {
  if (words <= 0) return 0;
  if (maxWords <= 0) return 1;
  const ratio = words / maxWords;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function maxWordsInYear(weeks: ContributionWeek[]): number {
  let max = 0;
  for (const week of weeks) {
    for (const day of week) {
      if (day?.inRange && !day.isFuture && day.words > max) max = day.words;
    }
  }
  return max;
}
