import { describe, expect, it } from "vitest";
import { insertLineBelowCursor } from "./textareaEdit";

describe("insertLineBelowCursor", () => {
  it("inserts empty line below when cursor is mid-line", () => {
    const text = "hello world";
    expect(insertLineBelowCursor(text, 5)).toEqual({
      text: "hello world\n",
      selectionStart: 12,
      selectionEnd: 12
    });
  });

  it("inserts below current line in multi-line text", () => {
    const text = "line1\nline2\nline3";
    expect(insertLineBelowCursor(text, 8)).toEqual({
      text: "line1\nline2\n\nline3",
      selectionStart: 12,
      selectionEnd: 12
    });
  });

  it("works at end of last line", () => {
    const text = "only";
    expect(insertLineBelowCursor(text, 4)).toEqual({
      text: "only\n",
      selectionStart: 5,
      selectionEnd: 5
    });
  });
});
