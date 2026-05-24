export const normStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const uniqStrs = (arr: unknown) =>
  [...new Set((Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter(Boolean))];

export const mergeStrArr = (a: unknown, b: unknown) =>
  uniqStrs([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);

export const hasVal = (v: unknown) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return false;
};

export const mergeObjNonEmpty = (prev: unknown, next: unknown) => {
  const out: Record<string, unknown> = { ...(prev && typeof prev === "object" ? (prev as object) : {}) };
  if (!next || typeof next !== "object") return out;
  for (const [k, v] of Object.entries(next)) {
    if (!hasVal(v)) continue;
    out[k] = v;
  }
  return out;
};

export const mergeMask = (a: unknown, b: unknown) => {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  const out: Array<{ context: string; persona: string }> = [];
  const seen = new Set<string>();
  for (const it of [...arrA, ...arrB]) {
    const ctx = normStr((it as { context?: string })?.context);
    const persona = normStr((it as { persona?: string })?.persona);
    if (!ctx && !persona) continue;
    const key = `${ctx}@@${persona}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ context: ctx, persona });
  }
  return out;
};

export const mergeRelations = (a: unknown, b: unknown) => {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  const byTarget = new Map<string, Record<string, unknown>>();
  for (const r of [...arrA, ...arrB]) {
    const targetName = normStr((r as { targetName?: string })?.targetName);
    if (!targetName) continue;
    const prev = byTarget.get(targetName) || { targetName };
    const merged = {
      ...prev,
      targetName,
      types: mergeStrArr(prev.types, (r as { types?: unknown })?.types),
      emotionalPolarity: hasVal((r as { emotionalPolarity?: unknown })?.emotionalPolarity)
        ? normStr((r as { emotionalPolarity?: string }).emotionalPolarity)
        : prev.emotionalPolarity,
      conflictIndex: hasVal((r as { conflictIndex?: unknown })?.conflictIndex)
        ? normStr((r as { conflictIndex?: string }).conflictIndex)
        : prev.conflictIndex,
      sharedSecrets: mergeStrArr(prev.sharedSecrets, (r as { sharedSecrets?: unknown })?.sharedSecrets)
    };
    byTarget.set(targetName, merged);
  }
  return [...byTarget.values()].sort((x, y) =>
    String(x.targetName || "").localeCompare(String(y.targetName || ""), "zh-Hans-CN")
  );
};

export const mergeFreeText = (a: unknown, b: unknown) => {
  const ta = normStr(a);
  const tb = normStr(b);
  if (!tb) return ta;
  if (!ta) return tb;
  if (ta.includes(tb)) return ta;
  return `${ta}\n${tb}`;
};
