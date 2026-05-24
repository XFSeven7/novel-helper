import React, { useMemo } from "react";
import { RELATION_TYPE_OPTIONS } from "../../constants/relationTypes";
import {
  filterCharacterSummaries,
  parseAuditCharacters,
  summarizeCharacters,
  type CharacterRelationSummary
} from "../../utils/relationsGraph";

export function RelationsNav({
  busy,
  auditCharactersIndex,
  focusChar,
  onFocusChar,
  search,
  onSearch,
  typeFilter,
  onTypeFilter,
  onlyWithRelations,
  onOnlyWithRelations,
  onAddRelation
}: {
  busy: boolean;
  auditCharactersIndex: unknown;
  focusChar: string | null;
  onFocusChar: (name: string) => void;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string | null;
  onTypeFilter: (v: string | null) => void;
  onlyWithRelations: boolean;
  onOnlyWithRelations: (v: boolean) => void;
  onAddRelation: () => void;
}) {
  const characters = useMemo(() => parseAuditCharacters(auditCharactersIndex), [auditCharactersIndex]);
  const summaries = useMemo(() => summarizeCharacters(characters), [characters]);
  const filtered = useMemo(
    () => filterCharacterSummaries(summaries, search, typeFilter, onlyWithRelations),
    [summaries, search, typeFilter, onlyWithRelations]
  );

  return (
    <div className="relationsNav">
      <div className="relationsNavToolbar">
        <input
          className="relationsNavSearch"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜索角色…"
          disabled={busy}
        />
        <label className="toggle relationsNavToggle">
          <input
            type="checkbox"
            checked={onlyWithRelations}
            onChange={(e) => onOnlyWithRelations(e.target.checked)}
            disabled={busy}
          />
          仅有关系
        </label>
      </div>
      <div className="relationsNavChips" role="group" aria-label="关系类型筛选">
        <button
          type="button"
          className={`relationsNavChip${typeFilter === null ? " relationsNavChipActive" : ""}`}
          disabled={busy}
          onClick={() => onTypeFilter(null)}
        >
          全部
        </button>
        {RELATION_TYPE_OPTIONS.slice(0, 8).map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`relationsNavChip${typeFilter === opt.value ? " relationsNavChipActive" : ""}`}
            disabled={busy}
            title={opt.value}
            onClick={() => onTypeFilter(typeFilter === opt.value ? null : opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="relationsNavList tree navListDense">
        {filtered.length ? (
          filtered.map((s) => (
            <CharacterNavItem
              key={s.name}
              summary={s}
              active={focusChar === s.name}
              busy={busy}
              onSelect={() => onFocusChar(s.name)}
            />
          ))
        ) : (
          <div className="muted auditPanelEmpty">无匹配角色。</div>
        )}
      </div>
      <button type="button" className="btnSort relationsNavAdd" disabled={busy} onClick={onAddRelation}>
        + 添加关系
      </button>
    </div>
  );
}

function CharacterNavItem({
  summary,
  active,
  busy,
  onSelect
}: {
  summary: CharacterRelationSummary;
  active: boolean;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`treeChild chapterNavItem${active ? " active" : ""}`}
      disabled={busy}
      onClick={onSelect}
    >
      <span className="chapterNavItemMain">
        <span className="chapterNavItemTitle">{summary.name}</span>
      </span>
      <span className="chapterNavRightMeta muted">{summary.relationCount || "0"}</span>
    </button>
  );
}
