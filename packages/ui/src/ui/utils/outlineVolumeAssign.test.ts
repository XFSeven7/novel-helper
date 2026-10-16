import assert from "node:assert/strict";
import {
  assignableFilenamesForVolume,
  assignAllContiguousToVolume,
  assignContiguousToVolume,
  removeContiguousFromVolume
} from "./outlineVolumeAssign";
import type { OutlineIndex } from "../api";

const order = ["a.md", "b.md", "c.md", "d.md", "e.md"];

function base(): OutlineIndex {
  return {
    version: 1,
    updatedAt: "",
    book: {},
    volumes: [
      { id: "v1", title: "卷1", order: 1, chapterFilenames: ["a.md", "b.md"] },
      { id: "v2", title: "卷2", order: 2, chapterFilenames: [] }
    ],
    ungroupedFilenames: ["c.md", "d.md", "e.md"],
    chapterPlans: {}
  };
}

{
  const a = assignableFilenamesForVolume(base(), "v2", order);
  assert.deepEqual(a, ["c.md", "d.md", "e.md"]);
}

{
  // cannot pull chapter from earlier volume into v2
  const prev = base();
  prev.volumes[0]!.chapterFilenames = ["a.md", "b.md", "d.md", "e.md"];
  prev.ungroupedFilenames = ["c.md"];
  // v1 has hole with c ungrouped — assignable for v2 starts after v1 max (e)=4 → nothing after
  // Actually volumeEnd for v2 empty = prevVolumeEnd = max(v1)=4 (e), so assignable = []
  const a = assignableFilenamesForVolume(prev, "v2", order);
  assert.deepEqual(a, []);
}

{
  const next = assignContiguousToVolume(base(), "v2", "d.md", order);
  assert.deepEqual(next.volumes.find((v) => v.id === "v2")!.chapterFilenames, ["c.md", "d.md"]);
  assert.deepEqual(next.ungroupedFilenames, ["e.md"]);
  // v1 unchanged
  assert.deepEqual(next.volumes.find((v) => v.id === "v1")!.chapterFilenames, ["a.md", "b.md"]);
}

{
  const next = assignAllContiguousToVolume(base(), "v2", order);
  assert.deepEqual(next.volumes.find((v) => v.id === "v2")!.chapterFilenames, ["c.md", "d.md", "e.md"]);
  assert.deepEqual(next.ungroupedFilenames, []);
}

{
  const filled = assignAllContiguousToVolume(base(), "v2", order);
  const next = removeContiguousFromVolume(filled, "v2", "d.md", order);
  assert.deepEqual(next.volumes.find((v) => v.id === "v2")!.chapterFilenames, ["c.md"]);
  assert.deepEqual(next.ungroupedFilenames, ["d.md", "e.md"]);
}

{
  // assigning into v1 through d pulls c,d (contiguous after b)
  const next = assignContiguousToVolume(base(), "v1", "d.md", order);
  assert.deepEqual(next.volumes.find((v) => v.id === "v1")!.chapterFilenames, [
    "a.md",
    "b.md",
    "c.md",
    "d.md"
  ]);
}

console.log("outlineVolumeAssign.test.ts: ok");
