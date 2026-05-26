import { describe, expect, it } from "vitest";
import { isChatNearBottom, scrollChatToBottom } from "./chatScroll";

type MockScrollEl = {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
};

function mockScrollEl(opts: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  return { ...opts } as MockScrollEl as HTMLElement;
}

describe("isChatNearBottom", () => {
  it("true when within threshold", () => {
    const el = mockScrollEl({ scrollHeight: 500, clientHeight: 200, scrollTop: 280 });
    expect(isChatNearBottom(el, 48)).toBe(true);
  });

  it("false when scrolled up", () => {
    const el = mockScrollEl({ scrollHeight: 500, clientHeight: 200, scrollTop: 100 });
    expect(isChatNearBottom(el, 48)).toBe(false);
  });
});

describe("scrollChatToBottom", () => {
  it("sets scrollTop to scrollHeight", () => {
    const el = mockScrollEl({ scrollHeight: 800, clientHeight: 200, scrollTop: 0 });
    scrollChatToBottom(el);
    expect(el.scrollTop).toBe(800);
  });
});
