import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterReaderComments } from "../../api";
import {
  deleteReaderCommentThread,
  getChapterReaderComments,
  patchReaderCommentThread,
  replyChapterReaderComment
} from "../../api";
import { PersonaAvatar } from "./PersonaAvatar";
import { ReaderCommentThreadMenu } from "./ReaderCommentThreadMenu";

export type ReaderCommentsTabProps = {
  bookId: string;
  chapterFilename: string | null;
  busy: boolean;
  readerCommentsModelOk: boolean;
  refreshToken?: number;
  generating?: boolean;
  onGoSettings: () => void;
  setStatus: (msg: string) => void;
};

function kindLabel(kind: string) {
  if (kind === "deep") return "长评";
  if (kind === "like") return "点赞";
  return "短评";
}

function displayName(
  authorKind: "persona" | "author",
  personaId: string | null,
  nicknames: Record<string, string>
): string {
  if (authorKind === "author") return "作者";
  return nicknames[personaId ?? ""] ?? personaId ?? "读者";
}

function replyTargetName(
  thread: { personaId: string },
  replies: Array<{ id: string; authorKind: "persona" | "author"; personaId: string | null }>,
  reply: { replyToId: string | null },
  nicknames: Record<string, string>
): string {
  if (!reply.replyToId) {
    return displayName("persona", thread.personaId, nicknames);
  }
  const target = replies.find((x) => x.id === reply.replyToId);
  if (!target) return displayName("persona", thread.personaId, nicknames);
  return displayName(target.authorKind, target.personaId, nicknames);
}

export function ReaderCommentsTab({
  bookId,
  chapterFilename,
  busy,
  readerCommentsModelOk,
  refreshToken = 0,
  generating = false,
  onGoSettings,
  setStatus
}: ReaderCommentsTabProps) {
  const [comments, setComments] = useState<ChapterReaderComments | null>(null);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [loadBusy, setLoadBusy] = useState(false);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [replyToName, setReplyToName] = useState<string>("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!bookId || !chapterFilename) return;
    setLoadBusy(true);
    try {
      const res = await getChapterReaderComments(bookId, chapterFilename);
      setComments(res.comments);
      setNicknames(res.nicknames ?? {});
    } catch {
      setComments(null);
      setNicknames({});
    } finally {
      setLoadBusy(false);
    }
  }, [bookId, chapterFilename]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    setExpandedThreadId(null);
    setReplyToName("");
  }, [chapterFilename]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpandedThreadId(null);
        setReplyToName("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!expandedThreadId) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setExpandedThreadId(null);
      setReplyToName("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [expandedThreadId]);

  const openThreadReply = (threadId: string, targetName: string) => {
    if (expandedThreadId === threadId) {
      setExpandedThreadId(null);
      setReplyToName("");
      return;
    }
    setExpandedThreadId(threadId);
    setReplyToName(targetName);
  };

  const onSubmitReply = async (threadId: string) => {
    const text = (replyDrafts[threadId] ?? "").trim();
    if (!chapterFilename || !text) return;
    setReplyBusyId(threadId);
    try {
      const res = await replyChapterReaderComment(bookId, chapterFilename, threadId, text);
      setComments(res.comments);
      setNicknames(res.nicknames);
      setReplyDrafts((prev) => ({ ...prev, [threadId]: "" }));
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setReplyBusyId(null);
    }
  };

  const onPin = async (threadId: string, pinned: boolean) => {
    if (!chapterFilename) return;
    try {
      const res = await patchReaderCommentThread(bookId, chapterFilename, threadId, pinned);
      setComments(res.comments);
      setNicknames(res.nicknames);
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async (threadId: string) => {
    if (!chapterFilename) return;
    try {
      const res = await deleteReaderCommentThread(bookId, chapterFilename, threadId);
      setComments(res.comments);
      setNicknames(res.nicknames);
      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
      setExpandedThreadId((cur) => {
        if (cur === threadId) setReplyToName("");
        return cur === threadId ? null : cur;
      });
    } catch (e: unknown) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  if (!chapterFilename) {
    return <div className="muted auditPanelEmpty">请选择章节。</div>;
  }

  if (!readerCommentsModelOk) {
    return (
      <div className="auditPanelEmpty">
        <p className="muted">请先在设置中启用模拟评论并配置模型。</p>
        <button type="button" className="btnSquare" onClick={onGoSettings}>
          打开设置
        </button>
      </div>
    );
  }

  const threadCount = comments?.threads.length ?? 0;

  return (
    <div ref={panelRef} className="readerCommentsPanel auditPanel">
      {threadCount > 0 || generating ? (
        <div className="readerCommentsToolbar row">
          <span className="muted readerCommentsStats">
            评论 {threadCount}
            {generating ? " · 生成中…" : null}
          </span>
        </div>
      ) : null}

      {loadBusy && !comments ? <div className="muted">加载中…</div> : null}

      {generating && !threadCount ? (
        <div className="muted auditPanelEmpty">模拟评论后台生成中…</div>
      ) : null}

      {!loadBusy && !generating && !comments?.threads?.length ? (
        <div className="muted auditPanelEmpty">存稿后将自动追加新的模拟评论，已有评论会保留。</div>
      ) : null}

      <div className="readerCommentsThreads">
        {(comments?.threads ?? []).map((thread) => {
          const isExpanded = expandedThreadId === thread.id;
          const mainAuthorName = nicknames[thread.personaId] ?? thread.personaId;
          return (
            <article
              key={thread.id}
              className={[
                "readerCommentThread",
                thread.pinned ? "isPinned" : "",
                isExpanded ? "isExpanded" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div
                className="readerCommentItem readerCommentRow readerCommentClickable"
                role="button"
                tabIndex={0}
                onClick={() => openThreadReply(thread.id, mainAuthorName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openThreadReply(thread.id, mainAuthorName);
                  }
                }}
              >
                <PersonaAvatar personaId={thread.personaId} size={32} />
                <div className="readerCommentBody">
                  <div className="readerCommentMetaHead">
                    <div className="readerCommentMeta">
                      {thread.pinned ? <span className="readerCommentPinBadge">置顶</span> : null}
                      <strong>{nicknames[thread.personaId] ?? thread.personaId}</strong>
                      <span className="muted"> · {kindLabel(thread.kind)}</span>
                    </div>
                    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <ReaderCommentThreadMenu
                        pinned={thread.pinned}
                        disabled={busy || replyBusyId !== null}
                        onPin={(pinned) => void onPin(thread.id, pinned)}
                        onDelete={() => void onDelete(thread.id)}
                      />
                    </div>
                  </div>
                  <div className="readerCommentText">{thread.text}</div>
                </div>
              </div>
              {thread.replies.map((r) => {
                const author = displayName(r.authorKind, r.personaId, nicknames);
                const target = replyTargetName(thread, thread.replies, r, nicknames);
                return (
                  <div
                    key={r.id}
                    className="readerCommentItem readerCommentRow readerCommentReplyLine readerCommentClickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openThreadReply(thread.id, author)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openThreadReply(thread.id, author);
                      }
                    }}
                  >
                    <PersonaAvatar
                      kind={r.authorKind}
                      personaId={r.authorKind === "persona" ? r.personaId : null}
                      size={24}
                    />
                    <div className="readerCommentBody">
                      <p className="readerCommentReplyText">
                        <strong>{author}</strong>
                        <span className="muted"> 回复 </span>
                        <strong>{target}</strong>
                        <span className="readerCommentReplyColon">: </span>
                        <span>{r.text}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
              {isExpanded ? (
                <div
                  className="readerCommentItem readerCommentCompose"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <textarea
                    className="readerCommentTextarea"
                    rows={2}
                    value={replyDrafts[thread.id] ?? ""}
                    placeholder={replyToName ? `回复 ${replyToName}` : "回复…"}
                    disabled={busy || replyBusyId === thread.id}
                    autoFocus
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [thread.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void onSubmitReply(thread.id);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btnSquare readerCommentSendBtn"
                    disabled={
                      busy || replyBusyId === thread.id || !(replyDrafts[thread.id] ?? "").trim()
                    }
                    onClick={() => void onSubmitReply(thread.id)}
                  >
                    {replyBusyId === thread.id ? "发送中…" : "发送"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
