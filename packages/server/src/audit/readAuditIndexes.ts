import {
  readAuditCharactersIndex,
  readAuditForeshadowsIndex,
  readAuditLedger,
  readAuditOrgsIndex,
  readAuditPlacesIndex,
  readAuditProgressIndex,
  readTimelineIndex
} from "../fsStore.js";
import type { AuditIndexesSnapshot } from "./auditSettlement.js";

export async function readAllAuditIndexes(dataDir: string, slug: string): Promise<AuditIndexesSnapshot> {
  const [characters, places, orgs, foreshadows, ledger, timeline, progress] = await Promise.all([
    readAuditCharactersIndex(dataDir, slug),
    readAuditPlacesIndex(dataDir, slug),
    readAuditOrgsIndex(dataDir, slug),
    readAuditForeshadowsIndex(dataDir, slug),
    readAuditLedger(dataDir, slug),
    readTimelineIndex(dataDir, slug).catch(() => ({ chapters: [], events: [], compressedRanges: [], compressionSuggestions: [], manual: {}, updatedAt: "" })),
    readAuditProgressIndex(dataDir, slug).catch(() => ({ version: 1, updatedAt: "", items: [] }))
  ]);
  return {
    characters: characters as Record<string, unknown>,
    places: places as Record<string, unknown>,
    orgs: orgs as Record<string, unknown>,
    foreshadows: foreshadows as Record<string, unknown>,
    ledger: ledger as Record<string, unknown>,
    timeline: timeline as Record<string, unknown>,
    progress: progress as Record<string, unknown>
  };
}
