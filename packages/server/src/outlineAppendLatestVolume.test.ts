import assert from "node:assert/strict";
import { appendChapterToLatestVolume, type OutlineIndex } from "./outlineStore.js";

function base(volumes: OutlineIndex["volumes"], ungrouped: string[]): OutlineIndex {
  return {
    version: 1,
    updatedAt: "",
    book: {},
    volumes,
    ungroupedFilenames: ungrouped,
    chapterPlans: {}
  };
}

{
  const idx = base([], ["a.md", "b.md"]);
  assert.equal(appendChapterToLatestVolume(idx, "b.md"), idx);
}

{
  const idx = base(
    [
      { id: "v1", title: "卷1", order: 1, chapterFilenames: ["a.md"] },
      { id: "v2", title: "卷2", order: 2, chapterFilenames: ["b.md"] }
    ],
    ["c.md"]
  );
  const next = appendChapterToLatestVolume(idx, "c.md");
  assert.deepEqual(next.volumes.find((v) => v.id === "v2")!.chapterFilenames, ["b.md", "c.md"]);
  assert.deepEqual(next.ungroupedFilenames, []);
  assert.deepEqual(next.volumes.find((v) => v.id === "v1")!.chapterFilenames, ["a.md"]);
}

{
  const idx = base([{ id: "v1", title: "卷1", order: 1, chapterFilenames: ["a.md"] }], []);
  const next = appendChapterToLatestVolume(idx, "a.md");
  assert.equal(next, idx);
}

console.log("outlineAppendLatestVolume.test.ts: ok");
