import type { RescuePrediction } from "./WritingBlockRescueOpsPanel";
import type { RescueRoute, RescueVariant } from "./types";
import { ROUTE_LABELS, VARIANT_LABELS } from "./types";

const ROUTES: RescueRoute[] = ["event", "emotion", "info"];
const VARIANTS: RescueVariant[] = ["A", "B", "C"];

export function WritingBlockRescueRightPanel(props: {
  prediction: RescuePrediction | null;
  onUpdateVariant: (route: RescueRoute, variant: RescueVariant) => void;
  onCopyToGuidance: (text: string) => void;
  disabled?: boolean;
}) {
  const { prediction, onUpdateVariant, onCopyToGuidance, disabled } = props;

  if (!prediction) {
    return (
      <div className="rescueRightEmpty muted" aria-label="剧情推测详情">
        选择左侧一条「剧情推测」查看详情。
      </div>
    );
  }

  return (
    <div className="rescueRight" aria-label="剧情推测详情">
      <div className="rescueRightHead">
        <div className="rescueRightTitle">剧情推测</div>
        <div className="muted rescueRightMeta">
          {new Date(prediction.createdAt).toLocaleString()} · {prediction.length} · B混沌:{prediction.moreChaos ? "开" : "关"}
        </div>
        {prediction.blockNote ? <div className="muted rescueRightNote">{prediction.blockNote}</div> : null}
      </div>

      <div className="writingBlockRescueCards">
        {ROUTES.map((route) => {
          const variant = prediction.variantByRoute[route];
          const item = prediction.result[route][variant];
          return (
            <article key={route} className="rescueCard">
              <div className="rescueCardHead">
                <h3>{ROUTE_LABELS[route]}</h3>
                <div className="rescueVariantTabs" role="tablist">
                  {VARIANTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      className={variant === v ? "active" : ""}
                      aria-selected={variant === v}
                      disabled={disabled}
                      onClick={() => onUpdateVariant(route, v)}
                    >
                      {v} {VARIANT_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rescueCardBody">
                <div className="rescueField">
                  <div className="rescueFieldLabel muted">一句话路线</div>
                  <div>{item.oneLinePlan}</div>
                </div>
                <div className="rescueField">
                  <div className="rescueFieldLabel muted">读者爽点</div>
                  <div>{item.readerHook}</div>
                </div>
                {item.risk ? (
                  <div className="rescueField">
                    <div className="rescueFieldLabel muted">风险 / 收束</div>
                    <div>{item.risk}</div>
                  </div>
                ) : null}

                <div className="rescueField">
                  <div className="rescueFieldLabel muted">节拍清单</div>
                  <ul className="rescueBeats">
                    {item.beats.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>

                <div className="rescueField">
                  <div className="rescueFieldLabel muted">场景卡片</div>
                  <div className="rescueSceneCard">
                    <div>
                      <span className="muted">目标：</span>
                      {item.sceneCard.goal}
                    </div>
                    <div>
                      <span className="muted">阻力：</span>
                      {item.sceneCard.conflict}
                    </div>
                    <div>
                      <span className="muted">转折：</span>
                      {item.sceneCard.turningPoint}
                    </div>
                    {item.sceneCard.cost ? (
                      <div>
                        <span className="muted">代价：</span>
                        {item.sceneCard.cost}
                      </div>
                    ) : null}
                    {item.sceneCard.reveal ? (
                      <div>
                        <span className="muted">揭示：</span>
                        {item.sceneCard.reveal}
                      </div>
                    ) : null}
                    <div>
                      <span className="muted">钩子：</span>
                      {item.sceneCard.hook}
                    </div>
                  </div>
                </div>

                {item.decisions?.length ? (
                  <div className="rescueField">
                    <div className="rescueFieldLabel muted">决策点</div>
                    <div className="rescueDecisions">
                      {item.decisions.slice(0, 3).map((d, i) => (
                        <div key={i} className="rescueDecision">
                          <div>
                            <span className="muted">选择：</span>
                            {d.choice}
                          </div>
                          <div>
                            <span className="muted">后果：</span>
                            {d.consequence}
                          </div>
                          {d.risk ? (
                            <div>
                              <span className="muted">风险：</span>
                              {d.risk}
                            </div>
                          ) : null}
                          {d.whenToUse ? (
                            <div>
                              <span className="muted">适用：</span>
                              {d.whenToUse}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rescueCardActions">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const text = [
                        `【剧情推测·走向/决策】`,
                        `路线：${ROUTE_LABELS[route]} / 类型：${VARIANT_LABELS[variant]}`,
                        "",
                        `一句话路线：${item.oneLinePlan}`,
                        `爽点：${item.readerHook}`,
                        item.risk ? `风险：${item.risk}` : "",
                        "",
                        "节拍：",
                        ...item.beats.map((x) => `- ${x}`),
                        "",
                        "场景卡片：",
                        `- 目标：${item.sceneCard.goal}`,
                        `- 阻力：${item.sceneCard.conflict}`,
                        `- 转折：${item.sceneCard.turningPoint}`,
                        item.sceneCard.cost ? `- 代价：${item.sceneCard.cost}` : "",
                        item.sceneCard.reveal ? `- 揭示：${item.sceneCard.reveal}` : "",
                        `- 钩子：${item.sceneCard.hook}`,
                        "",
                        item.decisions?.length
                          ? [
                              "决策点：",
                              ...item.decisions.slice(0, 3).flatMap((d) => [
                                `- 选择：${d.choice}`,
                                `  后果：${d.consequence}`,
                                d.risk ? `  风险：${d.risk}` : "",
                                d.whenToUse ? `  适用：${d.whenToUse}` : ""
                              ])
                            ].filter(Boolean)
                          : [],
                        "",
                        "请围绕这些走向与决策讨论下一章怎么推进；禁止输出正文段落/对白。"
                      ]
                        .flat()
                        .filter(Boolean)
                        .join("\n");
                      onCopyToGuidance(text);
                    }}
                  >
                    复制决策提示 → 写作指导讨论
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

