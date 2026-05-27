import type { EntropyCard, EntropyCardTag } from "./types.js";

const EFFECT_BY_TAG: Record<EntropyCardTag, string> = {
  weather: "改变场景可见度、行动条件与气氛张力",
  sense: "打断信息流或放大不安感，迫使角色重新感知环境",
  sidequest: "插入无关但真实的插曲，扰动当前节奏",
  limit: "用生理阈值逼迫角色做出更极端的选择"
};

function card(tag: EntropyCardTag, index: number, title: string, microPrompt: string): EntropyCard {
  const id = `${tag}-${String(index + 1).padStart(2, "0")}`;
  return {
    id,
    tag,
    title,
    effect: EFFECT_BY_TAG[tag],
    microPrompt
  };
}

const WEATHER_TITLES = [
  "暴雨",
  "大雾",
  "骤冷",
  "闷热",
  "湿滑",
  "风声异常",
  "沙尘",
  "雷鸣",
  "冰雹",
  "潮汐异动",
  "落叶遮路",
  "山体小滑坡"
];

const SENSE_TITLES = [
  "停电",
  "信号消失",
  "刺鼻血腥味",
  "远处警笛",
  "灯光闪烁",
  "耳鸣",
  "突然静默",
  "水管爆裂声",
  "温度骤升",
  "手表停走",
  "门缝冷风",
  "镜面反光刺眼"
];

const SIDEQUEST_TITLES = [
  "配角打翻东西",
  "配角说错话",
  "误闯",
  "门外敲门",
  "被跟踪",
  "小孩哭闹",
  "宠物冲出",
  "误发信息",
  "警卫盘查",
  "道具丢失",
  "车辆抛锚",
  "暗处录像"
];

const LIMIT_TITLES = [
  "旧伤复发",
  "低血糖",
  "眩晕",
  "强烈困意",
  "脱水",
  "手抖",
  "胃痉挛",
  "短暂失声",
  "恐慌发作",
  "闪回",
  "过敏",
  "极度饥饿"
];

function buildDeck(tag: EntropyCardTag, titles: string[]): EntropyCard[] {
  return titles.map((title, i) =>
    card(tag, i, title, `画面钩子：${title}突然介入当前场景，让角色不得不立刻反应。`)
  );
}

export const ENTROPY_CARDS: EntropyCard[] = [
  ...buildDeck("weather", WEATHER_TITLES),
  ...buildDeck("sense", SENSE_TITLES),
  ...buildDeck("sidequest", SIDEQUEST_TITLES),
  ...buildDeck("limit", LIMIT_TITLES)
];

export function shuffleDeck<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function lookupEntropyCard(id: string): EntropyCard | null {
  const t = String(id || "").trim();
  if (!t) return null;
  return ENTROPY_CARDS.find((c) => c.id === t) ?? null;
}
