import React, { useMemo } from "react";
import { parseMobileReadBlocks } from "../../utils/mobileReadLayout";

export function MobileReadView({ content, className }: { content: string; className?: string }) {
  const blocks = useMemo(() => parseMobileReadBlocks(content), [content]);

  return (
    <div className={className} aria-label="移动端排版预览（不修改原文）">
      {blocks.length ? (
        blocks.map((b, i) => {
          if (b.kind === "heading") {
            return (
              <div
                key={i}
                className={`mobileReadHeading mobileReadHeading${Math.min(b.level, 3)}`}
              >
                {b.text}
              </div>
            );
          }
          if (b.kind === "scene") {
            return (
              <div key={i} className="mobileReadScene" aria-hidden>
                * * *
              </div>
            );
          }
          if (b.kind === "dialogue") {
            return (
              <p key={i} className="mobileReadDialogue">
                {b.text}
              </p>
            );
          }
          return (
            <p key={i} className="mobileReadPara">
              {b.text}
            </p>
          );
        })
      ) : (
        <div className="muted mobileReadEmpty">暂无正文</div>
      )}
    </div>
  );
}
