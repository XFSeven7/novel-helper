export type StoredRelation = {
  targetName: string;
  types?: string[];
  emotionalPolarity?: string;
  conflictIndex?: string;
  sharedSecrets?: string[];
};

export type AuditCharacter = {
  name: string;
  relationalHooks?: {
    relations?: StoredRelation[];
    freeText?: string;
  };
};

export type RawRelationEdge = {
  source: string;
  target: string;
  types: string[];
  emotionalPolarity: string;
  conflictIndex: string;
  sharedSecrets: string[];
};

export type FocusRelation = {
  other: string;
  types: string[];
  emotionalPolarity: string;
  conflictIndex: string;
  sharedSecrets: string[];
  /** 持久化时写回的角色名（relations 数组所属角色） */
  ownerName: string;
  /** 在 owner 的 relations 数组中的下标 */
  ownerIndex: number;
};

function normName(n: unknown): string {
  return String(n ?? "").trim();
}

function normTypes(types: unknown): string[] {
  return Array.isArray(types) ? types.map((x) => String(x).trim()).filter(Boolean) : [];
}

export function parseAuditCharacters(raw: unknown): AuditCharacter[] {
  if (!raw || typeof raw !== "object") return [];
  const chars = (raw as { characters?: unknown }).characters;
  if (!Array.isArray(chars)) return [];
  return chars
    .map((c) => ({ ...c, name: normName((c as AuditCharacter)?.name) }))
    .filter((c) => c.name) as AuditCharacter[];
}

export function buildRawEdges(characters: AuditCharacter[]): RawRelationEdge[] {
  const edges: RawRelationEdge[] = [];
  for (const c of characters) {
    const source = c.name;
    const rels = Array.isArray(c.relationalHooks?.relations) ? c.relationalHooks!.relations! : [];
    for (const r of rels) {
      const target = normName(r?.targetName);
      if (!target) continue;
      edges.push({
        source,
        target,
        types: normTypes(r?.types),
        emotionalPolarity: normName(r?.emotionalPolarity),
        conflictIndex: normName(r?.conflictIndex),
        sharedSecrets: Array.isArray(r?.sharedSecrets)
          ? r.sharedSecrets.map((x) => String(x).trim()).filter(Boolean)
          : []
      });
    }
  }
  return edges;
}

function mergePair(a: RawRelationEdge, b: RawRelationEdge): Omit<RawRelationEdge, "source" | "target"> {
  const types = [...new Set([...a.types, ...b.types])];
  return {
    types,
    emotionalPolarity: a.emotionalPolarity || b.emotionalPolarity,
    conflictIndex: a.conflictIndex || b.conflictIndex,
    sharedSecrets: [...new Set([...a.sharedSecrets, ...b.sharedSecrets])]
  };
}

export function getRelationsForFocus(focus: string, characters: AuditCharacter[]): FocusRelation[] {
  const f = normName(focus);
  if (!f) return [];
  const byOwner = new Map<string, StoredRelation[]>();
  for (const c of characters) {
    byOwner.set(c.name, Array.isArray(c.relationalHooks?.relations) ? c.relationalHooks!.relations! : []);
  }

  const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);
  const seen = new Map<string, FocusRelation>();

  for (const c of characters) {
    const ownerName = c.name;
    const rels = byOwner.get(ownerName) ?? [];
    rels.forEach((r, ownerIndex) => {
      const target = normName(r?.targetName);
      if (!target) return;
      if (ownerName !== f && target !== f) return;

      const other = ownerName === f ? target : ownerName;
      const key = pairKey(f, other);
      const entry: FocusRelation = {
        other,
        types: normTypes(r?.types),
        emotionalPolarity: normName(r?.emotionalPolarity),
        conflictIndex: normName(r?.conflictIndex),
        sharedSecrets: Array.isArray(r?.sharedSecrets)
          ? r.sharedSecrets.map((x) => String(x).trim()).filter(Boolean)
          : [],
        ownerName,
        ownerIndex
      };

      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, entry);
        return;
      }
      if (prev.ownerName === f) return;
      if (entry.ownerName === f) {
        seen.set(key, {
          ...entry,
          types: [...new Set([...entry.types, ...prev.types])],
          emotionalPolarity: entry.emotionalPolarity || prev.emotionalPolarity,
          conflictIndex: entry.conflictIndex || prev.conflictIndex,
          sharedSecrets: [...new Set([...entry.sharedSecrets, ...prev.sharedSecrets])]
        });
      } else {
        seen.set(key, {
          ...prev,
          types: [...new Set([...prev.types, ...entry.types])],
          emotionalPolarity: prev.emotionalPolarity || entry.emotionalPolarity,
          conflictIndex: prev.conflictIndex || entry.conflictIndex,
          sharedSecrets: [...new Set([...prev.sharedSecrets, ...entry.sharedSecrets])]
        });
      }
    });
  }

  return [...seen.values()].sort((a, b) => a.other.localeCompare(b.other, "zh-Hans-CN"));
}

export type CharacterRelationSummary = {
  name: string;
  relationCount: number;
  types: string[];
  hasConflict: boolean;
};

export function summarizeCharacters(characters: AuditCharacter[]): CharacterRelationSummary[] {
  const edges = buildRawEdges(characters);
  const map = new Map<string, CharacterRelationSummary>();

  for (const c of characters) {
    map.set(c.name, { name: c.name, relationCount: 0, types: [], hasConflict: false });
  }

  for (const e of edges) {
    for (const name of [e.source, e.target]) {
      const s = map.get(name);
      if (!s) continue;
      s.relationCount += 1;
      s.types = [...new Set([...s.types, ...e.types])];
      if (e.conflictIndex) s.hasConflict = true;
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export function filterCharacterSummaries(
  summaries: CharacterRelationSummary[],
  search: string,
  typeFilter: string | null,
  onlyWithRelations: boolean
): CharacterRelationSummary[] {
  const q = search.trim().toLowerCase();
  return summaries.filter((s) => {
    if (onlyWithRelations && s.relationCount === 0) return false;
    if (typeFilter && !s.types.includes(typeFilter)) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function relationsOverview(characters: AuditCharacter[]) {
  const edges = buildRawEdges(characters);
  const typed = edges.filter((e) => e.types.length > 0).length;
  return {
    characterCount: characters.length,
    edgeCount: edges.length,
    typedEdgeCount: typed,
    untypedEdgeCount: edges.length - typed
  };
}

export function mergeEdgeData(a: RawRelationEdge, b: RawRelationEdge): RawRelationEdge {
  const m = mergePair(a, b);
  return { source: a.source, target: a.target, ...m };
}
