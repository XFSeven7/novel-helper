import { describe, expect, it } from "vitest";
import {
  customFontFamilyName,
  customFontIdFromFontId,
  resolveFontFamily
} from "./fontStorage";

describe("fontStorage", () => {
  it("resolves presets", () => {
    expect(resolveFontFamily("system")).toContain("system-ui");
    expect(resolveFontFamily("serif")).toContain("ui-serif");
    expect(resolveFontFamily("song")).toMatch(/SimSun|Songti/i);
  });

  it("resolves custom ids", () => {
    expect(customFontIdFromFontId("custom:abc")).toBe("abc");
    expect(customFontIdFromFontId("serif")).toBeNull();
    expect(resolveFontFamily("custom:abc")).toContain(customFontFamilyName("abc"));
  });
});
