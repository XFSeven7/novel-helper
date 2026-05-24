import type { AuditRun } from "../fsStore.js";
import {
  applyHookOpsToForeshadowsIndex,
  parseHookOpsFromRun,
  settlerLiteHookOps,
  type SettlerDecision
} from "../foreshadowSettlement.js";
import type { ChapterExtract } from "./auditExtractSchema.js";
import { settleCharactersFromExtract } from "./characterSettlement.js";
import { settleOrgsFromExtract } from "./orgSettlement.js";
import { settlePlacesFromExtract } from "./placeSettlement.js";
import { settleProgressFromExtract } from "./progressSettlement.js";
import { settleTimelineFromExtract } from "./timelineSettlement.js";

export type SettlementReport = {
  auditedAt: string;
  chapterNo: number | null;
  foreshadows: { applied: number; rejected: number; decisions: SettlerDecision[] };
  characters: { merged: number; created: number };
  places: { merged: number; created: number };
  orgs: { merged: number; created: number };
  timeline: { eventsUpserted: number; progressTouched: number };
  errors: string[];
};

export type AuditIndexesSnapshot = {
  characters: Record<string, unknown>;
  places: Record<string, unknown>;
  orgs: Record<string, unknown>;
  foreshadows: Record<string, unknown>;
  ledger: Record<string, unknown>;
  timeline: Record<string, unknown>;
  progress: Record<string, unknown>;
};

export function buildAuditRunFromExtract(
  extract: ChapterExtract,
  filename: string,
  source?: { contentHash: string; contentLength: number },
  settlement?: SettlementReport
): AuditRun & { hookOps?: unknown[]; settlement?: SettlementReport; humanAuditReport?: string; scores?: unknown } {
  const chapterId = filename.replace(/\.md$/, "");
  const run: Record<string, unknown> = {
    chapter: {
      filename,
      id: chapterId,
      title: String(extract.chapter?.title || chapterId),
      wordCount: Number(extract.chapter?.wordCount) || 0,
      auditedAt: String(extract.chapter?.auditedAt || new Date().toISOString())
    },
    gistL1: String(extract.gistL1 || ""),
    entities: {
      characters: (extract.entities?.characters || []) as AuditRun["entities"]["characters"],
      events: (extract.entities?.events || []) as AuditRun["entities"]["events"]
    },
    consistencyChecks: (extract.consistencyChecks || []) as AuditRun["consistencyChecks"],
    causalAnchors: (extract.causalAnchors || { setups: [], payoffs: [] }) as AuditRun["causalAnchors"],
    impactAnalysis: (extract.impactAnalysis || []) as AuditRun["impactAnalysis"],
    compression: (extract.compression || { l2Pruning: null, mergeCandidates: null }) as AuditRun["compression"],
    ledgerUpdates: (extract.ledgerUpdates || { openLoops: [], closedLoops: [] }) as AuditRun["ledgerUpdates"],
    uiInjection: (extract.uiInjection || { spotlightCharacters: [], spotlightTags: [] }) as AuditRun["uiInjection"]
  };
  if (extract.hookOps?.length) run.hookOps = extract.hookOps;
  if (source) run.source = source;
  if (settlement) run.settlement = settlement;
  if (extract.humanAuditReport) (run as { humanAuditReport?: string }).humanAuditReport = extract.humanAuditReport;
  if (extract.scores) (run as { scores?: unknown }).scores = extract.scores;
  return run as AuditRun & { hookOps?: unknown[]; settlement?: SettlementReport; humanAuditReport?: string; scores?: unknown };
}

export function settleIndexesFromExtract(input: {
  extract: ChapterExtract;
  filename: string;
  chapterNum: number | null;
  indexes: AuditIndexesSnapshot;
}): { indexes: AuditIndexesSnapshot; report: SettlementReport } {
  const { extract, filename, chapterNum, indexes } = input;
  const auditedAt = String(extract.chapter?.auditedAt || new Date().toISOString());
  const title = String(extract.chapter?.title || filename.replace(/\.md$/, ""));
  const errors: string[] = [];

  const charResult = settleCharactersFromExtract(indexes.characters, extract, {
    auditedAtIso: auditedAt,
    chapterNum
  });
  indexes.characters = charResult.index;

  const placeResult = settlePlacesFromExtract(indexes.places, extract, { auditedAt, chapterNum });
  indexes.places = placeResult.index;

  const orgResult = settleOrgsFromExtract(indexes.orgs, extract, { auditedAt, chapterNum });
  indexes.orgs = orgResult.index;

  const ledger = { ...indexes.ledger } as { openLoops: unknown[]; closedLoops: unknown[]; updatedAt?: string };
  ledger.openLoops = Array.isArray(ledger.openLoops) ? ledger.openLoops : [];
  ledger.closedLoops = Array.isArray(ledger.closedLoops) ? ledger.closedLoops : [];
  ledger.updatedAt = auditedAt;
  if (extract.ledgerUpdates?.openLoops?.length) ledger.openLoops.push(...extract.ledgerUpdates.openLoops);
  if (extract.ledgerUpdates?.closedLoops?.length) ledger.closedLoops.push(...extract.ledgerUpdates.closedLoops);
  indexes.ledger = ledger;

  const foIdx = { ...indexes.foreshadows } as { foreshadows: unknown[]; hiddenIds: unknown[]; updatedAt: string; version: 1 };
  const rawOps = parseHookOpsFromRun(extract);
  const existingForeshadows = (foIdx.foreshadows || []) as Parameters<typeof settlerLiteHookOps>[1];
  const { ops, decisions } = settlerLiteHookOps(rawOps, existingForeshadows as any);
  applyHookOpsToForeshadowsIndex(foIdx as any, ops, chapterNum, auditedAt);
  indexes.foreshadows = foIdx;

  let eventsUpserted = 0;
  if (Number.isFinite(chapterNum)) {
    try {
      const tl = settleTimelineFromExtract(indexes.timeline as any, extract, {
        filename,
        chapterNum: chapterNum as number,
        title,
        auditedAt
      });
      indexes.timeline = tl.index;
      eventsUpserted = tl.eventsUpserted;
    } catch (e: any) {
      errors.push(`timeline: ${e?.message || String(e)}`);
    }
  }

  let progressTouched = 0;
  try {
    const pr = settleProgressFromExtract(indexes.progress, extract, {
      filename,
      chapterNo: chapterNum,
      title,
      auditedAt
    });
    indexes.progress = pr.index;
    progressTouched = pr.touched;
  } catch (e: any) {
    errors.push(`progress: ${e?.message || String(e)}`);
  }

  const report: SettlementReport = {
    auditedAt,
    chapterNo: chapterNum,
    foreshadows: {
      applied: ops.length,
      rejected: decisions.filter((d) => d.action === "rejected").length,
      decisions
    },
    characters: { merged: charResult.merged, created: charResult.created },
    places: { merged: placeResult.merged, created: placeResult.created },
    orgs: { merged: orgResult.merged, created: orgResult.created },
    timeline: { eventsUpserted, progressTouched },
    errors
  };

  return { indexes, report };
}

export function auditIndexesToFileWrites(indexes: AuditIndexesSnapshot, auditRunFilename: string, auditRun: object): Array<{ relativePath: string; content: string }> {
  const writes = [
    { relativePath: pathJoin("auditRuns", `${auditRunFilename}.json`), content: JSON.stringify(auditRun, null, 2) },
    { relativePath: "charactersIndex.json", content: JSON.stringify(indexes.characters, null, 2) },
    { relativePath: "placesIndex.json", content: JSON.stringify(indexes.places, null, 2) },
    { relativePath: "orgsIndex.json", content: JSON.stringify(indexes.orgs, null, 2) },
    { relativePath: "foreshadowsIndex.json", content: JSON.stringify(indexes.foreshadows, null, 2) },
    { relativePath: "karmaLedger.json", content: JSON.stringify(indexes.ledger, null, 2) },
    { relativePath: "timelineIndex.json", content: JSON.stringify(indexes.timeline, null, 2) },
    { relativePath: "progressIndex.json", content: JSON.stringify(indexes.progress, null, 2) }
  ];
  return writes;
}

function pathJoin(...parts: string[]) {
  return parts.join("/");
}
