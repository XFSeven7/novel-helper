import assert from "node:assert/strict";
import { groupChaptersByVolumes, UNGROUPED_VOLUME_KEY } from "./outlineVolumeGroups";

const chapters = [
  { filename: "a.md" },
  { filename: "b.md" },
  { filename: "c.md" },
  { filename: "d.md" }
];

{
  const flat = groupChaptersByVolumes(chapters, { volumes: [], ungroupedFilenames: ["a.md", "b.md", "c.md", "d.md"] });
  assert.equal(flat, null);
}

{
  const groups = groupChaptersByVolumes(chapters, {
    volumes: [
      { id: "v2", title: "第二卷", order: 2, chapterFilenames: ["c.md"] },
      { id: "v1", title: "第一卷", order: 1, chapterFilenames: ["a.md", "b.md"] }
    ],
    ungroupedFilenames: ["d.md"]
  });
  assert.ok(groups);
  assert.equal(groups!.length, 3);
  assert.deepEqual(
    groups!.map((g) => [g.key, g.title, g.chapters.map((c) => c.filename)]),
    [
      ["v1", "第一卷", ["a.md", "b.md"]],
      ["v2", "第二卷", ["c.md"]],
      [UNGROUPED_VOLUME_KEY, "未分卷", ["d.md"]]
    ]
  );
}

{
  // reverse chapter list → within-volume order follows that list
  const rev = [...chapters].reverse();
  const groups = groupChaptersByVolumes(rev, {
    volumes: [{ id: "v1", title: "卷1", order: 1, chapterFilenames: ["a.md", "b.md", "c.md"] }],
    ungroupedFilenames: ["d.md"]
  });
  assert.deepEqual(
    groups![0]!.chapters.map((c) => c.filename),
    ["c.md", "b.md", "a.md"]
  );
}

console.log("outlineVolumeGroups.test.ts: ok");
