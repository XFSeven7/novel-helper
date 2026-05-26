export const CHAT_NEAR_BOTTOM_THRESHOLD_PX = 48;

export function isChatNearBottom(
  el: HTMLElement | null | undefined,
  threshold = CHAT_NEAR_BOTTOM_THRESHOLD_PX
): boolean {
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

export function scrollChatToBottom(
  el: HTMLElement | null | undefined,
  behavior: ScrollBehavior = "auto"
): void {
  if (!el) return;
  if (behavior === "auto") {
    el.scrollTop = el.scrollHeight;
    return;
  }
  el.scrollTo({ top: el.scrollHeight, behavior });
}

/** 双 rAF，等待子节点挂载后再滚（发送后出现「生成中…」） */
export function scrollChatToBottomAfterPaint(
  getEl: () => HTMLElement | null | undefined,
  behavior: ScrollBehavior = "auto"
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => scrollChatToBottom(getEl(), behavior));
  });
}
