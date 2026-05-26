import { generateText } from "ai";
import crypto from "node:crypto";
import type { ModelConfig } from "../featureSettings.js";
import type { CustomPersonasFile, ReaderPersona } from "./types.js";
import { readCustomPersonas, writeCustomPersonas } from "./store.js";

function stripJsonFence(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const i = t.indexOf("\n");
    const j = t.lastIndexOf("```");
    if (i >= 0 && j > i) return t.slice(i + 1, j).trim();
  }
  return t;
}

function fallbackGenerated(count: number, startIndex: number): ReaderPersona[] {
  const archetypes = ["新读者", "追更新人", "安利党", "吐槽役", "潜水观察"];
  return Array.from({ length: count }, (_, i) => {
    const n = startIndex + i + 1;
    return {
      id: `gen-${crypto.randomUUID().slice(0, 8)}`,
      nickname: `新书友${n}`,
      archetype: archetypes[i % archetypes.length]!,
      tier: "normal" as const,
      traits: ["AI邀请"],
      emojiStyle: "light" as const,
      templateSlots: {
        like: ["👍 来了", "追更中"],
        short: ["刚入坑，这书有点意思", "期待后续"]
      },
      source: "generated" as const
    };
  });
}

export async function inviteNewReaders(input: {
  dataDir: string;
  count: number;
  cfg: ModelConfig;
  createAiSdkModel: (cfg: ModelConfig) => { model: unknown; providerOptions: unknown };
}): Promise<{ added: number; personas: ReaderPersona[] }> {
  const custom = await readCustomPersonas(input.dataDir);
  const count = input.count;
  let generated: ReaderPersona[] = [];

  try {
    const { model, providerOptions } = input.createAiSdkModel(input.cfg);
    const prompt = `你是网文读者人格设计师。生成 ${count} 个中文网文读者人格，JSON 数组，每项字段：
id(可省略)、nickname、archetype、tier(normal|lurker 为主)、traits(字符串数组)、emojiStyle(none|light|heavy)、templateSlots:{like:string[],short:string[]}
只输出 JSON 数组，不要解释。`;
    const r = await generateText({
      model: model as Parameters<typeof generateText>[0]["model"],
      messages: [{ role: "user", content: prompt }],
      providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"]
    });
    const parsed = JSON.parse(stripJsonFence(r.text)) as Partial<ReaderPersona>[];
    if (Array.isArray(parsed)) {
      generated = parsed.slice(0, count).map((p, i) => ({
        id: typeof p.id === "string" ? p.id : `gen-${crypto.randomUUID().slice(0, 8)}`,
        nickname: String(p.nickname || `新书友${i + 1}`).slice(0, 24),
        archetype: String(p.archetype || "新读者"),
        tier: p.tier === "deep" ? "deep" : p.tier === "lurker" ? "lurker" : "normal",
        traits: Array.isArray(p.traits) ? p.traits.map(String).slice(0, 5) : ["新读者"],
        emojiStyle: p.emojiStyle === "heavy" ? "heavy" : p.emojiStyle === "none" ? "none" : "light",
        templateSlots: {
          like: Array.isArray(p.templateSlots?.like) ? p.templateSlots.like.map(String) : ["👍"],
          short: Array.isArray(p.templateSlots?.short) ? p.templateSlots.short.map(String) : ["不错"]
        },
        source: "generated" as const
      }));
    }
  } catch {
    generated = fallbackGenerated(count, custom.personas.length);
  }

  if (!generated.length) generated = fallbackGenerated(count, custom.personas.length);

  const next: CustomPersonasFile = {
    version: 1,
    lastInviteAt: new Date().toISOString(),
    personas: [...custom.personas, ...generated]
  };
  await writeCustomPersonas(input.dataDir, next);
  return { added: generated.length, personas: generated };
}
