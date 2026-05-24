const RELATION_ENUMS = {
  narrative: ["Ally", "Mentor", "Antagonist", "Rival", "Support", "Harbinger"],
  tie: ["KindredSpirit", "LoveInterest", "Kinship", "ArchNemesis", "MutualDisdain", "Admiration", "Indebtedness"],
  hidden: ["Judas", "Guardian", "Foil"],
  karma: ["Contractual", "Symbiotic", "InformationGap"]
} as const;

export const RELATION_ENUM_IDS = [
  ...RELATION_ENUMS.narrative.map((x) => `narrative.${x}`),
  ...RELATION_ENUMS.tie.map((x) => `tie.${x}`),
  ...RELATION_ENUMS.hidden.map((x) => `hidden.${x}`),
  ...RELATION_ENUMS.karma.map((x) => `karma.${x}`)
];

// --- utils ---
export function truncateForPrompt(s: string, max: number): string {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 8)) + "…（截断）";
}

// --- inspiration ---
export function buildInspirationPrompt(input: {
  kind: "character" | "place" | "org" | "item" | "event" | "lore" | "technique" | "other";
  count: number;
  opts: any;
  free: string;
  useMemory: boolean;
  memoryText: string;
  knownCharacterNames: string[];
  knownPlaceNames?: string[];
  /** 道具 / 功法：可选持有者精简信息 */
  itemOwnerInfo?: object | null;
}): string {
  const { kind, count, opts, free, useMemory, memoryText, knownCharacterNames, knownPlaceNames, itemOwnerInfo } = input;

  const characterDirectorPreamble = [
    "你是一位拥有‘全知视角’的叙事逻辑架构师与叙事导演。你负责在给定的世界观与剧情框架下，策划具备高逻辑粘性、强冲突张力的【角色灵感卡片】。",
    "",
    "通用叙事法则",
    "1. 补位逻辑：生成的角色必须作为‘剧情催化剂’或‘逻辑闭环点’。禁止生成背景板，每个角色必须携带能推动现有矛盾演变的信息、资源或动机。",
    "2. 业力链接：角色严禁是逻辑孤岛。他们必须通过利益、情感或契约与【已知角色】或【当前冲突点】产生直接关联。",
    "3. 阶级与生态位：角色设定必须严格对齐当前世界的社会阶层与力量体系，体现该环境下特有的生存压力或职业质感。",
    "4. 叙事守恒：角色的‘付出’与‘获得’、‘伤势’与‘地位’应符合因果律。描述细节需真实、具体，拒绝虚浮的形容词。",
    ""
  ];

  const schemaHintBase = [
    "请严格输出 JSON 数组（不要解释、不要 markdown、不要代码块）。",
    "每个元素字段：{ title: string, content: string, tags?: string[] }。"
  ];

  const memoryBlock = useMemory
    ? "【参考全书记忆】（用于一致性与避重复）\n" + memoryText
    : "【参考全书记忆】（未启用）";

  const commonBase = [
    ...(kind === "character" ? characterDirectorPreamble : ["你是网络小说写作助手。", ""]),
    ...schemaHintBase,
    "",
    memoryBlock,
    ""
  ];

  const taskMetaLines = [`【数量】生成 ${count} 条。`, free ? `【要求】${free}` : null].filter(Boolean) as string[];

  const characterLine = knownCharacterNames.length
    ? "【当前书籍已存在角色名（禁止重复创建/禁止同名）】\n" + knownCharacterNames.join("、")
    : "【当前书籍已存在角色名】（空）";

  const placeLine =
    Array.isArray(knownPlaceNames) && knownPlaceNames.length
      ? "【当前书籍已存在地点名（尽量引用以保持一致；避免凭空造新地名）】\n" + knownPlaceNames.join("、")
      : "【当前书籍已存在地点名】（空）";

  // 避免“生成地点却带角色名单 / 生成角色却带地点名单”造成干扰：
  // - character: 只带角色名
  // - place: 只带地点名
  // 其他类型：根据通用性同时提供（可改为按需再细分）
  const contextLines =
    kind === "character"
      ? ["", characterLine, ""]
      : kind === "place"
        ? ["", placeLine, ""]
        : ["", characterLine, placeLine, ""];

  const common = [...commonBase, ...contextLines];

  if (kind === "character") {
    return [
      ...common,
      "【任务】只生成【角色卡】，不要生成场景/道具/地点/组织条目。",
      ...taskMetaLines,
      "【角色卡硬性要求】",
      "- title 必须是角色名（2-4字为主，避免现代跳戏，避免生僻字）。",
      "- 禁止生成与“已存在角色名”同名的角色；如发生冲突，请改名后再输出。",
      "- content 必须包含以下小标题（用中文，允许为空但必须出现）：",
      "  - 性格",
      "  - 背景",
      "  - 动机（Want/Need）",
      "  - 能力与限制",
      "  - 关系钩子（必须明确关联至少1个已知角色/势力，并写出具体冲突点）",
      "  - 口癖与动作特征",
      "- tags：2-4个（生态位/阵营/职业/标签）。",
      "",
      "现在输出 JSON 数组："
    ].join("\n");
  }

  if (kind === "place") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection =
      free || "设计一个能承载当前矛盾冲突、且具备探索深度的场景。";
    const optsBlock =
      opts && typeof opts === "object" && Object.keys(opts).length
        ? ["【结构化可选项（来自用户 JSON）】", JSON.stringify(opts, null, 2), ""].join("\n")
        : "";

    return [
      "你是一位顶尖的叙事场景设计师。你负责在给定的世界观框架下，策划具备强功能性、高辨识度且能激发冲突的【场景/地点灵感卡片】。",
      "",
      "地点设计逻辑",
      "1. 容器原则：地点不仅是空间，更是‘矛盾的容器’。它必须为角色提供交互的可能性（如：藏身、交易、对峙）。",
      "2. 资源与限制：每个地点必须明确‘它能提供什么’（资源/庇护）以及‘它禁止什么’（危险/规则）。",
      "3. 叙事余波：地点应带有历史或事件的痕迹，体现世界观的宏观逻辑（如：战乱后的废墟、繁荣背后的阴影）。",
      "4. 空间层次：描述需具备空间感（由远及近、由表及里），拒绝平铺直叙的形容词堆砌。",
      "",
      "## Context Injection (上下文对齐)",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      placeLine,
      optsBlock ? optsBlock : "",
      "## Task Requirements (任务定义)",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "只生成【地点卡】；不要以角色或道具作为卡片主体。title 必须与【当前书籍已存在地点名】中的任一条不同（禁止同名）。",
      "",
      "## Output Format (JSON Array)",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "地点名称(需符合世界观风格)",',
      '  "tags": ["环境类型", "危险等级", "功能属性"],',
      '  "content": {',
      '    "atmosphere": "核心氛围描述(通过光线、气味、温度等具体感官切入)",',
      '    "layout": "空间布局简述(关键坐标点或视野层级)",',
      '    "functions": "该地点能为角色提供的实际用途(如：疗伤、情报、隐匿)",',
      '    "hazards": "该地点的潜在威胁、禁忌或环境限制(剧情压制力)",',
      '    "hidden_hooks": "此处隐藏的秘密、伏笔或可能关联的业力点(与已知剧情挂钩)",',
      '    "sensory_fingerprints": {',
      '      "sound": "独特的背景声响",',
      '      "visual": "具有视觉冲击力的标志性景物",',
      '      "smell": "空气中弥漫的特征气味"',
      "    },",
      '    "relationship_hooks": [',
      '      { "target": "已知势力/角色", "nature": "关联性质(如：领地、禁区、接头点)", "description": "具体的逻辑联系" }',
      "    ]",
      "  }",
      "}",
      "",
      "若缺少已知关联信息，relationship_hooks 仍须输出数组（可为空数组 []），不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "org") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无多章压缩摘要。）";
    const coreDirection = free || "设计一个能介入当前矛盾、对已知角色产生阶级压制的势力。";
    const optsBlock =
      opts && typeof opts === "object" && Object.keys(opts).length
        ? ["【结构化可选项（来自用户 JSON）】", JSON.stringify(opts, null, 2), ""].join("\n")
        : "";

    return [
      "## Role",
      "你是一位精通权谋逻辑与社会构建的叙事导演。你负责策划具备强生存逻辑、内部冲突张力且对个体角色产生压制力的【组织/势力灵感卡片】。",
      "",
      "## Organization Design Logic (组织设计逻辑)",
      "1. 生态位原则：组织必须在世界观中占有一个明确的位置（如：资源垄断者、暴力执行者、信息交易站）。它存在的理由必须合乎逻辑。",
      "2. 门面与真相：组织通常有对外宣称的‘信条/教义’，以及对内运行的‘潜规则/真实目的’。这种反差是产生冲突的源泉。",
      "3. 权力层级：明确权力如何流动。是绝对集权、长老合议，还是松散的利益联盟？层级之间的晋升代价是什么？",
      "4. 组织张力：一个活的组织内部必然存在派系（Factions）。生成时应包含内部的不稳定因素。",
      "",
      "## Context Injection (上下文对齐)",
      "【全书剧情/世界观记忆】：",
      memorySnapshot,
      "",
      optsBlock ? optsBlock : "",
      "## Task Requirements (任务定义)",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "只生成【组织/势力卡】；不要以单个角色或道具作为卡片主体。本任务不注入全书角色名列表与地点名列表。",
      "",
      "## Output Format (JSON Array)",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "组织/势力名称",',
      '  "tags": ["规模等级", "性质分类", "影响力范围"],',
      '  "content": {',
      '    "doctrine": "对外宣称的宗旨、门面或核心价值观",',
      '    "hidden_agenda": "对内运行的潜规则、真实图谋或不可告人的秘密",',
      '    "hierarchy": "权力结构简述(核心领袖、中间阶层、底层外围)",',
      '    "power_base": "核心资源或优势(如：垄断了某种药物、掌握了某段航线、拥有极强的武力)",',
      '    "internal_factions": "组织内部的主要派系及其矛盾焦点",',
      '    "entry_exit_cost": "进入该组织或脱离该组织需要付出的代价(逻辑约束)",',
      '    "relationship_hooks": [',
      '      { "target": "已知角色/地点", "nature": "关联性质(如：控制、渗透、敌对)", "description": "具体的利益纠葛或业力锁定" }',
      "    ]",
      "  }",
      "}",
      "",
      "relationship_hooks 必须输出数组（可为空数组 []）；不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "event") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection = free || "设计一个能打破僵局、迫使关键角色做出抉择的转折事件。";
    return [
      "## Role",
      "你是一位剧情冲突设计师。你负责基于当前剧情的‘业力状态’，生成能打破现有僵局、强制角色做出抉择的【突发/转折事件】。",
      "",
      "## Event Logic",
      "1. 连锁反应：事件必须源于之前的因果（如：监视、突破、旧怨），并引发新的矛盾。",
      "2. 迫选困境：事件应制造 A/B 择一的局面，每种选择都伴随明确的叙事代价。",
      "3. 状态刷新：事件结束后，必须改变至少一个已知角色的‘业力账本’（Karma Ledger）状态。",
      "",
      "## Context Injection (上下文对齐)",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      "## Task Requirements (任务定义)",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "## Output Format (JSON Array)",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "事件名称",',
      '  "tags": ["爆发点/转折点/日常扰动", "影响范围"],',
      '  "content": {',
      '    "trigger": "事件触发的逻辑诱因(为何在此时发生)",',
      '    "description": "过程简述(发生了什么具体的冲突/变故)",',
      '    "impact": "对当前局势的即时冲击(谁受损/谁获利)",',
      '    "dilemma": "主角面临的二难抉择(选A会如何，选B又如何)",',
      '    "karma_delta": "对业力账本的修改建议(如：某伏笔激活、某关系转为敌对)",',
      '    "relationship_hooks": [ { "target": "关联角色", "change": "关系演变倾向" } ]',
      "  }",
      "}",
      "",
      "relationship_hooks 必须输出数组（可为空数组 []）；不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "lore") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection = free || "设计一条能深挖世界观、并与既有历史片段形成互补或颠覆的秘闻。";
    return [
      "## Role",
      "你是一位世界观架构师。你负责生成带有‘碎片化叙事’质感的【秘闻/传说/丑闻】，用于深挖世界观背景并作为潜在的剧情钩子。",
      "",
      "## Lore Logic",
      "1. 认知阶梯：秘闻应分为‘大众认知的误区’与‘极少数人掌握的真相’。",
      "2. 逻辑埋线：秘闻必须与已知的历史片段产生互补或颠覆关系。",
      "3. 危险权重：知道这个秘密本身就代表了危险。需定义获取该信息的代价。",
      "",
      "## Context Injection (上下文对齐)",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      "## Task Requirements (任务定义)",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "## Output Format (JSON Array)",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "秘闻标题",',
      '  "tags": ["历史碎片/宗门阴谋/禁忌知识"],',
      '  "content": {',
      '    "surface_rumor": "坊间流传的、被扭曲的版本",',
      '    "hidden_truth": "隐藏在逻辑底层的真实情况(真相)",',
      '    "evidence_trace": "主角可能发现该秘密的物理线索(如：残页、刻痕)",',
      '    "danger_level": "知晓该秘密可能引发的杀意或诅咒",',
      '    "narrative_value": "该信息如何转化为主角的逻辑武器或反转点"',
      "  }",
      "}",
      "",
      "不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "technique") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection = free || "设计一门逻辑严密、高风险高回报的功法/术法/秘籍。";
    const ownershipBlock =
      itemOwnerInfo != null
        ? [
            "## Ownership Logic（有主 / 已绑定持有者）",
            "下列 JSON 为【指定持有者】自审核角色卡组装的精简信息（可能已截断）。功法的修炼门槛、反噬表现与叙事钩子应优先与该持有者的动机、关系网与当前状态相容；禁止写成与持有者完全无关的孤立设定。",
            JSON.stringify(itemOwnerInfo, null, 2),
            ""
          ].join("\n")
        : [
            "## Ownership Logic（无主 / 待定归属）",
            "用户未指定持有者：功法可为「可先收灵感、后分配角色」的待定归属。",
            "语义说明：这是「归属尚未在工具中绑定」，不是要求世界上绝对无人修炼；可在 content 中写清当前叙事上的传承/流落状态。",
            ""
          ].join("\n");

    return [
      "## Role",
      "你是一位力量体系架构师。你负责设计逻辑严密、具备‘高风险高回报’特征的【功法/术法/秘籍】。",
      "",
      "## Technique Logic",
      "1. 运行协议：功法不只是口诀，而是灵力/能量的‘逻辑算法’，需描述其运作路径。",
      "2. 代价平衡：越强大的功能，其限制（Cost）和反噬（Backlash）越具体、越致命。",
      "3. 叙事关联：功法往往带有创造者的性格烙印，甚至本身就是某种意图的延伸。",
      "",
      "## Context Injection (上下文对齐)",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      "（本任务不注入全书角色名列表与地点名列表；若用户指定持有者，其信息仅见下方 Ownership 段。）",
      "",
      ownershipBlock,
      "## Task Requirements (任务定义)",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "## Output Format (JSON Array)",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "功法名称",',
      '  "tags": ["力量层级", "属性分类", "邪异度"],',
      '  "content": {',
      '    "logic_flow": "灵力/能量的运行逻辑简述(像代码一样定义过程)",',
      '    "effect": "具体的能力展现(它能改变什么物理常数/逻辑)",',
      '    "backlash": "使用后的代价(短期虚弱/永久损耗/神智污染)",',
      '    "requirement": "极高的入门门槛(不仅是修为，还有特定的心境或媒介)",',
      '    "lore_origin": "该功法的由来及其在历史中留下的血腥痕迹"',
      "  }",
      "}",
      "",
      "不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  if (kind === "item") {
    const memorySnapshot =
      useMemory && String(memoryText || "").trim()
        ? String(memoryText).trim()
        : "（未启用全书记忆或无可用快照。）";
    const coreDirection = free || "设计一件能推动矛盾、并与当前叙事张力相匹配的关键道具或器物。";
    const optsBlock =
      opts && typeof opts === "object" && Object.keys(opts).length
        ? ["【结构化可选项（来自用户 JSON）】", JSON.stringify(opts, null, 2), ""].join("\n")
        : "";
    const ownershipBlock =
      itemOwnerInfo != null
        ? [
            "## Ownership Logic（有主 / 已绑定持有者）",
            "下列 JSON 为【指定持有者】自审核角色卡组装的精简信息（可能已截断）。道具的叙事钩子、使用习惯与代价应优先与该持有者的心理动机、关系网与当前状态相容；禁止把道具写成与持有者完全无关的孤立设定。",
            JSON.stringify(itemOwnerInfo, null, 2),
            ""
          ].join("\n")
        : [
            "## Ownership Logic（无主 / 待定归属）",
            "用户未指定持有者：道具应为「可先收灵感、后分配角色」的待定归属物。",
            "语义说明：这是「归属尚未在工具中绑定」，不是要求你假设世界上绝对无人认领；允许写成路边遗物、组织公物、无主赃物等。",
            "请让 ownership_status 明确写出当前叙事上的归属状态（如：无主/公物/来历不明/暂由某人保管但非心认之主 等）。",
            ""
          ].join("\n");

    return [
      "你是一位顶尖的叙事道具与器物设计师。你负责在给定的世界观与剧情框架下，策划具备功能张力、代价清晰、可反复在章节中回收的【道具灵感卡片】。",
      "",
      "道具设计逻辑",
      "1. 业力工具：道具必须改变信息、资源或权力平衡；禁止纯装饰品式设定。",
      "2. 触发与代价：写清如何生效、对谁有效、失败或滥用的反噬/限制。",
      "3. 叙事可回收：提供可在多章复用的钩子，而非一次性说明文。",
      "4. 归属一致：有主时与持有者动机咬合；无主时保留可被多角色争夺或认领的空间。",
      "",
      "## Context Injection（上下文对齐）",
      "【全书记忆快照】",
      memorySnapshot,
      "",
      "（本任务不注入全书角色名列表与地点名列表；若用户指定持有者，其信息仅见下方 Ownership 段。）",
      "",
      optsBlock ? optsBlock : "",
      ownershipBlock,
      "## Task Requirements（任务定义）",
      `- 生成数量：${count}`,
      `- 核心方向：${coreDirection}`,
      "",
      "只生成【道具卡】；不要以角色或地点作为卡片主体。title 为器物/道具名称，符合世界观即可。",
      "",
      "## Output Format（JSON Array）",
      "请严格输出 JSON 数组（顶层为数组，长度等于生成数量），禁止任何解释说明、禁止 markdown、禁止代码块。每个对象必须包含：",
      "{",
      '  "title": "道具名称(符合世界观)",',
      '  "tags": ["器物类型", "风险等级", "叙事功能"],',
      '  "content": {',
      '    "appearance": "外观与质感（具体可见可触，避免空泛形容词）",',
      '    "ownership_status": "归属与流转状态（与 Ownership Logic 一致）",',
      '    "functions": "核心效果与典型使用方式（含触发条件）",',
      '    "limitations": "限制、代价、反噬或失效条件（必填）",',
      '    "origin": "来历、传闻或获取路径（可与全书记忆挂钩）",',
      '    "narrative_hooks": "可跨章复用的剧情切入点（2-4 条，可用换行分隔）",',
      '    "relationship_hooks": [',
      '      { "target": "角色/势力/地点", "nature": "关联性质", "description": "具体叙事联系" }',
      "    ]",
      "  }",
      "}",
      "",
      "relationship_hooks 必须输出数组（可为空数组 []）；不得省略 content 内任一字段；字段内容尽量具体，避免空字符串占位。"
    ].join("\n");
  }

  return [
    ...common,
    "【任务】生成可直接落地写作的灵感卡片（非角色卡专用）。",
    ...taskMetaLines,
    "现在输出 JSON 数组："
  ].join("\n");
}

// --- writing pack ---
export function buildWritingPackPrompt(input: {
  chapterTarget: { filename: string; title?: string; chapterNo?: number | null };
  evidence: {
    recentChapters: any[];
    compressedRanges: any[];
    progressCandidates: any[];
    foreshadowCandidates: any[];
    risks: any[];
  };
}) {
  const schema = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: {
      windowChapters: 3,
      windowCompressedRanges: 2,
      pickedProgress: 12,
      pickedForeshadows: 12
    },
    chapterTarget: {
      filename: input.chapterTarget.filename,
      title: input.chapterTarget.title,
      chapterNo: input.chapterTarget.chapterNo ?? undefined
    },
    summary5: [
      "现状态势（事实，1句）",
      "现状态势（事实，1句）",
      "读者期待（爽点，参考，1句）",
      "读者期待（悬疑/推进，参考，1句）",
      "下一章可能方向（推测，1句，含两个并列方向，用分号隔开，句式含“可能/可以考虑”，末尾加“（参考）”）"
    ],
    lists: {
      progress: [{ id: "progressId", title: "进行中标题", basis: "依据：来自progress/近章/压缩块" }],
      foreshadows: [
        {
          id: "foreshadowId",
          title: "伏笔标题",
          basis: "依据：来自foreshadow/近章/压缩块",
          seedExcerpt: "可选：埋设章原文摘录（若证据中有）"
        }
      ],
      risks: [{ issue: "一致性风险描述", severity: "low|medium|high", basis: "依据：来自近章一致性/设定" }]
    },
    disclaimer: "写作包仅供参考：用于帮助你快速进入状态与回忆当前悬念/欠账；你完全可以不采纳，按自己的创作思路推进。"
  };

  return [
    "你是网文小说写作助手。现在要为“新建章节”生成一份【短写作包】（给作者参考，不要指挥作者）。",
    "",
    "硬性要求：",
    "- 严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "- summary5 必须恰好 5 句，每句尽量短。",
    "- 清单总计不超过 12 条：progress<=4、foreshadows<=5、risks<=3。",
    "- 口吻必须是“参考/可能/可关注”，禁止使用“必须/应该”。",
    "- 不要新增新角色/新设定/新关键道具；只能基于给定证据做概括与推测（推测必须标注为参考）。",
    "",
    "目标章节：",
    JSON.stringify(
      { filename: input.chapterTarget.filename, title: input.chapterTarget.title, chapterNo: input.chapterTarget.chapterNo ?? null },
      null,
      2
    ),
    "",
    "可用证据（只基于这些内容）：",
    JSON.stringify(input.evidence, null, 2),
    "",
    "输出 schema：",
    JSON.stringify(schema, null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
}

// --- audit ---
export function buildAuditPrompt(input: {
  chapterTitle: string;
  chapterFilename: string;
  content: string;
  knownCharacters: string[];
}) {
  return [
    "你是小说写作助手，负责“章节审计(Chapter Auditing)”工作流。",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块），字段需符合下面 schema。",
    "",
    "你需要对角色做“降噪提取（带保质期）”：",
    "- 基础设定（姓名/种族/出身等）：仅在首次出现或你非常确定时才填；不确定就留空。",
    "- 业力账本（状态/伤疤/仇恨/承诺/历史债）：每次审计都尽量更新为“最新状态”。",
    "- 瞬时情绪（愤怒/尴尬/激动等）：不要写入角色画像（可忽略）。",
    "- 对话风格/口癖：采样保留，只提炼 3-7 条关键特征即可。",
    "- 关系钩子：优先结构化到 relations（按对方角色名）；无法结构化时再写到 freeText。",
    "- 关系类型标签：你需要为 relations 选择受控枚举 types（多选，可空）。不确定就留空。",
    "- entities.events：同一情节/场面只输出一条，禁止为同一事件写多条措辞不同的 summary。",
    "",
    "关系类型受控枚举（relations[].types 只能从这里选，格式为 group.Item）：",
    RELATION_ENUM_IDS.join("、"),
    "",
    "已知角色名单（仅供参考，可能不全）：",
    input.knownCharacters.length ? input.knownCharacters.join("、") : "（空）",
    "",
    "章节：",
    `${input.chapterFilename} · ${input.chapterTitle}`,
    "",
    "正文：",
    input.content,
    "",
    "输出 JSON schema（可额外增加字段，但不要省略这些字段）：",
    JSON.stringify(
      {
        chapter: {
          filename: input.chapterFilename,
          id: input.chapterFilename.replace(/\\.md$/, ""),
          title: input.chapterTitle,
          wordCount: 0,
          auditedAt: new Date().toISOString()
        },
        gistL1: "300字内梗概",
        entities: {
          characters: [
            {
              name: "角色名",
              newOrExisting: "new/existing/unknown",
              tags: ["可枚举标签（可空）"],
              state: { location: "", injuries: "", items: [], moneyChange: 0 },
              socialTags: { profession: "", class: "", titles: ["头衔"], other: ["其他社会标签"] },
              historicalDebts: ["重大决策/承诺/债（列表）"],
              narrativeDrives: {
                want: "显性目标",
                need: "隐性成长",
                moralCompass: "道德罗盘/默认倾向",
                flaws: ["缺陷/盲点"],
                blindSpots: ["认知局限/误以为正确的事"]
              },
              fingerprints: {
                linguisticStyle: ["句式/语气特征（3-7条）"],
                catchphrases: ["口头禅（可空）"],
                mannerisms: ["标志性动作（可空）"],
                mask: [{ context: "在谁面前/什么场景", persona: "呈现出的面具/人设" }]
              },
              relationalHooks: {
                relations: [
                  {
                    targetName: "对方角色名",
                    types: RELATION_ENUM_IDS.slice(0, 2),
                    emotionalPolarity: "喜爱/厌恶/恐惧/亏欠/复杂等",
                    conflictIndex: "资源/信念/目标冲突点",
                    sharedSecrets: ["共享秘密（可空）"]
                  }
                ],
                freeText: "无法结构化的关系线索（可空）"
              },
              evidenceQuotes: ["原文证据短句"]
            }
          ],
          events: [{ type: "冲突/对话/战斗/交易/发现", summary: "", participants: [], stakes: "", resolved: false }]
        },
        consistencyChecks: [{ rule: "", issue: "", severity: "low/medium/high", suggestion: "" }],
        causalAnchors: { setups: [], payoffs: [] },
        impactAnalysis: [
          { item: "", impactScore: 0, why: "", futureImplications: ["对后续剧情的影响与建议"] }
        ],
        compression: { l2Pruning: null, mergeCandidates: null },
        ledgerUpdates: { openLoops: [], closedLoops: [] },
        uiInjection: { spotlightCharacters: [], spotlightTags: [] }
      },
      null,
      2
    )
  ].join("\n");
}
export function buildUnifiedAuditPrompt(input: {
  chapterTitle: string;
  chapterFilename: string;
  content: string;
  memoryContext: string;
  existingEntities: { characters: string[]; places: string[] };
  openForeshadows?: Array<{
    id: string;
    title: string;
    status?: string;
    lastChapter?: number;
    lastProgress?: string;
  }>;
}) {
  const chapterId = input.chapterFilename.replace(/\.md$/, "");
  const schema = {
    chapter: { filename: input.chapterFilename, id: chapterId, title: input.chapterTitle, wordCount: 0, auditedAt: new Date().toISOString() },
    gistL1: "本章极简逻辑链条总结（<=300字）",
    humanAuditReport:
      "最终给作者看的合并报告（markdown 纯文本，不要代码块）：包含评分雷达图文字版、历史因果对齐、角色指纹审计、导演行动清单（<=10条精准建议）",
    scores: {
      literary_style: { score: 0, comment: "" },
      narrative_tension: { score: 0, comment: "" },
      logic_consistency: { score: 0, comment: "" },
      character_vitality: { score: 0, comment: "" },
      hook_intensity: { score: 0, comment: "" }
    },
    entities: {
      characters: [
        {
          name: "角色名",
          newOrExisting: "new/existing/unknown",
          tags: ["可枚举标签（可空）"],
          state: { location: "", injuries: "", items: [], moneyChange: 0 },
          socialTags: { profession: "", class: "", titles: ["头衔"], other: ["其他社会标签"] },
          historicalDebts: ["重大决策/承诺/债（列表）"],
          narrativeDrives: {
            want: "显性目标",
            need: "隐性成长",
            moralCompass: "道德罗盘/默认倾向",
            flaws: ["缺陷/盲点"],
            blindSpots: ["认知局限/误以为正确的事"]
          },
          fingerprints: {
            linguisticStyle: ["句式/语气特征（3-7条）"],
            catchphrases: ["口头禅（可空）"],
            mannerisms: ["标志性动作（可空）"],
            mask: [{ context: "在谁面前/什么场景", persona: "呈现出的面具/人设" }]
          },
          relationalHooks: { relations: [], freeText: "" },
          evidenceQuotes: ["原文证据短句"]
        }
      ],
      events: [{ type: "冲突/对话/战斗/交易/发现", summary: "", participants: [], stakes: "", resolved: false }]
    },
    consistencyChecks: [{ rule: "", issue: "", severity: "low/medium/high", suggestion: "" }],
    causalAnchors: { setups: [], payoffs: [] },
    impactAnalysis: [{ item: "", impactScore: 0, why: "", futureImplications: ["对后续剧情的影响与建议"] }],
    compression: { l2Pruning: null, mergeCandidates: null },
    hookOps: [
      {
        hookId: "已有伏笔时必填，与下方清单 id 一致",
        title: "新埋时必填；已有伏笔勿改标题措辞",
        action: "plant | advance | mention | resolve",
        progress: "可选：advance/resolve/plant 时写一句本章进展"
      }
    ],
    ledgerUpdates: { openLoops: [], closedLoops: [] },
    uiInjection: { spotlightCharacters: [], spotlightTags: [] }
  };

  const memory = truncateForPrompt(
    String(input.memoryContext || "").trim() || "（全书记忆为空：暂无时间线摘要/事件）",
    12_000
  );
  const charNames = Array.from(new Set((input.existingEntities.characters || []).map((x) => String(x).trim()).filter(Boolean))).slice(
    0,
    300
  );
  const placeNames = Array.from(new Set((input.existingEntities.places || []).map((x) => String(x).trim()).filter(Boolean))).slice(0, 300);

  return [
    "## Role",
    "你是一位拥有“全知视角”的叙事导演与首席审计官。你负责结合【历史剧情背景】对【当前章节】进行深度逻辑审计、质量评分及元数据提取。",
    "",
    "**重要：你只输出本章事实提取（ChapterExtract），不要输出全书索引 merge 结果；人物/伏笔/时间线索引由服务端确定性结算。**",
    "",
    "## Input Context",
    "1) 【历史概要 (Memory Context)】：此处包含前序章节的压缩摘要/关键事件，用于维持因果一致性。",
    memory,
    "",
    "2) 【已知实体名单】：当前世界已存在的实体名单（仅供参考，可能不全）。",
    charNames.length ? `- 角色：${charNames.join("、")}` : "- 角色：（空）",
    placeNames.length ? `- 地点：${placeNames.join("、")}` : "- 地点：（空）",
    "",
    "3) 【当前未收伏笔清单】（写 hookOps 时必须复用 hookId，禁止同义改写标题）：",
    (input.openForeshadows || []).length
      ? JSON.stringify(input.openForeshadows, null, 2)
      : "（暂无未收伏笔）",
    "",
    "4) 【当前章节正文】：",
    truncateForPrompt(input.content, 35_000),
    "",
    "## Audit Logic & Continuity Rules (审计逻辑)",
    "1) 因果闭环：基于【历史概要】，检查本章是否响应之前伏笔（Payoff），或埋下逻辑自洽的新坑（Setup）。",
    "2) 业力追踪：识别本章产生的“业力债务”（谎言、底牌暴露、人情债、承诺、代价），并与历史债务对齐。",
    "3) 指纹校验：对比历史表现，审计角色的口癖、动作习惯及核心动机是否发生 OOC（人设崩坏）。",
    "4) 数值审计：严格校验金钱、消耗品、伤势状态在历史长线中的增减逻辑（若文本可推断）。",
    "5) entities.events：同一情节/场面只输出一条，禁止为同一事件写多条措辞不同的 summary。",
    "",
    "## Scoring Dimensions (1-10分制)",
    "- 文笔表现：感官描写具象度，叙事流顺滑度。",
    "- 叙事张力：冲突压力，地位/信息位的实质位移。",
    "- 逻辑严密：历史一致性，无穿帮，无逻辑硬伤。",
    "- 角色生命力：动机自洽性，非剧情工具人程度。",
    "- 期待感构建：末尾钩子（Hook）对后续的拉动力。",
    "",
    "## Output Format (Strict JSON Only)",
    "严格输出 JSON：不要解释、不要 markdown、不要代码块。字段需符合下面 schema（可以增加字段，但不要删除/重命名既有字段）。",
    JSON.stringify(schema, null, 2),
    "",
    "生成要求：",
    "- humanAuditReport 使用中文 markdown 纯文本（不要代码块），结构建议：综合评分与综述 / 历史因果对齐 / 角色指纹审计 / 导演行动清单。",
    "- scores 的 5 个 score 必须是 1-10 的整数；comment 简短但有信息量。",
    "- gistL1 必须是 300 字内的逻辑链条摘要（尽量可复用到时间线）。",
    "- consistencyChecks 只列真实问题，控制在 0-12 条。",
    "- hookOps（优先）：对每条伏笔输出 plant/advance/mention/resolve；已有伏笔必须带 hookId；标题稳定可复用。",
    "- plant=新悬念；advance=实质推进；mention=仅提及无新进展；resolve=本章回收。",
    "- ledgerUpdates.openLoops/closedLoops 可留空或作兼容补充；最终以 hookOps 为准。",
    "",
    "现在输出 JSON："
  ].join("\n");
}
export function buildThinkingPrompt(input: {
  chapterTitle: string;
  chapterFilename: string;
  content: string;
  knownCharacters: string[];
}) {
  return [
    "你是小说写作助手，正在进行「章节审计」的内部思考（给用户看的）。",
    "要求：",
    "- 用中文，条理清晰；用小标题 + 要点列表即可。",
    "- **禁止输出 JSON / 代码块 / markdown fence**。",
    "- 可以先发散思考，但最后要给出一个简短的行动清单（不超过 10 条）。",
    "",
    "你需要覆盖的思考维度（可按顺序展开）：",
    "1) 本章发生了什么（人物、地点、冲突、转折）",
    "2) 与已知角色名单的矛盾风险（点名指出疑点）",
    "3) 设定一致性风险（战力/境界/道具/金钱等若可从文本推断）",
    "4) 因果锚点：本章埋了什么坑、收了什么坑（setup/payoff）",
    "5) 对后续剧情的影响力排序（最重要 3 条）",
    "",
    "已知角色名单（仅供参考，可能不全）：",
    input.knownCharacters.length ? input.knownCharacters.join("、") : "（空）",
    "",
    "章节：",
    `${input.chapterFilename} · ${input.chapterTitle}`,
    "",
    "正文：",
    input.content
  ].join("\n");
}

// --- merge ---
export function buildCharacterCardMergePrompt(input: {
  primaryTitle: string;
  primaryContent: string;
  secondary: Array<{ title: string; content: string }>;
}) {
  const secondaryBlock = input.secondary
    .map((x, i) => [`【次卡 ${i + 1}】标题：${x.title}`, "内容：", x.content].join("\n"))
    .join("\n\n");
  return [
    "你是小说写作助手。现在要把“同一个角色”的多张角色卡，合并成一张最终角色卡（Markdown）。",
    "",
    "输出要求（必须严格遵守）：",
    "- 只输出 Markdown 纯文本：不要代码块，不要 ``` fence，不要多余解释。",
    "- 必须包含极简 YAML frontmatter，且只允许两个字段：role、tags。例如：",
    "---",
    "role: 配角",
    "tags: [盟友, 反派]",
    "---",
    "- frontmatter 之后必须有一个 H1：# 角色名（用主卡标题作为角色名）。",
    "- tags：从所有卡中合并去重，最多 30 个。",
    "- role：优先沿用主卡的 role；如果主卡没有 role，再从次卡选择最合适的一个。",
    "- 正文请融合去重，尽量保持结构清晰，建议包含：目标/动机/弱点/外貌/关系（可为空但保留条目）。",
    "",
    `主卡标题：${input.primaryTitle}`,
    "【主卡内容】",
    input.primaryContent,
    "",
    secondaryBlock ? "【次卡列表】\n" + secondaryBlock : "【次卡列表】（空）",
    "",
    "现在开始输出最终合并后的角色卡 Markdown："
  ].join("\n");
}
export function buildAuditCharacterMergePrompt(input: {
  primaryName: string;
  primaryProfile: any;
  secondaryProfiles: any[];
}) {
  return [
    "你是小说写作助手。现在要把“同一个角色”被拆分成的多个【角色画像条目】合并为一个。",
    "",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "输出 JSON schema：",
    JSON.stringify(
      {
        merged: {
          name: input.primaryName,
          role: "主角/配角/反派等（可空）",
          tags: ["标签（可空，最多 30）"],
          state: { "任意字段": "任意值（可空对象）" },
          socialTags: { profession: "职业", class: "阶级", titles: ["头衔"], other: ["其他标签"] },
          historicalDebts: ["历史债（可空）"],
          occurredNotes: ["发生过的事情（可空）"],
          narrativeDrives: {
            want: "想要",
            need: "需要",
            moralCompass: "道德罗盘",
            flaws: ["缺点"],
            blindSpots: ["认知盲点"]
          },
          fingerprints: {
            linguisticStyle: ["句式/语气特征"],
            catchphrases: ["口头禅"],
            mannerisms: ["标志性动作"],
            mask: [{ context: "在何场景", persona: "面具/人设" }]
          },
          relationalHooks: {
            relations: [
              {
                targetName: "对方角色名（必须是字符串）",
                types: ["可选标签"],
                emotionalPolarity: "情感倾向",
                conflictIndex: "冲突点",
                sharedSecrets: ["共享秘密"]
              }
            ],
            freeText: "兜底自由文本"
          },
          personalityAnalysis: "性格分析（可空）"
        }
      },
      null,
      2
    ),
    "",
    "合并规则：",
    "- name 必须等于主角色名。",
    "- 去重融合：同义信息合并为更清晰、更稳定的一份，不要把冲突信息都堆叠；不确定的可以留空。",
    "- tags 最多 30 个。",
    "- relations.targetName 若出现“被合并角色名”，请改为主角色名。",
    "",
    "主角色条目（primary）：",
    JSON.stringify(input.primaryProfile || {}, null, 2),
    "",
    "待合并条目（secondary list）：",
    JSON.stringify(input.secondaryProfiles || [], null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
}

// --- timeline & progress ---
export function buildTimelineUpdatePrompt(input: {
  bookSlug: string;
  recentChapterSummaries: Array<{ chapter: number; title: string; gistL1: string }>;
  compressedRanges: Array<{ startChapter: number; endChapter: number; summary: string }>;
  doneEventIds: string[];
  closedLoops: any[];
}) {
  return [
    "你是小说写作助手，负责维护「时间线 Timeline」与「压缩摘要」索引。",
    "你会收到：最近若干章的摘要（gistL1）、已存在的压缩区间摘要、以及已完成事件列表。",
    "",
    "任务：",
    "1) 给出 1-3 个「推荐压缩章节区间」：例如 3-7 章，并说明 why（简短）。",
    "2) （可选）给出少量关键事件 events（用于时间线），但**不要重复已完成事件**；无法确定可输出空数组。",
    "",
    "严格输出 JSON，不要解释、不要 markdown、不要代码块。JSON schema：",
    JSON.stringify(
      {
        compressionSuggestions: [{ startChapter: 3, endChapter: 7, why: "为什么适合压缩（不超过 40 字）" }],
        events: [
          {
            id: "evt-xxx（可选）",
            title: "事件标题",
            startChapter: 3,
            endChapter: 3,
            summary: "事件摘要（不超过 80 字）",
            status: "open"
          }
        ]
      },
      null,
      2
    ),
    "",
    "输入（recentChapterSummaries）：",
    JSON.stringify(input.recentChapterSummaries, null, 2),
    "",
    "输入（compressedRanges）：",
    JSON.stringify(input.compressedRanges, null, 2),
    "",
    "输入（doneEventIds）：",
    JSON.stringify(input.doneEventIds, null, 2),
    "",
    "输入（closedLoops）：",
    JSON.stringify(input.closedLoops, null, 2)
  ].join("\n");
}
export function buildProgressIndexPrompt(input: {
  chapter: { filename: string; title: string; chapterNo: number | null; auditedAt: string };
  auditRun: any;
  prevIndex: any;
}) {
  return [
    "你是小说写作助手。现在要维护一份“进行中事项清单”，只记录还在推进中的线索/冲突/待办，不要记录已完成的事。",
    "同时，请先给出一段“当前正在进行的事情（总述）”，用 3~8 句概括全书目前最主要的推进与悬念（不要写已完结事项）。",
    "",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "输出 schema：",
    JSON.stringify(
      {
        summary: "当前正在进行的事情（总述，3~8句）",
        lastSourceChapter: { filename: input.chapter.filename, chapterNo: input.chapter.chapterNo ?? undefined, title: input.chapter.title },
        items: [
          {
            id: "稳定 id（尽量沿用旧的；新建时可留空，服务端会生成）",
            title: "一句话描述正在进行的事项（必填）",
            detail: "可选：更具体的推进/当前状态/下一步",
            status: "open|progress|done（done 表示已完成，将不会展示）",
            priority: "1|2|3（1最高，可选）",
            related: {
              characters: ["相关角色名（可选）"],
              places: ["相关地点名（可选）"],
              orgs: ["相关组织名（可选）"],
              chapters: ["相关章节号（可选）"]
            }
          }
        ]
      },
      null,
      2
    ),
    "",
    "规则：",
    "- 只维护与“当前仍在进行中”的事项；已完成的标记 done 或从 items 移除。",
    "- 与旧 items 表达同一件事的，必须复用/更新旧条目（避免重复）。",
    "- summary 必须只包含“仍在进行中”的主线推进与悬念，不要写已经解决的结果。",
    "- title 要简短清晰，detail 可写推进与下一步（避免冗长）。",
    "- items 数量控制在 5~20 条，优先保留最重要的。",
    "",
    "当前章节信息：",
    JSON.stringify(input.chapter, null, 2),
    "",
    "本次审计结果（摘要/实体/影响/一致性/伏笔更新等）：",
    JSON.stringify(input.auditRun || {}, null, 2),
    "",
    "旧的 progressIndex（用于续写/去重/更新状态）：",
    JSON.stringify(input.prevIndex || {}, null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
}
// --- chapter tools (proofread / expand / titles) ---

export function buildMobileLayoutPrompt(input: { original: string }): string {
  return [
    "你是一位网文排版编辑，专门为「手机阅读」整理章节正文版式。",
    "",
    "任务：在不改动剧情、措辞与人称的前提下，仅通过分段、换行与场景分隔，让正文更适合竖屏手机阅读。",
    "",
    "必须遵守：",
    "- 不增删改任何句子中的字词（错别字也不要顺手改，除非 obvious 的断行粘连）",
    "- 不改变事件顺序、对话归属与叙述视角",
    "- 段落之间用恰好一个空行分隔",
    "- 对话尽量单独成段；同一段内多人短句可酌情拆分",
    "- 场景切换可用单独一行的 * * * 表示（仅当原文已有明显转场或空行暗示时）",
    "- 去掉无意义的硬换行（把被误断开的句子接回一行）",
    "- 保留原文中的标题行；若原文有 # 标题可去掉 # 只保留标题文字并单独成段居中感（仍用纯文本一行）",
    "",
    "输出要求：",
    "- 只输出排版后的完整正文纯文本",
    "- 不要 markdown 代码块、不要解释、不要备注",
    "",
    "【原文】",
    input.original || "",
    ""
  ].join("\n");
}

export function buildPolishPrompt(input: { original: string }): string {
  return [
    "你是一位中文小说校对编辑。请对下面的章节正文做「纠错」：只改明显错误，不做文风润色或改写。",
    "",
    "必须遵守：",
    "- 修正错别字、误字、同音字误用",
    "- 修正标点符号误用（缺漏、多余、中英文混用、引号配对等）",
    "- 修正语法问题：成分残缺、搭配不当、语序别扭、重复赘余等",
    "- 不改变剧情事实、信息顺序与人称视角；不加戏、不删关键情节",
    "- 保留人名、地名、专有名词与数字表述一致",
    "- 不为了「更好听」而换词、扩写、压缩或调整修辞；没有把握的错误不要硬改",
    "",
    "输出要求：",
    "- 只输出纠错后的完整正文",
    "- 不要解释、不要列表、不要加标题或备注",
    "",
    "【原文】",
    input.original || "",
    ""
  ].join("\n");
}

/** @deprecated 使用 buildAdjustPrompt */
export const buildExpandPrompt = buildAdjustPrompt;

export function buildAdjustPrompt(input: {
  targetWords: number;
  currentWords: number;
  compressed: string[];
  extraContext?: string;
  original: string;
}): string {
  const target = Math.max(200, Math.floor(input.targetWords));
  const current = Math.max(0, Math.floor(input.currentWords));
  const delta = target - current;
  let lengthGuidance: string;
  if (delta > Math.max(80, current * 0.08)) {
    lengthGuidance = `当前约 ${current} 字，目标约 ${target} 字（需明显增写）。补充环境氛围、动作细节、心理活动、对话节奏与过渡，避免啰嗦重复。`;
  } else if (delta < -Math.max(80, current * 0.08)) {
    lengthGuidance = `当前约 ${current} 字，目标约 ${target} 字（需明显压缩）。删减冗余与重复表达，保留关键剧情与信息顺序，使篇幅更精炼。`;
  } else {
    lengthGuidance = `当前约 ${current} 字，目标约 ${target} 字（篇幅接近目标，以优化为主）。改善草率、单薄或节奏欠佳的段落；可略增或略减局部字数，使整体接近目标。`;
  }

  return [
    "你是一位中文小说写作助手。请在不改变剧情事实与信息顺序的前提下，对下面的章节正文进行调整。",
    "要求：",
    lengthGuidance,
    `- 目标字数：约 ${target} 字（允许 ±10%）`,
    "- 保留人名/地名/专有名词一致；不加戏、不引入新设定；不改变叙事视角",
    "- 输出只要调整后的正文，不要解释、不要加标题",
    "",
    "【已发生的事情（时间线压缩摘要）】",
    input.compressed.length ? input.compressed.join("\n") : "（暂无）",
    "",
    input.extraContext?.trim() ? "【补充信息（当前发生的事情）】\n" + input.extraContext.trim() : "",
    input.extraContext?.trim() ? "" : "",
    "【原文】",
    input.original || "",
    ""
  ]
    .filter((x) => x !== "")
    .join("\n");
}

const CHAPTER_TITLE_STYLE_GUIDE: Record<string, string> = {
  normal: "中性、清晰、信息充分，略带网文味。",
  boom: "爆点强、爽感强、冲突感强：更抓眼球，允许更有张力的动词与短语，但不要浮夸堆叠。",
  suspense: "悬疑钩子强、疑问感强：强调信息差、反转、谜团，不要直接揭底。",
  hotblood: "热血燃向：强调逆袭、硬刚、突破、压迫与反击的气势。",
  funny: "轻松幽默：带一点反差和俏皮，但不要网络烂梗、不要太口水。",
  poetic: "文艺质感：更有画面感与意象，但仍要像章节标题，不写散文句。",
  minimal: "极简有力：4~10字优先，短促、干脆、像刀一样。"
};

export function buildChapterTitleSuggestPrompt(input: {
  style: string;
  count: number;
  content: string;
  batchMode?: boolean;
}): string {
  const style = input.style;
  const n = input.count;
  const content = input.content;
  const lengthRule = input.batchMode
    ? "- 标题必须是中文为主，简短有力，尽量 8~18 个字（极简风格可更短），不要书名号，不要句号。"
    : "- 标题必须是中文为主，简短有力，尽量 8~18 个字，不要书名号，不要句号。";
  return [
    "你是网文小说编辑。请根据下面“章节正文”生成多个章节标题候选。",
    `风格：${style}（${CHAPTER_TITLE_STYLE_GUIDE[style] || CHAPTER_TITLE_STYLE_GUIDE.boom}）`,
    "",
    "硬性要求：",
    "- 只输出 JSON（不要解释、不要 markdown、不要代码块）。",
    `- 生成 ${n} 个候选标题，放在 titles 数组里。`,
    lengthRule,
    "- 标题要有“网文章节点”的味道：更像预告/钩子/名场面，而不是流水账概括。",
    "- 不要捏造本章未出现的关键新设定/新角色。",
    "- 尽量让每个候选标题风格一致但表达角度不同（冲突/反转/目标/代价/人物）。",
    "",
    "输出 schema：",
    JSON.stringify({ titles: new Array(n).fill("标题候选") }, null, 2),
    "",
    "章节正文（可能截断）：",
    content,
    "",
    "现在输出 JSON："
  ].join("\n");
}

export function buildAuditPlaceMergePrompt(input: {
  primaryName: string;
  primary: unknown;
  secondary: unknown[];
}): string {
  return [
    "你是小说写作助手。现在要把“同一个地点”被拆分成的多个【地点条目】合并为一个。",
    "",
    "请严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "输出 JSON schema：",
    JSON.stringify(
      {
        merged: {
          name: input.primaryName,
          description: "地点描述（可空）",
          lastNote: "发生的事简述（可空）",
          group: "可选分组名（可空）"
        }
      },
      null,
      2
    ),
    "",
    "合并规则：",
    "- name 必须等于主地点名。",
    "- 对 description/lastNote 去重融合，不要机械拼接重复句。",
    "- 如果 group 缺失，可根据地名推断一个大类（例如“青石村”）。",
    "",
    "主地点条目（primary）：",
    JSON.stringify(input.primary || {}, null, 2),
    "",
    "待合并条目（secondary list）：",
    JSON.stringify(input.secondary || [], null, 2),
    "",
    "现在输出 JSON："
  ].join("\n");
}

export function buildTimelineRangeCompressPrompt(input: {
  startChapter: number;
  endChapter: number;
  chapters: Array<{ chapter: number; title: string; gistL1: string }>;
}): string {
  const a = input.startChapter;
  const b = input.endChapter;
  return [
    "你是小说写作助手，负责把多个章节的摘要压缩成一个更高层级的区间摘要。",
    "要求：",
    "- 用中文输出，不要 markdown，不要列表编号，控制在 250-500 字。",
    "- 不要重复已完成事件；如果无法判断完成与否，保持中性描述。",
    "",
    `区间：第 ${a}-${b} 章`,
    "",
    "该区间内每章摘要（gistL1）：",
    JSON.stringify(
      input.chapters.map((c) => ({ chapter: c.chapter, title: c.title, gistL1: c.gistL1 })),
      null,
      2
    )
  ].join("\n");
}

export function buildInspirationVariantsPrompt(input: {
  count: number;
  preset: string;
  free: string;
  base: { type: string; subtype?: string; title?: string; content: string };
}): string {
  const schemaHint = [
    "请严格输出 JSON 数组（不要解释、不要 markdown、不要代码块）。",
    "数组长度 = count。",
    "每个元素字段：{ title?: string, content: string, tags?: string[] }。",
    "content 是对原内容的改写/变体，不能只是同义句，要体现变体策略。"
  ].join("\n");
  const { count, preset, free, base } = input;
  return [
    "你是网络小说写作助手。现在要对“已有灵感卡”生成多个变体版本。",
    schemaHint,
    "",
    `count = ${count}`,
    preset ? `预设变体选项 preset = ${preset}` : "预设变体选项 preset = （空）",
    free ? `自由输入 freeText = ${free}` : "自由输入 freeText = （空）",
    "",
    "【原卡】",
    `type=${base.type} subtype=${base.subtype || ""} title=${base.title || ""}`,
    base.content,
    "",
    "现在输出 JSON 数组："
  ].join("\n");
}

// --- outline ---
export function buildOutlineSnowflakePrompt(input: {
  logline: string;
  instruction?: string;
  bookSynopsis?: string;
  worldExcerpt?: string;
  targetVolumes?: number;
  structureFramework?: string;
}) {
  const schema = {
    book: {
      logline: "一句话梗概",
      synopsis: { setup: "", development: "", twist: "", climax: "", ending: "" },
      targetWords: 0,
      targetChapters: 0,
      structureFramework: "三幕式",
      mainlineStages: [{ id: "stage-1", label: "阶段名", chapterRange: "1-20", note: "" }]
    },
    volumes: [{ id: "vol-1", title: "第一卷标题", order: 1, synopsis: "卷摘要", chapterFilenames: [] }]
  };
  return [
    "你是网文长篇结构编辑。根据作者提供的一句话梗概，用雪花法扩展全书结构与分卷规划。",
    "不要写正文，只输出结构化大纲 JSON。",
    "",
    "硬性要求：",
    "- 严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "- chapterFilenames 必须为空数组 []（尚未建章）。",
    "- volumes 数量参考 targetVolumes；每卷 synopsis 含：主要情节、核心冲突、人物成长、伏笔安排、卷末状态。",
    "- 五段式 synopsis 对应：起因/发展/转折/高潮/结局。",
    "",
    `logline: ${input.logline}`,
    input.instruction ? `作者补充: ${input.instruction}` : "",
    input.bookSynopsis ? `书籍简介: ${truncateForPrompt(input.bookSynopsis, 2000)}` : "",
    input.worldExcerpt ? `世界观摘录: ${input.worldExcerpt}` : "",
    input.structureFramework ? `结构框架: ${input.structureFramework}` : "",
    input.targetVolumes ? `建议分卷数: ${input.targetVolumes}` : "",
    "",
    "输出 schema 示例：",
    JSON.stringify(schema, null, 2),
    "",
    "现在输出 JSON："
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOutlineFromChaptersPrompt(input: {
  instruction?: string;
  bookSynopsis?: string;
  currentOutline?: unknown;
  chapters: Array<{ filename: string; id: string; title: string; excerpt: string }>;
  timelineCompressed?: string[];
  foreshadows?: Array<{ id: string; title: string; status: string }>;
}) {
  const schema = {
    volumes: [{ id: "vol-1", title: "", order: 1, synopsis: "", chapterFilenames: ["0001_标题.md"] }],
    ungroupedFilenames: [] as string[],
    chapterPlans: {
      "0001_标题.md": {
        core: "",
        scenes: "",
        beats: ["要点1", "要点2"],
        foreshadowPlant: [],
        foreshadowPayoff: [],
        hook: ""
      }
    }
  };
  const allowed = input.chapters.map((c) => c.filename);
  return [
    "你是网文结构编辑。根据已有章节标题与正文摘录，反推分卷归属与各章章纲。",
    "",
    "硬性要求：",
    "- 严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    `- chapterFilenames 与 chapterPlans 的 key 只能来自以下列表，禁止虚构：${JSON.stringify(allowed)}`,
    "- 每章必须最多归属一个分卷；未归属的放入 ungroupedFilenames。",
    "- volumes 中每一卷必须填写 synopsis（卷摘要：主要情节、冲突、成长、伏笔与卷末状态），不可留空。",
    "- beats 每条一句话，3-5 条为宜。",
    "",
    input.instruction ? `作者补充: ${input.instruction}` : "",
    input.bookSynopsis ? `书籍简介: ${truncateForPrompt(input.bookSynopsis, 1500)}` : "",
    input.currentOutline ? `当前大纲（可参考）: ${truncateForPrompt(JSON.stringify(input.currentOutline), 3000)}` : "",
    input.timelineCompressed?.length
      ? `时间线压缩: ${input.timelineCompressed.join("\n")}`
      : "",
    input.foreshadows?.length ? `伏笔索引: ${JSON.stringify(input.foreshadows.slice(0, 30))}` : "",
    "",
    "章节摘录：",
    JSON.stringify(input.chapters, null, 2),
    "",
    "输出 schema 示例：",
    JSON.stringify(schema, null, 2),
    "",
    "现在输出 JSON："
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOutlineRefineChapterPlanPrompt(input: {
  instruction?: string;
  chapter: { filename: string; id: string; title: string; excerpt: string };
  currentPlan?: unknown;
  bookLogline?: string;
  volumeSynopsis?: string;
  foreshadows?: Array<{ id: string; title: string; status: string }>;
}) {
  const schema = {
    chapterPlans: {
      [input.chapter.filename]: {
        core: "",
        scenes: "",
        pov: "",
        time: "",
        beats: [],
        foreshadowPlant: [],
        foreshadowPayoff: [],
        hook: ""
      }
    }
  };
  return [
    "你是网文章纲编辑。为单章生成或润色章纲（不是正文）。",
    "",
    "硬性要求：",
    "- 严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    `- 只输出 chapterPlans，且 key 必须为: ${input.chapter.filename}`,
    "- 若已有章纲字段非空且作者未要求推翻，保留原意仅补全空缺。",
    "",
    input.instruction ? `作者指令: ${input.instruction}` : "",
    input.bookLogline ? `全书 logline: ${input.bookLogline}` : "",
    input.volumeSynopsis ? `所属卷摘要: ${truncateForPrompt(input.volumeSynopsis, 1500)}` : "",
    input.currentPlan ? `当前章纲: ${JSON.stringify(input.currentPlan)}` : "",
    input.foreshadows?.length ? `相关伏笔: ${JSON.stringify(input.foreshadows.slice(0, 20))}` : "",
    "",
    "目标章节：",
    JSON.stringify(input.chapter, null, 2),
    "",
    "输出 schema：",
    JSON.stringify(schema, null, 2),
    "",
    "现在输出 JSON："
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOutlineVolumeChapterPlansPrompt(input: {
  instruction?: string;
  volume: { id: string; title: string; synopsis?: string; chapterFilenames: string[] };
  chapters: Array<{ filename: string; id: string; title: string; excerpt: string }>;
  existingPlans?: Record<string, unknown>;
}) {
  const schema = {
    chapterPlans: Object.fromEntries(
      input.chapters.map((c) => [
        c.filename,
        { core: "", beats: [], hook: "" }
      ])
    )
  };
  return [
    "你是网文章纲编辑。为指定分卷内多章批量生成章纲草案。",
    "",
    "硬性要求：",
    "- 严格输出 JSON（不要解释、不要 markdown、不要代码块）。",
    "- 只输出 chapterPlans；key 必须来自本卷章节列表。",
    "- 已有较完整章纲的章节可略过或仅补空字段。",
    "",
    input.instruction ? `作者补充: ${input.instruction}` : "",
    `分卷: ${JSON.stringify({ id: input.volume.id, title: input.volume.title, synopsis: input.volume.synopsis })}`,
    input.existingPlans ? `已有章纲: ${truncateForPrompt(JSON.stringify(input.existingPlans), 4000)}` : "",
    "",
    "章节摘录：",
    JSON.stringify(input.chapters, null, 2),
    "",
    "输出 schema：",
    JSON.stringify(schema, null, 2),
    "",
    "现在输出 JSON："
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOutlineForeshadowAuditPrompt(input: {
  outline: unknown;
  foreshadows: Array<{ id: string; title: string; status: string; chapters?: number[]; note?: string }>;
  chapterPlans: Record<string, { foreshadowPlant?: string[]; foreshadowPayoff?: string[] }>;
}) {
  return [
    "你是网文伏笔顾问。对照全书大纲章纲与伏笔索引，输出体检报告。",
    "",
    "输出要求：",
    "- 使用 Markdown（可含小标题与列表）。",
    "- 包含：未收伏笔、可能重复埋设、章纲与索引不一致、建议优先处理的 3-5 条。",
    "- 不要编造书中不存在的伏笔 id。",
    "",
    "伏笔索引：",
    JSON.stringify(input.foreshadows.slice(0, 80), null, 2),
    "",
    "大纲与章纲埋收笔：",
    truncateForPrompt(JSON.stringify({ outline: input.outline, chapterPlans: input.chapterPlans }), 8000),
    "",
    "现在输出 Markdown 报告："
  ].join("\n");
}
