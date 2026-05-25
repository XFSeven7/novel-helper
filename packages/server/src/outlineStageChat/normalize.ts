import crypto from "node:crypto";
import {
  MAX_STAGE_CHAT_TURNS,
  type StageChatTurn,
  type StageChatTurnPart
} from "./types.js";

function normalizeChatTurnPart(raw: unknown, fallbackAt: string): StageChatTurnPart {
  const o = raw && typeof raw === "object" ? (raw as StageChatTurnPart) : null;
  return {
    content: typeof o?.content === "string" ? o.content : "",
    createdAt: typeof o?.createdAt === "string" ? o.createdAt : fallbackAt
  };
}

function normalizeChatTurn(raw: unknown): StageChatTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as StageChatTurn;
  const id = String(o.id || "").trim() || crypto.randomUUID();
  const now = new Date().toISOString();
  const user = normalizeChatTurnPart(o.user, now);
  const assistant = normalizeChatTurnPart(o.assistant, now);
  if (!user.content && !assistant.content) return null;
  return { id, user, assistant };
}

export function normalizeStageChatTurns(raw: unknown): StageChatTurn[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const turns: StageChatTurn[] = [];
  for (const t of raw) {
    const turn = normalizeChatTurn(t);
    if (turn) turns.push(turn);
  }
  const sliced = turns.slice(-MAX_STAGE_CHAT_TURNS);
  return sliced.length ? sliced : undefined;
}
