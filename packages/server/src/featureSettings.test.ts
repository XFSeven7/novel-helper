import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDataDir, initDataDir, setDataDir } from "./dataDirContext.js";
import {
  readFeatureSettings,
  resolveModelRequestTimeoutMs,
  resolveOrganizeModelId,
  writeFeatureSettings
} from "./featureSettings.js";

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

  it("keeps activeId independent from featureModels.organize", async () => {
    const cfg = (id: string) => ({
      id,
      label: id,
      provider: "openai" as const,
      baseUrl: "",
      apiKey: "",
      testUrl: ""
    });
    await writeFeatureSettings({
      configs: [cfg("c1"), cfg("c2")],
      activeId: "c1",
      featureModels: { organize: "c1" }
    });
    await writeFeatureSettings({
      configs: [cfg("c1"), cfg("c2")],
      activeId: "c2"
    });
    const file = await readFeatureSettings();
    expect(file.activeId).toBe("c2");
    expect(file.featureModels?.organize).toBe("c1");
  });

  it("resolveOrganizeModelId falls back when organize config is missing", () => {
    const file = {
      configs: [
        { id: "openai", label: "O", provider: "openai" as const, baseUrl: "", apiKey: "", testUrl: "" },
        { id: "lm", label: "L", provider: "lmstudio" as const, baseUrl: "", apiKey: "", testUrl: "" }
      ],
      activeId: "lm",
      featureModels: { organize: "custom-gone" }
    };
    expect(resolveOrganizeModelId(file)).toBe("lm");
  });

  it("resolveModelRequestTimeoutMs uses local default and custom seconds", () => {
    expect(resolveModelRequestTimeoutMs({ provider: "openai" }, 180_000)).toBe(180_000);
    expect(resolveModelRequestTimeoutMs({ provider: "lmstudio" }, 180_000)).toBe(600_000);
    expect(resolveModelRequestTimeoutMs({ provider: "lmstudio", requestTimeoutSec: 900 }, 180_000)).toBe(
      900_000
    );
  });
});
