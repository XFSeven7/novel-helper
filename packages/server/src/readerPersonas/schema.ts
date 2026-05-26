import crypto from "node:crypto";
import type { ReaderPersona } from "./types.js";

export function seededRandom(seed: string): () => number {
  let h = crypto.createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = crypto.createHash("sha256").update(h).update(String(i)).digest();
      i = 0;
    }
    const n = h.readUInt32BE(i);
    i += 4;
    return n / 0xffffffff;
  };
}

export function pickMany<T>(arr: T[], count: number, rand: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < count) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export function sampleReaders(
  pool: ReaderPersona[],
  chapterSeed: string,
  count: number
): ReaderPersona[] {
  const rand = seededRandom(`${chapterSeed}:readers`);
  return pickMany(pool, Math.min(count, pool.length), rand);
}

export type SpeakerSlot = {
  persona: ReaderPersona;
  /** 期望评论类型，供 AI 生成时参考 */
  intendedKind: "deep" | "short" | "like";
};

export type ChapterReaderPick = {
  /** 本章「已读」名单（含发言 + 潜水） */
  readers: ReaderPersona[];
  /** 按本地概率抽中、将交给 AI 写文案的读者 */
  speakers: SpeakerSlot[];
  /** 只显示已读、不发评论的读者 */
  lurkers: ReaderPersona[];
};

export function randomCommentsCapForChapter(chapterSeed: string, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const rand = seededRandom(`${chapterSeed}:comment-cap`);
  const span = hi - lo + 1;
  return lo + Math.floor(rand() * span);
}

/** deep 人格发言概率（长评优先，全章最多 1 条长评） */
const SPEAK_PROB_DEEP = 0.3;
/** normal 人格发言概率（短评或点赞） */
const SPEAK_PROB_NORMAL = 0.5;

/**
 * 1. 从人格池抽「谁读了本章」
 * 2. 对每个已读读者用本地概率决定：deep 30% / normal 50% / 其余潜水
 * tier 仍尊重人格属性（lurker 永不发言）
 */
export function pickChapterReadersByProbability(
  pool: ReaderPersona[],
  chapterSeed: string,
  commentsCap: number
): ChapterReaderPick {
  const randRead = seededRandom(`${chapterSeed}:readers`);
  /** 已读人数 ≈ 人格池的 80%（种子随机，76%–84% 浮动） */
  const readRatio = 0.76 + randRead() * 0.08;
  const readCount = Math.max(1, Math.min(pool.length, Math.floor(pool.length * readRatio)));
  const readers = pickMany(pool, readCount, seededRandom(`${chapterSeed}:readers-pick`));

  const speakers: SpeakerSlot[] = [];
  const lurkers: ReaderPersona[] = [];
  let deepUsed = 0;

  for (const p of readers) {
    if (p.tier === "lurker") {
      lurkers.push(p);
      continue;
    }

    const r = seededRandom(`${chapterSeed}:role:${p.id}`)();

    if (speakers.length < commentsCap && p.tier === "deep" && r < SPEAK_PROB_DEEP) {
      if (deepUsed < 1) {
        speakers.push({ persona: p, intendedKind: "deep" });
        deepUsed++;
      } else {
        const kindRoll = seededRandom(`${chapterSeed}:kind:${p.id}`);
        speakers.push({
          persona: p,
          intendedKind: kindRoll() > 0.45 ? "like" : "short"
        });
      }
      continue;
    }

    if (speakers.length < commentsCap && p.tier === "normal" && r < SPEAK_PROB_NORMAL) {
      const kindRoll = seededRandom(`${chapterSeed}:kind:${p.id}`);
      speakers.push({
        persona: p,
        intendedKind: kindRoll() > 0.45 ? "like" : "short"
      });
      continue;
    }

    lurkers.push(p);
  }

  return finalizeChapterSpeakers({ readers, speakers, lurkers }, pool, chapterSeed, commentsCap);
}

function slotKindForPersona(
  persona: ReaderPersona,
  chapterSeed: string,
  deepUsed: boolean
): SpeakerSlot["intendedKind"] {
  if (persona.tier === "deep" && !deepUsed) return "deep";
  const kindRoll = seededRandom(`${chapterSeed}:fill-kind:${persona.id}`);
  return kindRoll() > 0.45 ? "like" : "short";
}

/** 凑够本章目标条数；不足则从潜水读者/全池补位 */
function finalizeChapterSpeakers(
  pick: ChapterReaderPick,
  pool: ReaderPersona[],
  chapterSeed: string,
  commentsCap: number
): ChapterReaderPick {
  let { readers, speakers, lurkers } = pick;
  let deepUsed = speakers.some((s) => s.intendedKind === "deep");

  const speakerIds = () => new Set(speakers.map((s) => s.persona.id));

  const addSpeaker = (persona: ReaderPersona) => {
    const ids = speakerIds();
    if (ids.has(persona.id)) return;
    const kind = slotKindForPersona(persona, chapterSeed, deepUsed);
    if (kind === "deep") deepUsed = true;
    speakers = [...speakers, { persona, intendedKind: kind }];
    lurkers = lurkers.filter((p) => p.id !== persona.id);
    if (!readers.some((p) => p.id === persona.id)) {
      readers = [...readers, persona];
    }
  };

  if (!speakers.length) {
    let eligible = readers.filter((p) => p.tier === "normal" || p.tier === "deep");
    if (!eligible.length) eligible = pool.filter((p) => p.tier === "normal" || p.tier === "deep");
    if (eligible.length) {
      const rand = seededRandom(`${chapterSeed}:fallback-speaker`);
      addSpeaker(eligible[Math.floor(rand() * eligible.length)]!);
    }
  }

  const fillRand = seededRandom(`${chapterSeed}:fill-speakers`);
  while (speakers.length < commentsCap) {
    const ids = speakerIds();
    let candidates = lurkers.filter((p) => (p.tier === "normal" || p.tier === "deep") && !ids.has(p.id));
    if (!candidates.length) {
      candidates = pool.filter((p) => (p.tier === "normal" || p.tier === "deep") && !ids.has(p.id));
    }
    if (!candidates.length) break;
    const idx = Math.floor(fillRand() * candidates.length);
    addSpeaker(candidates[idx]!);
  }

  if (speakers.length > commentsCap) {
    speakers = speakers.slice(0, commentsCap);
  }

  return { readers, speakers, lurkers };
}
