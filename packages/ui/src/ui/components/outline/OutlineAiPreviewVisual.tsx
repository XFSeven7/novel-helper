import React from "react";
import type { ChapterMeta, OutlineIndex, OutlineStageNode } from "../../api";

function StagePreviewList({ stages, depth = 0 }: { stages: OutlineStageNode[]; depth?: number }) {
  return (
    <ol className="outlineAiMainlineList" style={depth > 0 ? { marginLeft: 14 } : undefined}>
      {stages.map((st, i) => (
        <li key={st.id || `${depth}-${i}`}>
          <strong>{st.label || `阶段${i + 1}`}</strong>
          {st.note?.trim() ? <p className="outlineAiPreviewText">{st.note}</p> : null}
          {st.children?.length ? <StagePreviewList stages={st.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ol>
  );
}

const SYNOPSIS_LABELS: { key: keyof NonNullable<OutlineIndex["book"]["synopsis"]>; label: string }[] = [
  { key: "setup", label: "起因" },
  { key: "development", label: "发展" },
  { key: "twist", label: "转折" },
  { key: "climax", label: "高潮" },
  { key: "ending", label: "结局" }
];

export type OutlineAiPreviewVisualProps = {
  preview: Partial<OutlineIndex>;
  chapters: ChapterMeta[];
};

function chapterLabel(filename: string, chapters: ChapterMeta[]): string {
  const c = chapters.find((x) => x.filename === filename);
  if (c) return `${c.id} ${c.title}`.trim();
  const base = filename.replace(/\.md$/i, "");
  const m = base.match(/^(\d+)_(.+)$/);
  return m ? `${m[1]} ${m[2]}` : base;
}

export function OutlineAiPreviewVisual({ preview, chapters }: OutlineAiPreviewVisualProps) {
  const book = preview.book;
  const volumes = preview.volumes || [];
  const plans = preview.chapterPlans || {};
  const planKeys = Object.keys(plans).sort();
  const hasMainline = Boolean(book?.mainlineStages?.length);
  const hasBook =
    book &&
    (book.logline?.trim() ||
      SYNOPSIS_LABELS.some(({ key }) => book.synopsis?.[key]?.trim()) ||
      book.targetWords ||
      book.targetChapters ||
      hasMainline);
  const hasVolumes = volumes.length > 0;
  const hasPlans = planKeys.length > 0;

  if (!hasBook && !hasVolumes && !hasPlans) {
    return <p className="muted">预览为空</p>;
  }

  return (
    <div className="outlineAiPreviewVisual">
      {hasBook ? <BookPreviewSection book={book!} /> : null}
      {hasVolumes ? <VolumesPreviewSection volumes={volumes} chapters={chapters} /> : null}
      {hasPlans ? <ChapterPlansPreviewSection plans={plans} planKeys={planKeys} chapters={chapters} /> : null}
    </div>
  );
}

function BookPreviewSection({ book }: { book: OutlineIndex["book"] }) {
  const syn = book.synopsis || {};
  return (
    <section className="outlineAiPreviewSection">
      <h3 className="outlineAiPreviewHeading">全书</h3>
      {book.logline?.trim() ? (
        <div className="outlineAiPreviewBlock">
          <div className="outlineAiPreviewLabel">一句话梗概</div>
          <p className="outlineAiPreviewText">{book.logline}</p>
        </div>
      ) : null}
      {SYNOPSIS_LABELS.map(({ key, label }) =>
        syn[key]?.trim() ? (
          <div key={key} className="outlineAiPreviewBlock">
            <div className="outlineAiPreviewLabel">{label}</div>
            <p className="outlineAiPreviewText">{syn[key]}</p>
          </div>
        ) : null
      )}
      {book.targetWords || book.targetChapters ? (
        <p className="muted outlineAiPreviewMeta">
          {book.targetWords ? `目标字数 ${book.targetWords.toLocaleString()}` : null}
          {book.targetWords && book.targetChapters ? " · " : null}
          {book.targetChapters ? `目标章数 ${book.targetChapters}` : null}
        </p>
      ) : null}
      {book.mainlineStages?.length ? (
        <div className="outlineAiPreviewBlock">
          <div className="outlineAiPreviewLabel">主线阶段</div>
          <StagePreviewList stages={book.mainlineStages} />
        </div>
      ) : null}
    </section>
  );
}

function VolumesPreviewSection({
  volumes,
  chapters
}: {
  volumes: OutlineIndex["volumes"];
  chapters: ChapterMeta[];
}) {
  const sorted = [...volumes].sort((a, b) => a.order - b.order);
  return (
    <section className="outlineAiPreviewSection">
      <h3 className="outlineAiPreviewHeading">分卷（{sorted.length}）</h3>
      {sorted.map((v) => (
        <article key={v.id} className="outlineAiVolumeCard">
          <header className="outlineAiVolumeCardHead">
            <strong>{v.title}</strong>
            <span className="muted outlineAiVolumeMeta">{v.chapterFilenames.length} 章</span>
          </header>
          {v.synopsis?.trim() ? (
            <p className="outlineAiPreviewText outlineAiVolumeSynopsis">{v.synopsis}</p>
          ) : (
            <p className="muted outlineAiPreviewEmpty">（无卷摘要）</p>
          )}
          {v.chapterFilenames.length ? (
            <ul className="outlineAiVolumeChapters">
              {v.chapterFilenames.map((f) => (
                <li key={f}>{chapterLabel(f, chapters)}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function ChapterPlansPreviewSection({
  plans,
  planKeys,
  chapters
}: {
  plans: OutlineIndex["chapterPlans"];
  planKeys: string[];
  chapters: ChapterMeta[];
}) {
  return (
    <section className="outlineAiPreviewSection">
      <h3 className="outlineAiPreviewHeading">章纲（{planKeys.length}）</h3>
      <div className="outlineAiChapterCards">
        {planKeys.map((filename) => {
          const plan = plans[filename];
          if (!plan) return null;
          return (
            <article key={filename} className="outlineAiChapterCard">
              <header className="outlineAiChapterCardHead">{chapterLabel(filename, chapters)}</header>
              {plan.core?.trim() ? (
                <div className="outlineAiPreviewBlock">
                  <div className="outlineAiPreviewLabel">核心</div>
                  <p className="outlineAiPreviewText">{plan.core}</p>
                </div>
              ) : null}
              {plan.scenes?.trim() ? (
                <div className="outlineAiPreviewBlock">
                  <div className="outlineAiPreviewLabel">场景</div>
                  <p className="outlineAiPreviewText">{plan.scenes}</p>
                </div>
              ) : null}
              {plan.beats?.length ? (
                <div className="outlineAiPreviewBlock">
                  <div className="outlineAiPreviewLabel">情节要点</div>
                  <ul className="outlineAiBeatsList">
                    {plan.beats.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan.hook?.trim() ? (
                <div className="outlineAiPreviewBlock">
                  <div className="outlineAiPreviewLabel">结尾钩子</div>
                  <p className="outlineAiPreviewText">{plan.hook}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
