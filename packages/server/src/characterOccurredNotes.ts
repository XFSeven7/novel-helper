/** 「发生过的事情」相似度去重（审计落盘 / 角色合并） */

const DEFAULT_BIGRAM_JACCARD_THRESHOLD = 0.62;
/** 中文近义改写：LCS / min(len) 达到该值视为同一事件 */
const DEFAULT_LCS_RATIO_THRESHOLD = 0.42;
const MIN_SUBSTRING_LEN = 8;

/** 归一化：去空白、常见标点，便于比较 */
export function normalizeOccurredNote(text: string): string {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，。！？、；：「」『』（）【】《》—…·,.!?;:'"()[\]{}]/g, "");
}

function charBigrams(s: string): Set<string> {
  const set = new Set<string>();
  if (s.length <= 1) {
    if (s) set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function jaccardBigram(a: string, b: string): number {
  const na = normalizeOccurredNote(a);
  const nb = normalizeOccurredNote(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = charBigrams(na);
  const B = charBigrams(nb);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

/** 最长公共子序列长度 / 较短文本长度，适合同事件多种表述 */
function lcsRatio(a: string, b: string): number {
  const x = normalizeOccurredNote(a);
  const y = normalizeOccurredNote(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const m = x.length;
  const n = y.length;
  if (m === 1 || n === 1) return x[0] === y[0] ? 1 : 0;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const prev = dp[(i - 1) * (n + 1) + (j - 1)];
      const up = dp[(i - 1) * (n + 1) + j];
      const left = dp[i * (n + 1) + (j - 1)];
      dp[i * (n + 1) + j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(up, left);
    }
  }
  const lcs = dp[m * (n + 1) + n];
  return lcs / Math.min(m, n);
}

function isSubstringDuplicate(a: string, b: string): boolean {
  const na = normalizeOccurredNote(a);
  const nb = normalizeOccurredNote(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  if (short.length < MIN_SUBSTRING_LEN) return false;
  return long.includes(short);
}

export type OccurredNoteSimilarityOptions = {
  bigramThreshold?: number;
  lcsThreshold?: number;
};

/** 两条是否视为同一「发生过的事」 */
export function isSimilarOccurredNote(
  a: string,
  b: string,
  opts: OccurredNoteSimilarityOptions = {}
): boolean {
  const bigramThreshold = opts.bigramThreshold ?? DEFAULT_BIGRAM_JACCARD_THRESHOLD;
  const lcsThreshold = opts.lcsThreshold ?? DEFAULT_LCS_RATIO_THRESHOLD;
  const ta = String(a || "").trim();
  const tb = String(b || "").trim();
  if (!ta || !tb) return false;
  if (normalizeOccurredNote(ta) === normalizeOccurredNote(tb)) return true;
  if (isSubstringDuplicate(ta, tb)) return true;
  if (jaccardBigram(ta, tb) >= bigramThreshold) return true;
  return lcsRatio(ta, tb) >= lcsThreshold;
}

/** 保留信息更全（较长）的一条 */
function pickRicher(a: string, b: string): string {
  const ta = String(a || "").trim();
  const tb = String(b || "").trim();
  if (ta.length >= tb.length) return ta;
  return tb;
}

function clusterOccurredNotes(notes: string[], opts: OccurredNoteSimilarityOptions): string[][] {
  const n = notes.length;
  if (!n) return [];
  const parent = notes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    let x = i;
    while (parent[x] !== x) {
      const next = parent[x]!;
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isSimilarOccurredNote(notes[i]!, notes[j]!, opts)) union(i, j);
    }
  }
  const buckets = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = buckets.get(root) || [];
    list.push(notes[i]!);
    buckets.set(root, list);
  }
  return [...buckets.values()];
}

/** 列表内去重（传递闭包聚类），每簇保留最长一条 */
export function dedupeSimilarOccurredNotes(
  items: string[],
  opts: OccurredNoteSimilarityOptions = {}
): string[] {
  const notes = items.map((s) => String(s || "").trim()).filter(Boolean);
  if (!notes.length) return [];
  return clusterOccurredNotes(notes, opts).map((group) =>
    group.reduce((best, cur) => pickRicher(best, cur))
  );
}

/**
 * 合并历史与新增：incoming 先章内去重，再与 prev 合并；相似则保留较长，不重复追加。
 * 新条目排在列表前部（与审计增量展示习惯一致）。
 */
export function mergeOccurredNotes(
  prev: string[] | undefined,
  incoming: string[],
  opts: OccurredNoteSimilarityOptions = {}
): string[] {
  const cleaned = dedupeSimilarOccurredNotes(incoming, opts);
  if (!cleaned.length) {
    return [...(Array.isArray(prev) ? prev : []).map((x) => String(x).trim()).filter(Boolean)];
  }

  const result: string[] = [];
  const pushUnique = (note: string) => {
    const n = String(note || "").trim();
    if (!n) return;
    const i = result.findIndex((existing) => isSimilarOccurredNote(existing, n, opts));
    if (i < 0) result.push(n);
    else result[i] = pickRicher(result[i]!, n);
  };

  for (const note of cleaned) pushUnique(note);

  for (const raw of Array.isArray(prev) ? prev : []) {
    const note = String(raw || "").trim();
    if (!note) continue;
    const i = result.findIndex((existing) => isSimilarOccurredNote(existing, note, opts));
    if (i < 0) result.push(note);
    else result[i] = pickRicher(result[i]!, note);
  }

  return result;
}
