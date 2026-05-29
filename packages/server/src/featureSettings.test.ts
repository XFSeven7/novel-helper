import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDataDir, initDataDir, setDataDir } from "./dataDirContext.js";
import { readFeatureSettings, writeFeatureSettings } from "./featureSettings.js";

let tmp = "";
let prevDataDir = "";

beforeEach(async () => {
  prevDataDir = getDataDir();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "nh-feature-settings-"));
  await fs.mkdir(path.join(tmp, "_settings"), { recursive: true });
  initDataDir(tmp);
});

afterEach(async () => {
  setDataDir(prevDataDir);
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("featureSettings merge write", () => {
  it("preserves feature toggles when only model configs are patched", async () => {
    await writeFeatureSettings({
      configs: [{ id: "c1", label: "L", provider: "openai", baseUrl: "", apiKey: "", testUrl: "" }],
      activeId: "c1",
      features: { readerCommentsEnabled: true, trainingModeEnabled: true }
    });

    await writeFeatureSettings({
      configs: [{ id: "c1", label: "L2", provider: "openai", baseUrl: "", apiKey: "", testUrl: "" }],
      activeId: "c1"
    });

    const file = await readFeatureSettings();
    expect(file.features?.readerCommentsEnabled).toBe(true);
    expect(file.features?.trainingModeEnabled).toBe(true);
  });
});
