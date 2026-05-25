const SESSION_TITLE_RE = /\n?【会话标题】[：:]?\s*(.+?)\s*$/;

/** 从首轮 assistant 正文末尾解析会话标题，并从展示正文中移除该行 */
export function splitAssistantSessionTitle(raw: string): {
  content: string;
  sessionTitle?: string;
} {
  const trimmed = raw.trim();
  const m = trimmed.match(SESSION_TITLE_RE);
  if (!m?.[1]) return { content: trimmed };
  const sessionTitle = m[1].trim().slice(0, 14);
  const content = trimmed.replace(SESSION_TITLE_RE, "").trim();
  return sessionTitle ? { content, sessionTitle } : { content: trimmed };
}
