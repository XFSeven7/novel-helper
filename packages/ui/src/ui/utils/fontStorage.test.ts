import { describe, expect, it } from "vitest";
import * as fontStorage from "./fontStorage";

const {
  customFontFamilyName,
  customFontIdFromFontId,
  resolveFontFamily
} = fontStorage;

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

  it("registers every custom font face idempotently", () => {
    const ensureCustomFontFaces = (
      fontStorage as typeof fontStorage & {
        ensureCustomFontFaces(ids: string[]): void;
      }
    ).ensureCustomFontFaces;
    expect(ensureCustomFontFaces).toBeTypeOf("function");

    const elements = new Map<string, { id: string; textContent: string }>();
    let appendCount = 0;
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => ({ id: "", textContent: "" }),
        getElementById: (id: string) => elements.get(id) ?? null,
        head: {
          appendChild: (element: { id: string; textContent: string }) => {
            appendCount += 1;
            elements.set(element.id, element);
          }
        }
      }
    });

    try {
      ensureCustomFontFaces(["alpha", "beta"]);
      const style = elements.get("novel-helper-custom-font-faces");
      expect(style?.textContent).toContain('font-family:"NovelHelperCustom-alpha"');
      expect(style?.textContent).toContain('font-family:"NovelHelperCustom-beta"');

      ensureCustomFontFaces(["alpha", "beta"]);
      expect(appendCount).toBe(1);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument
      });
    }
  });
});
