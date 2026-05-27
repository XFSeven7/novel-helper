import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "./dataDirContext.js";

export type ModelBenchmarkTimeline = {
  // server-side timestamps (ms since epoch)
  t_srv_received_ms: number;
  t_srv_validated_ms?: number;
  t_upstream_start_ms?: number;
  t_upstream_first_token_ms?: number;
  t_upstream_done_ms?: number;
  t_srv_respond_start_ms?: number;
  t_srv_respond_done_ms?: number;

  // client-side durations (ms; measured by UI)
  client_wait_first_byte_ms?: number;
  client_download_parse_ms?: number;
  client_total_ms?: number;
};

export type ModelBenchmarkDurations = {
  server_total_ms?: number;
  server_overhead_ms?: number;
  model_ttfb_ms?: number;
  model_total_ms?: number;
  server_postprocess_ms?: number;
  server_respond_ms?: number;
};

export type ModelBenchmarkRecord = {
  id: string;
  createdAt: string;
  ok: boolean;
  error?: string;

  modelConfigId: string;
  modelLabel: string;
  provider: string;
  modelName?: string;
  baseUrl?: string;

  inputChars: number;
  outputChars?: number;
  outputPreview?: string;

  timeline: ModelBenchmarkTimeline;
  durations?: ModelBenchmarkDurations;
};

export type ModelBenchmarkFile = {
  version: 1;
  updatedAt: string;
  items: ModelBenchmarkRecord[];
};

const MAX_ITEMS_DEFAULT = 200;

function settingsDir() {
  return path.join(getDataDir(), "_settings");
}

function filePath() {
  return path.join(settingsDir(), "model-benchmark.json");
}

export function computeDurations(tl: ModelBenchmarkTimeline): ModelBenchmarkDurations {
  const d = (a?: number, b?: number) => (typeof a === "number" && typeof b === "number" ? Math.max(0, a - b) : undefined);
  return {
    server_total_ms: d(tl.t_srv_respond_done_ms, tl.t_srv_received_ms),
    server_overhead_ms: d(tl.t_upstream_start_ms, tl.t_srv_received_ms),
    model_ttfb_ms: d(tl.t_upstream_first_token_ms, tl.t_upstream_start_ms),
    model_total_ms: d(tl.t_upstream_done_ms, tl.t_upstream_start_ms),
    server_postprocess_ms: d(tl.t_srv_respond_start_ms, tl.t_upstream_done_ms),
    server_respond_ms: d(tl.t_srv_respond_done_ms, tl.t_srv_respond_start_ms)
  };
}

export async function readModelBenchmarkFile(): Promise<ModelBenchmarkFile> {
  try {
    const raw = await fs.readFile(filePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ModelBenchmarkFile>;
    const items = Array.isArray(parsed.items) ? (parsed.items as ModelBenchmarkRecord[]) : [];
    return { version: 1, updatedAt: String(parsed.updatedAt || new Date().toISOString()), items };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}

export async function writeModelBenchmarkFile(file: ModelBenchmarkFile): Promise<void> {
  await fs.mkdir(settingsDir(), { recursive: true });
  const normalized: ModelBenchmarkFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: Array.isArray(file.items) ? file.items : []
  };
  await fs.writeFile(filePath(), JSON.stringify(normalized, null, 2), "utf8");
}

export async function appendModelBenchmarkRecord(record: ModelBenchmarkRecord, opts?: { maxItems?: number }): Promise<void> {
  const maxItems = typeof opts?.maxItems === "number" ? opts.maxItems : MAX_ITEMS_DEFAULT;
  const f = await readModelBenchmarkFile();
  const items = [record, ...(f.items || [])].slice(0, Math.max(1, maxItems));
  await writeModelBenchmarkFile({ ...f, items });
}

