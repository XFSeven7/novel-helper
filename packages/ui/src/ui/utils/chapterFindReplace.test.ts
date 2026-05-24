import { describe, expect, it } from "vitest";
import {
  findAllLiteralMatches,
  findNextMatch,
  findPrevMatch,
  matchIndexInList,
  replaceAllLiteral,
  stepMatchNext,
  stepMatchPrev,
  type TextRange
} from "./chapterFindReplace";

describe("findNextMatch", () => {
  it("returns null when query empty", () => {
    expect(findNextMatch("abc", "", 0)).toBeNull();
  });

  it("finds from cursor forward", () => {
    expect(findNextMatch("foo bar foo", "foo", 1)).toEqual({ start: 8, end: 11 } satisfies TextRange);
  });

  it("wraps to start when no match after cursor", () => {
    expect(findNextMatch("foo bar", "foo", 5)).toEqual({ start: 0, end: 3 });
  });

  it("returns null when no match at all", () => {
    expect(findNextMatch("abc", "z", 0)).toBeNull();
  });
});

describe("findPrevMatch", () => {
  it("finds before cursor", () => {
    expect(findPrevMatch("foo bar foo", "foo", 7)).toEqual({ start: 0, end: 3 });
  });

  it("wraps to end when no match before cursor", () => {
    expect(findPrevMatch("foo bar foo", "foo", 2)).toEqual({ start: 8, end: 11 });
  });
});

describe("findAllLiteralMatches", () => {
  it("lists non-overlapping matches", () => {
    expect(findAllLiteralMatches("foo bar foo", "foo")).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 }
    ]);
  });
});

describe("matchIndexInList", () => {
  it("returns 1-based index", () => {
    const matches = findAllLiteralMatches("foo bar foo", "foo");
    expect(matchIndexInList(matches, { start: 8, end: 11 })).toBe(2);
  });
});

describe("stepMatchNext", () => {
  it("wraps from last to first", () => {
    const matches = findAllLiteralMatches("a-a-a", "a");
    expect(matches).toHaveLength(3);
    const last = matches[2]!;
    expect(stepMatchNext(matches, last)).toEqual(matches[0]);
  });
});

describe("stepMatchPrev", () => {
  it("wraps from first to last", () => {
    const matches = findAllLiteralMatches("a-a-a", "a");
    expect(stepMatchPrev(matches, matches[0]!)).toEqual(matches[2]);
  });
});

describe("replaceAllLiteral", () => {
  it("replaces all literal occurrences", () => {
    expect(replaceAllLiteral("a-b-a", "a", "X")).toBe("X-b-X");
  });

  it("returns original when query empty", () => {
    expect(replaceAllLiteral("abc", "", "X")).toBe("abc");
  });
});
