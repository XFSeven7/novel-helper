import React, { useEffect, useState } from "react";
import { listReaderPersonas, type ReaderPersona } from "../../api";
import { PersonaAvatar } from "../readerComments/PersonaAvatar";

const TIER_LABEL: Record<ReaderPersona["tier"], string> = {
  deep: "长评",
  normal: "普通",
  lurker: "潜水"
};

function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const text = e.message.trim();
  if (!text) return "请求失败";
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    /* not JSON */
  }
  return text;
}

function PersonaDetail({ persona }: { persona: ReaderPersona }) {
  const slots = persona.templateSlots;
  return (
    <div className="readerPersonasDetail">
      <p>
        <span className="muted">ID</span> <code>{persona.id}</code>
      </p>
      <p>
        <span className="muted">人设</span> {persona.archetype}
      </p>
      <p>
        <span className="muted">倾向</span> {TIER_LABEL[persona.tier]} · emoji {persona.emojiStyle}
      </p>
      <p>
        <span className="muted">标签</span> {persona.traits.join("、") || "—"}
      </p>
      <p className="muted readerPersonasDetailSlots">
        模板：点赞 {slots.like?.length ?? 0} · 短评 {slots.short?.length ?? 0}
        {slots.deep?.length ? ` · 长评 ${slots.deep.length}` : ""}
      </p>
    </div>
  );
}

export function ReaderPersonasModal(props: { totalHint?: number; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: ReaderPersona[]; total: number; page: number; pageSize: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listReaderPersonas({ q: debouncedQ || undefined, page, pageSize: 50 })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setExpandedId(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(formatApiError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const total = data?.total ?? props.totalHint ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="modalBackdrop" role="presentation" onClick={props.onClose}>
      <div
        className="modalPanel modalPanelOpaque modalPanelLarge readerPersonasModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-personas-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reader-personas-heading" className="modalHeading">
          读者池（共 {total} 位）
        </h2>
        <input
          className="readerPersonasSearch"
          type="search"
          placeholder="搜索昵称或人设…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="搜索读者"
        />
        {error ? <p className="settingsDataDirFeedback settingsDataDirFeedbackErr">{error}</p> : null}
        <div className="readerPersonasList" role="list">
          {loading && !data ? <p className="muted">加载中…</p> : null}
          {!loading && data?.items.length === 0 ? <p className="muted">没有匹配的读者</p> : null}
          {data?.items.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} className={`readerPersonasRow ${expanded ? "isExpanded" : ""}`} role="listitem">
                <button
                  type="button"
                  className="readerPersonasRowBtn"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  aria-expanded={expanded}
                >
                  <PersonaAvatar personaId={p.id} size={28} />
                  <span className="readerPersonasRowMain">
                    <span className="readerPersonasNickname">{p.nickname}</span>
                    <span className="muted readerPersonasArchetype">{p.archetype}</span>
                  </span>
                  <span className="readerPersonasBadges">
                    <span className="readerPersonasBadge">{p.source === "builtin" ? "内置" : "AI"}</span>
                    <span className="readerPersonasBadge">{TIER_LABEL[p.tier]}</span>
                  </span>
                </button>
                {expanded ? <PersonaDetail persona={p} /> : null}
              </div>
            );
          })}
        </div>
        <div className="readerPersonasPager">
          <button
            type="button"
            className="btnSort"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="muted">
            {page} / {maxPage}
          </span>
          <button
            type="button"
            className="btnSort"
            disabled={page >= maxPage || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
        <div className="modalActions">
          <button type="button" className="btnModalSecondary" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
