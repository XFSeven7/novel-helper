import type { BookSetupPlanEntry, BookSetupStepId } from "../../api";

const STEP_LABELS: Record<BookSetupStepId, string> = {
  intent: "意向",
  scale: "体量",
  logline: "一句",
  synopsis: "梗概",
  mainline: "主线",
  volumes: "分卷",
  chapterSkeleton: "章纲",
  meta: "书名",
  review: "总览"
};

function formatPlanTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function BookPlanningNav({
  plans,
  busy,
  hasModel,
  onRefresh,
  onNewPlan,
  onContinue,
  onSuggestTitle,
  onDiscard
}: {
  plans: BookSetupPlanEntry[];
  busy: boolean;
  hasModel: boolean;
  onRefresh: () => void;
  onNewPlan: () => void;
  onContinue: (sessionId: string) => void;
  onSuggestTitle: (sessionId: string) => void;
  onDiscard: (sessionId: string) => void;
}) {
  return (
    <>
      <div className="navTitle navTitleCompact">新书规划</div>
      <p className="navShelfHint navShelfHintCompact muted">本地草案；建书后进入书架。</p>
      <div className="navNewBookRow">
        <button type="button" className="btnNewBookFull btnNewBookPlan" onClick={onNewPlan} disabled={busy || !hasModel}>
          新建规划
        </button>
      </div>
      {!hasModel ? <p className="muted bookPlanningModelHint">请先在设置中配置 AI 模型后再新建规划。</p> : null}
      <div className="navSortBar">
        <button type="button" className="btnSort" disabled={busy} onClick={onRefresh}>
          刷新
        </button>
      </div>
      <div className="tree navListDense bookPlanningList">
        {plans.length === 0 ? (
          <div className="empty muted">暂无进行中的规划。点「新建规划」开始；首次编辑后会出现在此列表。</div>
        ) : (
          plans.map((p) => (
            <div key={p.sessionId} className="bookPlanningItem">
              <div
                role="button"
                tabIndex={busy ? -1 : 0}
                className="treeChild bookPlanningRow"
                onClick={() => {
                  if (busy) return;
                  onContinue(p.sessionId);
                }}
                onKeyDown={(e) => {
                  if (busy) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onContinue(p.sessionId);
                  }
                }}
              >
                <span className="bookPlanningTitle">{p.displayTitle}</span>
                {p.readyToCreate ? <span className="bookPlanningBadge">可创建</span> : null}
                <span className="bookPlanningMeta">
                  {formatPlanTime(p.updatedAt)} · {STEP_LABELS[p.currentStep] ?? p.currentStep}
                </span>
              </div>
              <div className="bookPlanningActions">
                <button
                  type="button"
                  className="btnSort bookPlanningActBtn"
                  disabled={busy || !hasModel}
                  title={hasModel ? "根据草案生成书名" : "请先配置模型"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSuggestTitle(p.sessionId);
                  }}
                >
                  生成标题
                </button>
                <button
                  type="button"
                  className="btnSort bookPlanningActBtn bookPlanningActBtnDanger"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard(p.sessionId);
                  }}
                >
                  废弃
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
