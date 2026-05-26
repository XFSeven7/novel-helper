export type CommentKind = "deep" | "short" | "like";

export type ReplyAuthorKind = "persona" | "author";

export type ReaderCommentReply = {
  id: string;
  authorKind: ReplyAuthorKind;
  personaId: string | null;
  replyToId: string | null;
  text: string;
  createdAt: string;
};

export type ReaderCommentThread = {
  id: string;
  personaId: string;
  kind: CommentKind;
  text: string;
  createdAt: string;
  /** 置顶显示在列表前 */
  pinned?: boolean;
  replies: ReaderCommentReply[];
};

export type ChapterReaderCommentsFile = {
  version: 1;
  contentHash: string;
  generatedAt: string;
  readCount: number;
  threads: ReaderCommentThread[];
  lurkerSample: string[];
};
