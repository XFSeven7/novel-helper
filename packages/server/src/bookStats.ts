import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureWritingLogBaseline,
  listChapters,
  readWritingLog,
  writeWritingLog,
  type WritingLog
} from "./fsStore.js";

export type BookStats = {
  totalChapters: number;
  totalWords: number;
  avgChapterLength: number;
  maxChapterWordCount: number;
  maxChapterTitle: string;
  minChapterWordCount: number;
  minChapterTitle: string;
  streak: number;
  daysSinceLastWrite: number;
  lastWriteDate: string;
  dailyBreakdown: { date: string; words: number; chapters: number }[];
  chapterWordCounts: { index: number; title: string; wordCount: number; filename: string }[];
  cumulativeWords: { index: number; title: string; words: number }[];
  activeDaysLast7: number;
  activeDaysLast30: number;
  avgNetWordsPerActiveDay30: number;
  weeklyActivity: { weekStart: string; activeDays: number; netWords: number }[];
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ta = new Date(a + "T12:00:00.000Z").getTime();
  const tb = new Date(b + "T12:00:00.000Z").getTime();
  return Math.round((tb - ta) / 86400000);
}

function isActiveDay(log: WritingLog, date: string): boolean {
  return (log.daily[date]?.netWords ?? 0) > 0;
}

function lastActiveDate(log: WritingLog): string {
  const dates = Object.keys(log.daily)
    .filter((d) => isActiveDay(log, d))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1]! : "";
}

function computeStreak(log: WritingLog, today: string): number {
  const last = lastActiveDate(log);
  if (!last) return 0;

  let start = today;
  if (!isActiveDay(log, today)) {
    const yesterday = addDays(today, -1);
    if (last === yesterday || isActiveDay(log, yesterday)) {
      start = yesterday;
    } else if (last !== today) {
      return 0;
    }
  }

  let streak = 0;
  let cursor = start;
  while (isActiveDay(log, cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function countActiveDaysInRange(log: WritingLog, from: string, to: string): number {
  let n = 0;
  let cursor = from;
  while (cursor <= to) {
    if (isActiveDay(log, cursor)) n++;
    cursor = addDays(cursor, 1);
  }
  return n;
}

function weekStartMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00.000Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyActivity(log: WritingLog, today: string, weeks: number) {
  const result: { weekStart: string; activeDays: number; netWords: number }[] = [];
  const currentWeekStart = weekStartMonday(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(currentWeekStart, -7 * i);
    const we = addDays(ws, 6);
    let netWords = 0;
    let activeDays = 0;
    let cursor = ws;
    while (cursor <= we) {
      const entry = log.daily[cursor];
      if (entry && entry.netWords > 0) {
        activeDays++;
        netWords += entry.netWords;
      }
      cursor = addDays(cursor, 1);
    }
    result.push({ weekStart: ws, activeDays, netWords });
  }
  return result;
}

function buildDailyBreakdown(log: WritingLog, maxDays: number) {
  const today = todayStr();
  const from = addDays(today, -(maxDays - 1));
  const sorted = Object.entries(log.daily)
    .filter(([date]) => date >= from && date <= today)
    .sort(([a], [b]) => a.localeCompare(b));

  const byDate = new Map(sorted.map(([date, d]) => [date, d]));
  const out: { date: string; words: number; chapters: number }[] = [];
  let cursor = from;
  while (cursor <= today) {
    const entry = byDate.get(cursor);
    out.push({
      date: cursor,
      words: entry?.netWords ?? 0,
      chapters: entry?.saveCount ?? 0
    });
    cursor = addDays(cursor, 1);
  }
  return out;
}

async function backfillDailyFromMtime(dataDir: string, slug: string, log: WritingLog): Promise<WritingLog> {
  const hasDaily = Object.keys(log.daily).some((d) => (log.daily[d]?.netWords ?? 0) > 0);
  if (hasDaily) return log;

  const chapters = await listChapters(dataDir, slug);
  const chaptersDir = path.join(dataDir, slug, "chapters");
  const daily = { ...log.daily };

  for (const ch of chapters) {
    try {
      const stat = await fs.stat(path.join(chaptersDir, ch.filename));
      const fileDate = new Date(stat.mtime).toISOString().slice(0, 10);
      const prev = daily[fileDate] ?? { netWords: 0, saveCount: 0 };
      daily[fileDate] = {
        netWords: prev.netWords + ch.wordCount,
        saveCount: prev.saveCount + 1
      };
    } catch {
      // ignore
    }
  }

  const next = { ...log, daily, initialized: log.initialized ?? true };
  await writeWritingLog(dataDir, slug, next);
  return next;
}

export async function computeBookStats(
  dataDir: string,
  slug: string,
  options?: { backfillMtime?: boolean }
): Promise<BookStats> {
  await ensureWritingLogBaseline(dataDir, slug);
  let log = await readWritingLog(dataDir, slug);

  if (options?.backfillMtime) {
    log = await backfillDailyFromMtime(dataDir, slug, log);
  }

  const chapters = await listChapters(dataDir, slug);
  const today = todayStr();

  let totalWords = 0;
  for (const ch of chapters) {
    totalWords += ch.wordCount;
  }

  const chapterWordCounts = chapters.map((ch, i) => ({
    index: i + 1,
    title: ch.title,
    wordCount: ch.wordCount,
    filename: ch.filename
  }));

  let cum = 0;
  const cumulativeWords = chapterWordCounts.map((ch) => {
    cum += ch.wordCount;
    return { index: ch.index, title: ch.title, words: cum };
  });

  const maxChapter = chapterWordCounts.reduce(
    (a, b) => (a.wordCount >= b.wordCount ? a : b),
    { wordCount: 0, title: "", index: 0, filename: "" }
  );
  const minChapter = chapterWordCounts.reduce(
    (a, b) => (a.wordCount <= b.wordCount ? a : b),
    { wordCount: maxChapter.wordCount || 0, title: maxChapter.title, index: 0, filename: "" }
  );

  const last = lastActiveDate(log);
  let daysSinceLastWrite = 0;
  if (last) {
    daysSinceLastWrite = daysBetween(last, today);
  } else if (chapters.length > 0) {
    daysSinceLastWrite = 999;
  }

  const streak = computeStreak(log, today);
  const dailyBreakdown = buildDailyBreakdown(log, 90);

  const from7 = addDays(today, -6);
  const from30 = addDays(today, -29);
  const activeDaysLast7 = countActiveDaysInRange(log, from7, today);
  const activeDaysLast30 = countActiveDaysInRange(log, from30, today);

  let sum30 = 0;
  let cursor = from30;
  while (cursor <= today) {
    sum30 += log.daily[cursor]?.netWords ?? 0;
    cursor = addDays(cursor, 1);
  }
  const avgNetWordsPerActiveDay30 =
    activeDaysLast30 > 0 ? Math.round(sum30 / activeDaysLast30) : 0;

  return {
    totalChapters: chapters.length,
    totalWords,
    avgChapterLength: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
    maxChapterWordCount: maxChapter.wordCount,
    maxChapterTitle: maxChapter.title,
    minChapterWordCount: minChapter.wordCount,
    minChapterTitle: minChapter.title,
    streak,
    daysSinceLastWrite,
    lastWriteDate: last,
    dailyBreakdown,
    chapterWordCounts,
    cumulativeWords,
    activeDaysLast7,
    activeDaysLast30,
    avgNetWordsPerActiveDay30,
    weeklyActivity: buildWeeklyActivity(log, today, 4)
  };
}
