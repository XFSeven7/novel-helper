import { describe, expect, it } from "vitest";
import { readTeachingMarkdown } from "./teaching.js";

describe("readTeachingMarkdown", () => {
  it("reads bundled teaching from app package, not dataDir", async () => {
    const md = await readTeachingMarkdown("/tmp/should-not-exist", "cat-copybook.md");
    expect(md).toContain("抄书练习");
    expect(md).toContain("靶向");
  });
});
