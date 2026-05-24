/** relations[].types 受控枚举 → 中文展示 */
export const RELATION_TYPE_LABELS: Record<string, string> = {
  "narrative.Ally": "盟友",
  "narrative.Mentor": "导师",
  "narrative.Antagonist": "反派",
  "narrative.Rival": "竞争对手",
  "narrative.Support": "后勤/NPC",
  "narrative.Harbinger": "先驱",
  "tie.KindredSpirit": "至交",
  "tie.LoveInterest": "恋人",
  "tie.Kinship": "血亲",
  "tie.ArchNemesis": "宿敌",
  "tie.MutualDisdain": "嫌恶",
  "tie.Admiration": "崇拜",
  "tie.Indebtedness": "亏欠",
  "hidden.Judas": "背叛者",
  "hidden.Guardian": "保护者",
  "hidden.Foil": "镜像/对照组",
  "karma.Contractual": "契约关系",
  "karma.Symbiotic": "共生关系",
  "karma.InformationGap": "信息差"
};

export const RELATION_TYPE_OPTIONS = Object.entries(RELATION_TYPE_LABELS).map(([value, label]) => ({
  value,
  label
}));

export function relationTypeLabel(type: string): string {
  const t = String(type || "").trim();
  return RELATION_TYPE_LABELS[t] || t;
}

export function relationTypesToLabels(types: string[]): string[] {
  return types.map(relationTypeLabel).filter(Boolean);
}
