import type { EmojiStyle, PersonaTier, ReaderPersona } from "./types.js";

const ARCHETYPES = [
  "老书虫",
  "追更党",
  "毒舌评客",
  "甜文爱好者",
  "硬核设定党",
  "路人甲",
  "夜猫读者",
  "考据党",
  "乐子人",
  "沉默大多数"
] as const;

const NICK_PREFIX = [
  "熬夜看文的",
  "追更三年的",
  "刚入坑的",
  "书荒求粮的",
  "评论区常驻",
  "默默囤文的",
  "一口气看完的",
  "等更等到秃的",
  "二刷细品的",
  "安利狂魔"
];

const NICK_SUFFIX = [
  "阿梨",
  "小林",
  "老周",
  "桃子",
  "墨白",
  "南风",
  "北巷",
  "青禾",
  "子衿",
  "星河",
  "七月",
  "半夏",
  "长安",
  "听雨",
  "拾光",
  "清欢",
  "无名",
  "过客",
  "咸鱼",
  "猫奴"
];

const LIKE_TEMPLATES = [
  "👍 这章节奏舒服",
  "好看，继续更",
  "上头🔥",
  "稳",
  "可以可以"
];

const SHORT_TEMPLATES = [
  "这章{hook}有点意思",
  "主角这波操作我服了",
  "结尾悬念拉满",
  "节奏略拖但还能追",
  "期待下章填坑"
];

const DEEP_TEMPLATES = [
  "细品了一下，{hook}这条线如果后面能圆回来就神了。人物动机目前站得住，但配角戏份可以再匀一点。",
  "本章情绪起伏不错，就是中段信息密度偏高，第一遍读有点累。总体还是愿意追下去的。"
];

function tierForIndex(i: number): PersonaTier {
  if (i < 1) return "deep";
  if (i < 10) return "normal";
  return "lurker";
}

function emojiForTierFixed(tier: PersonaTier, index: number): EmojiStyle {
  if (tier === "lurker") return "none";
  if (tier === "deep") return "light";
  return index % 3 === 0 ? "heavy" : "light";
}

export function buildBuiltinPersonas(): ReaderPersona[] {
  const out: ReaderPersona[] = [];
  for (let n = 0; n < 100; n++) {
    const tier = tierForIndex(n);
    const prefix = NICK_PREFIX[n % NICK_PREFIX.length]!;
    const suffix = NICK_SUFFIX[n % NICK_SUFFIX.length]!;
    const archetype = ARCHETYPES[n % ARCHETYPES.length]!;
    out.push({
      id: `builtin-${String(n + 1).padStart(3, "0")}`,
      nickname: `${prefix}${suffix}`,
      archetype,
      tier,
      traits: [archetype, tier === "deep" ? "长评党" : tier === "normal" ? "爱短评" : "潜水"],
      emojiStyle: emojiForTierFixed(tier, n),
      templateSlots: {
        like: [...LIKE_TEMPLATES],
        short: [...SHORT_TEMPLATES],
        deep: tier === "deep" || tier === "normal" ? [...DEEP_TEMPLATES] : []
      },
      source: "builtin"
    });
  }
  return out;
}

let cachedBuiltin: ReaderPersona[] | null = null;

export function getBuiltinPersonas(): ReaderPersona[] {
  if (!cachedBuiltin) cachedBuiltin = buildBuiltinPersonas();
  return cachedBuiltin;
}
