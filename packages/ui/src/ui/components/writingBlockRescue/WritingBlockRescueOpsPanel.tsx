import { useMemo, useState } from "react";
import type { ChapterMeta } from "../../api";
import type { RescueRoute, RescueVariant } from "./types";
import { ROUTE_LABELS, VARIANT_LABELS } from "./types";

export type RescuePrediction = {
  id: string;
  createdAt: string;
  length: "short" | "mid" | "long";
  moreChaos: boolean;
  blockNote: string;
  result: any;
  variantByRoute: Record<RescueRoute, RescueVariant>;
  chapterId: number;
  chapterTitle: string;
  title: string; // "剧情推测123" / "生成中…"
  pending?: boolean;
};

export function WritingBlockRescueOpsPanel(props: {
  latestChapter: ChapterMeta | null;
  busy: boolean;
  status: string;
  error: string;
  prediction: RescuePrediction | null;
  onSelectRouteVariant: (route: RescueRoute, variant: RescueVariant) => void;
}) {
  const { latestChapter, busy, status, error, prediction, onSelectRouteVariant } = props;

  const chapterLabel = useMemo(() => {
    if (!latestChapter) return "（未找到最新章节）";
    return `第${latestChapter.id}章 · ${latestChapter.title}`;
  }, [latestChapter]);

  const [routeTab, setRouteTab] = useState<RescueRoute>("event");
  const variant = prediction?.variantByRoute?.[routeTab] ?? "A";
  const item = prediction ? (prediction.result?.[routeTab]?.[variant] as any) : null;

  return (
    <div className="rescueOps" aria-label="卡文急救栏">
      <div className="rescueOpsTitle">卡文急救</div>
      <div className="muted rescueOpsMeta">最新章节：{chapterLabel}</div>
      {status ? <div className="muted rescueOpsMeta">{status}</div> : null}
      {error ? <div className="rescueOpsErr">{error}</div> : null}

      <div className="rescueOpsTabs" role="tablist" aria-label="路线页签">
        {(["event", "emotion", "info"] as RescueRoute[]).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            className={`rescueOpsTab ${routeTab === r ? "active" : ""}`}
            aria-selected={routeTab === r}
            disabled={busy}
            onClick={() => setRouteTab(r)}
          >
            {ROUTE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="rescueVariantTabs" role="tablist" aria-label="A/B/C">
        {(["A", "B", "C"] as RescueVariant[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            className={variant === v ? "active" : ""}
            aria-selected={variant === v}
            disabled={busy || !prediction}
            onClick={() => onSelectRouteVariant(routeTab, v)}
          >
            {v} {VARIANT_LABELS[v]}
          </button>
        ))}
      </div>

      {!prediction || !item ? (
        <div className="muted rescueOpsHint">点击左侧「剧情推测」生成后续剧情走向。</div>
      ) : (
        <div className="rescueOpsResult">
          <div className="rescueField">
            <div className="rescueFieldLabel muted">一句话路线</div>
            <div>{String(item.oneLinePlan || "").trim()}</div>
          </div>
          <div className="rescueField">
            <div className="rescueFieldLabel muted">读者爽点</div>
            <div>{String(item.readerHook || "").trim()}</div>
          </div>
          {String(item.risk || "").trim() ? (
            <div className="rescueField">
              <div className="rescueFieldLabel muted">风险 / 收束</div>
              <div>{String(item.risk || "").trim()}</div>
            </div>
          ) : null}

          {Array.isArray(item.beats) && item.beats.length ? (
            <div className="rescueField">
              <div className="rescueFieldLabel muted">节拍清单</div>
              <ul className="rescueBeats">
                {item.beats.map((b: any, i: number) => (
                  <li key={i}>{String(b)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.sceneCard ? (
            <div className="rescueField">
              <div className="rescueFieldLabel muted">场景卡片</div>
              <div className="rescueSceneCard">
                <div>
                  <span className="muted">目标：</span>
                  {String(item.sceneCard.goal || "")}
                </div>
                <div>
                  <span className="muted">阻力：</span>
                  {String(item.sceneCard.conflict || "")}
                </div>
                <div>
                  <span className="muted">转折：</span>
                  {String(item.sceneCard.turningPoint || "")}
                </div>
                {item.sceneCard.cost ? (
                  <div>
                    <span className="muted">代价：</span>
                    {String(item.sceneCard.cost)}
                  </div>
                ) : null}
                {item.sceneCard.reveal ? (
                  <div>
                    <span className="muted">揭示：</span>
                    {String(item.sceneCard.reveal)}
                  </div>
                ) : null}
                <div>
                  <span className="muted">钩子：</span>
                  {String(item.sceneCard.hook || "")}
                </div>
              </div>
            </div>
          ) : null}

          {Array.isArray(item.decisions) && item.decisions.length ? (
            <div className="rescueField">
              <div className="rescueFieldLabel muted">决策点</div>
              <div className="rescueDecisions">
                {item.decisions.slice(0, 3).map((d: any, i: number) => (
                  <div key={i} className="rescueDecision">
                    <div>
                      <span className="muted">选择：</span>
                      {String(d.choice || "")}
                    </div>
                    <div>
                      <span className="muted">后果：</span>
                      {String(d.consequence || "")}
                    </div>
                    {d.risk ? (
                      <div>
                        <span className="muted">风险：</span>
                        {String(d.risk)}
                      </div>
                    ) : null}
                    {d.whenToUse ? (
                      <div>
                        <span className="muted">适用：</span>
                        {String(d.whenToUse)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {Array.isArray(item.citations) && item.citations.length ? (
            <div className="rescueField">
              <div className="rescueFieldLabel muted">记忆锚点</div>
              <div className="rescueCitations">{item.citations.map((x: any) => String(x)).join(" · ")}</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

