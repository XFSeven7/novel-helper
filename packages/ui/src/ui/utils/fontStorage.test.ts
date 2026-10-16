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
    expect(resolveFontFamily("harmony")).toContain("HarmonyOS Sans SC");
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

  it.each([undefined, "", "system"])("clears the app font for %s", (fontId) => {
    const properties = new Map([["--app-font-family", "stale-font"]]);
    const styleElement = { id: "novel-helper-custom-font", textContent: "stale-face" };
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          style: {
            removeProperty: (name: string) => properties.delete(name),
            setProperty: (name: string, value: string) => properties.set(name, value)
          }
        },
        getElementById: (id: string) =>
          id === "novel-helper-custom-font" ? styleElement : null
      }
    });

    try {
      fontStorage.applyFontToDocument(fontId);
      expect(properties.has("--app-font-family")).toBe(false);
      expect(styleElement.textContent).toBe("");
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument
      });
    }
  });
});
