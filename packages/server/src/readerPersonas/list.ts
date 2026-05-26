import { getBuiltinPersonas } from "./builtin.js";
import { readCustomPersonas } from "./store.js";
import type { ReaderPersona } from "./types.js";

export async function listReaderPersonas(
  dataDir: string,
  input: { q?: string; page: number; pageSize: number }
): Promise<{ items: ReaderPersona[]; total: number; page: number; pageSize: number }> {
  const custom = await readCustomPersonas(dataDir);
  const all: ReaderPersona[] = [...getBuiltinPersonas(), ...custom.personas];
  const q = (input.q ?? "").trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (p) => p.nickname.toLowerCase().includes(q) || p.archetype.toLowerCase().includes(q)
      )
    : all;
  const pageSize = Math.min(100, Math.max(1, input.pageSize));
  const page = Math.max(1, input.page);
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize
  };
}
