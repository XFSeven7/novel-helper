import React from "react";
import {
  applyMergeAuditCharacters,
  applyMergeAuditPlaces,
  createAuditForeshadow,
  createCharacter,
  hideAuditCharacter,
  hideAuditForeshadow,
  hideAuditOrg,
  hideAuditPlace,
  mergeCharacterCards,
  previewMergeAuditCharacters,
  previewMergeAuditPlaces,
  searchBook
} from "../../api";
import { CHARACTER_ROLE_OPTIONS, type CharacterRole } from "../../constants";
import { auditCharacterNewBadgeClass, auditCharacterRoleClass } from "../../utils/auditCharacters";
import { formatMissingChapterList } from "../../utils/chapterFormat";

export type AppModalsProps = {
  books: any;
  setBooks: any;
  activeBook: any;
  setActiveBook: any;
  chapters: any;
  setChapters: any;
  selectedChapter: any;
  setSelectedChapter: any;
  createBookModalOpen: any;
  setCreateBookModalOpen: any;
  chapterGapModalOpen: any;
  setChapterGapModalOpen: any;
  chapterGapModalBookSlug: any;
  setChapterGapModalBookSlug: any;
  chapterGapModalIndexes: any;
  setChapterGapModalIndexes: any;
  chapterGapModalDraftTitle: any;
  setChapterGapModalDraftTitle: any;
  modalNewTitle: any;
  setModalNewTitle: any;
  modalNewSynopsis: any;
  setModalNewSynopsis: any;
  deleteBookModalOpen: any;
  setDeleteBookModalOpen: any;
  deleteBookTarget: any;
  setDeleteBookTarget: any;
  createCharacterModalOpen: any;
  setCreateCharacterModalOpen: any;
  modalCharacterName: any;
  setModalCharacterName: any;
  modalCharacterRole: any;
  setModalCharacterRole: any;
  modalCharacterTags: any;
  setModalCharacterTags: any;
  modalCharacterTagDraft: any;
  setModalCharacterTagDraft: any;
  chapterContent: any;
  setChapterContent: any;
  status: any;
  setStatus: any;
  busy: any;
  setBusy: any;
  searchOpen: any;
  setSearchOpen: any;
  searchQ: any;
  setSearchQ: any;
  searchBusy: any;
  setSearchBusy: any;
  searchErr: any;
  setSearchErr: any;
  searchGroups: any;
  setSearchGroups: any;
  searchSort: any;
  setSearchSort: any;
  mergeFromEditOpen: any;
  setMergeFromEditOpen: any;
  mergeFromEditSelected: any;
  setMergeFromEditSelected: any;
  mergeFromEditDraft: any;
  setMergeFromEditDraft: any;
  mergeFromEditDraftText: any;
  setMergeFromEditDraftText: any;
  mergeFromEditDraftBusy: any;
  setMergeFromEditDraftBusy: any;
  mobileReading: any;
  setMobileReading: any;
  auditReadModeOn: any;
  setAuditReadModeOn: any;
  polishModeOn: any;
  setPolishModeOn: any;
  expandModeOn: any;
  setExpandModeOn: any;
  chapterTitleSuggestOpen: any;
  setChapterTitleSuggestOpen: any;
  chapterTitleSuggestBusy: any;
  setChapterTitleSuggestBusy: any;
  chapterTitleSuggestErr: any;
  setChapterTitleSuggestErr: any;
  chapterTitleSuggestList: any;
  setChapterTitleSuggestList: any;
  chapterTitleSuggestByStyle: any;
  setChapterTitleSuggestByStyle: any;
  chapterTitleSuggestPicked: any;
  setChapterTitleSuggestPicked: any;
  chapterTitleSuggestStyle: any;
  setChapterTitleSuggestStyle: any;
  auditCharactersIndex: any;
  setAuditCharactersIndex: any;
  auditPlacesIndex: any;
  setAuditPlacesIndex: any;
  auditOrgsIndex: any;
  setAuditOrgsIndex: any;
  auditForeshadowsIndex: any;
  setAuditForeshadowsIndex: any;
  foreshadowCreateOpen: any;
  setForeshadowCreateOpen: any;
  foreshadowCreateTitle: any;
  setForeshadowCreateTitle: any;
  foreshadowCreateStatus: any;
  setForeshadowCreateStatus: any;
  editForeshadowOpen: any;
  setEditForeshadowOpen: any;
  editForeshadowId: any;
  setEditForeshadowId: any;
  editForeshadowTitle: any;
  setEditForeshadowTitle: any;
  editForeshadowStatus: any;
  setEditForeshadowStatus: any;
  editForeshadowLastProgress: any;
  setEditForeshadowLastProgress: any;
  editForeshadowNote: any;
  setEditForeshadowNote: any;
  editForeshadowChapters: any;
  setEditForeshadowChapters: any;
  hiddenForeshadowPanelOpen: any;
  setHiddenForeshadowPanelOpen: any;
  hiddenOrgPanelOpen: any;
  setHiddenOrgPanelOpen: any;
  editOrgOpen: any;
  setEditOrgOpen: any;
  editOrgName: any;
  setEditOrgName: any;
  editOrgDesc: any;
  setEditOrgDesc: any;
  editOrgLastNote: any;
  setEditOrgLastNote: any;
  hiddenPlacePanelOpen: any;
  setHiddenPlacePanelOpen: any;
  editPlaceOpen: any;
  setEditPlaceOpen: any;
  editPlaceName: any;
  setEditPlaceName: any;
  editPlaceDesc: any;
  setEditPlaceDesc: any;
  editPlaceLastNote: any;
  setEditPlaceLastNote: any;
  mergePlaceOpen: any;
  setMergePlaceOpen: any;
  mergePlaceSelected: any;
  setMergePlaceSelected: any;
  mergePlaceDraft: any;
  setMergePlaceDraft: any;
  mergePlaceDraftText: any;
  setMergePlaceDraftText: any;
  mergePlaceDraftBusy: any;
  setMergePlaceDraftBusy: any;
  hiddenCharPanelOpen: any;
  setHiddenCharPanelOpen: any;
  editCharOpen: any;
  setEditCharOpen: any;
  editCharName: any;
  setEditCharName: any;
  editCharRole: any;
  setEditCharRole: any;
  editCharTags: any;
  setEditCharTags: any;
  editCharStateJson: any;
  setEditCharStateJson: any;
  editCharPersonality: any;
  setEditCharPersonality: any;
  editCharSocialProfession: any;
  setEditCharSocialProfession: any;
  editCharSocialClass: any;
  setEditCharSocialClass: any;
  editCharSocialTitles: any;
  setEditCharSocialTitles: any;
  editCharSocialOther: any;
  setEditCharSocialOther: any;
  editCharHistoricalDebts: any;
  setEditCharHistoricalDebts: any;
  editCharOccurredNotes: any;
  setEditCharOccurredNotes: any;
  editCharWant: any;
  setEditCharWant: any;
  editCharNeed: any;
  setEditCharNeed: any;
  editCharMoralCompass: any;
  setEditCharMoralCompass: any;
  editCharFlaws: any;
  setEditCharFlaws: any;
  editCharBlindSpots: any;
  setEditCharBlindSpots: any;
  editCharLinguisticStyle: any;
  setEditCharLinguisticStyle: any;
  editCharCatchphrases: any;
  setEditCharCatchphrases: any;
  editCharMannerisms: any;
  setEditCharMannerisms: any;
  editCharMaskLines: any;
  setEditCharMaskLines: any;
  editCharRelationsLines: any;
  setEditCharRelationsLines: any;
  editCharRelationsFreeText: any;
  setEditCharRelationsFreeText: any;
  editCharLockTags: any;
  setEditCharLockTags: any;
  editCharLockSocialTags: any;
  setEditCharLockSocialTags: any;
  editCharLockHistoricalDebts: any;
  setEditCharLockHistoricalDebts: any;
  editCharLockOccurredNotes: any;
  setEditCharLockOccurredNotes: any;
  editCharLockNarrativeDrives: any;
  setEditCharLockNarrativeDrives: any;
  editCharLockFingerprints: any;
  setEditCharLockFingerprints: any;
  editCharLockRelationalHooks: any;
  setEditCharLockRelationalHooks: any;
  expandModalOpen: any;
  setExpandModalOpen: any;
  expandTargetWords: any;
  setExpandTargetWords: any;
  expandExtraContext: any;
  setExpandExtraContext: any;
  expandBusy: any;
  setExpandBusy: any;
  expandDraft: any;
  setExpandDraft: any;
  searchInputRef: any;
  searchPickBookFirstBtnRef: any;
  chapterGapTitleInputRef: any;
  createBookTitleInputRef: any;
  CHARACTER_TAG_OPTIONS: any;
  applySuggestedChapterTitle: any;
  closeChapterGapModal: any;
  closeDeleteBookModal: any;
  confirmChapterGapFill: any;
  confirmChapterGapSkip: any;
  confirmDeleteBook: any;
  onCreateCharacter: any;
  onExpandWithTargetWords: any;
  openBookFromShelf: any;
  openChapterTitleSuggestModal: any;
  openSearchHit: any;
  runSearchNow: any;
  scheduleSearch: any;
  submitCreateBookModal: any;
  submitCreateForeshadow: any;
  submitEditCharacter: any;
  submitEditForeshadow: any;
  submitEditOrg: any;
  submitEditPlace: any;
  activeModelId: any;
  selectedChapterMeta: any;
};

export function AppModals(props: AppModalsProps) {
  const {
  books,
  setBooks,
  activeBook,
  setActiveBook,
  chapters,
  setChapters,
  selectedChapter,
  setSelectedChapter,
  createBookModalOpen,
  setCreateBookModalOpen,
  chapterGapModalOpen,
  setChapterGapModalOpen,
  chapterGapModalBookSlug,
  setChapterGapModalBookSlug,
  chapterGapModalIndexes,
  setChapterGapModalIndexes,
  chapterGapModalDraftTitle,
  setChapterGapModalDraftTitle,
  modalNewTitle,
  setModalNewTitle,
  modalNewSynopsis,
  setModalNewSynopsis,
  deleteBookModalOpen,
  setDeleteBookModalOpen,
  deleteBookTarget,
  setDeleteBookTarget,
  createCharacterModalOpen,
  setCreateCharacterModalOpen,
  modalCharacterName,
  setModalCharacterName,
  modalCharacterRole,
  setModalCharacterRole,
  modalCharacterTags,
  setModalCharacterTags,
  modalCharacterTagDraft,
  setModalCharacterTagDraft,
  chapterContent,
  setChapterContent,
  status,
  setStatus,
  busy,
  setBusy,
  searchOpen,
  setSearchOpen,
  searchQ,
  setSearchQ,
  searchBusy,
  setSearchBusy,
  searchErr,
  setSearchErr,
  searchGroups,
  setSearchGroups,
  searchSort,
  setSearchSort,
  mergeFromEditOpen,
  setMergeFromEditOpen,
  mergeFromEditSelected,
  setMergeFromEditSelected,
  mergeFromEditDraft,
  setMergeFromEditDraft,
  mergeFromEditDraftText,
  setMergeFromEditDraftText,
  mergeFromEditDraftBusy,
  setMergeFromEditDraftBusy,
  mobileReading,
  setMobileReading,
  auditReadModeOn,
  setAuditReadModeOn,
  polishModeOn,
  setPolishModeOn,
  expandModeOn,
  setExpandModeOn,
  chapterTitleSuggestOpen,
  setChapterTitleSuggestOpen,
  chapterTitleSuggestBusy,
  setChapterTitleSuggestBusy,
  chapterTitleSuggestErr,
  setChapterTitleSuggestErr,
  chapterTitleSuggestList,
  setChapterTitleSuggestList,
  chapterTitleSuggestByStyle,
  setChapterTitleSuggestByStyle,
  chapterTitleSuggestPicked,
  setChapterTitleSuggestPicked,
  chapterTitleSuggestStyle,
  setChapterTitleSuggestStyle,
  auditCharactersIndex,
  setAuditCharactersIndex,
  auditPlacesIndex,
  setAuditPlacesIndex,
  auditOrgsIndex,
  setAuditOrgsIndex,
  auditForeshadowsIndex,
  setAuditForeshadowsIndex,
  foreshadowCreateOpen,
  setForeshadowCreateOpen,
  foreshadowCreateTitle,
  setForeshadowCreateTitle,
  foreshadowCreateStatus,
  setForeshadowCreateStatus,
  editForeshadowOpen,
  setEditForeshadowOpen,
  editForeshadowId,
  setEditForeshadowId,
  editForeshadowTitle,
  setEditForeshadowTitle,
  editForeshadowStatus,
  setEditForeshadowStatus,
  editForeshadowLastProgress,
  setEditForeshadowLastProgress,
  editForeshadowNote,
  setEditForeshadowNote,
  editForeshadowChapters,
  setEditForeshadowChapters,
  hiddenForeshadowPanelOpen,
  setHiddenForeshadowPanelOpen,
  hiddenOrgPanelOpen,
  setHiddenOrgPanelOpen,
  editOrgOpen,
  setEditOrgOpen,
  editOrgName,
  setEditOrgName,
  editOrgDesc,
  setEditOrgDesc,
  editOrgLastNote,
  setEditOrgLastNote,
  hiddenPlacePanelOpen,
  setHiddenPlacePanelOpen,
  editPlaceOpen,
  setEditPlaceOpen,
  editPlaceName,
  setEditPlaceName,
  editPlaceDesc,
  setEditPlaceDesc,
  editPlaceLastNote,
  setEditPlaceLastNote,
  mergePlaceOpen,
  setMergePlaceOpen,
  mergePlaceSelected,
  setMergePlaceSelected,
  mergePlaceDraft,
  setMergePlaceDraft,
  mergePlaceDraftText,
  setMergePlaceDraftText,
  mergePlaceDraftBusy,
  setMergePlaceDraftBusy,
  hiddenCharPanelOpen,
  setHiddenCharPanelOpen,
  editCharOpen,
  setEditCharOpen,
  editCharName,
  setEditCharName,
  editCharRole,
  setEditCharRole,
  editCharTags,
  setEditCharTags,
  editCharStateJson,
  setEditCharStateJson,
  editCharPersonality,
  setEditCharPersonality,
  editCharSocialProfession,
  setEditCharSocialProfession,
  editCharSocialClass,
  setEditCharSocialClass,
  editCharSocialTitles,
  setEditCharSocialTitles,
  editCharSocialOther,
  setEditCharSocialOther,
  editCharHistoricalDebts,
  setEditCharHistoricalDebts,
  editCharOccurredNotes,
  setEditCharOccurredNotes,
  editCharWant,
  setEditCharWant,
  editCharNeed,
  setEditCharNeed,
  editCharMoralCompass,
  setEditCharMoralCompass,
  editCharFlaws,
  setEditCharFlaws,
  editCharBlindSpots,
  setEditCharBlindSpots,
  editCharLinguisticStyle,
  setEditCharLinguisticStyle,
  editCharCatchphrases,
  setEditCharCatchphrases,
  editCharMannerisms,
  setEditCharMannerisms,
  editCharMaskLines,
  setEditCharMaskLines,
  editCharRelationsLines,
  setEditCharRelationsLines,
  editCharRelationsFreeText,
  setEditCharRelationsFreeText,
  editCharLockTags,
  setEditCharLockTags,
  editCharLockSocialTags,
  setEditCharLockSocialTags,
  editCharLockHistoricalDebts,
  setEditCharLockHistoricalDebts,
  editCharLockOccurredNotes,
  setEditCharLockOccurredNotes,
  editCharLockNarrativeDrives,
  setEditCharLockNarrativeDrives,
  editCharLockFingerprints,
  setEditCharLockFingerprints,
  editCharLockRelationalHooks,
  setEditCharLockRelationalHooks,
  expandModalOpen,
  setExpandModalOpen,
  expandTargetWords,
  setExpandTargetWords,
  expandExtraContext,
  setExpandExtraContext,
  expandBusy,
  setExpandBusy,
  expandDraft,
  setExpandDraft,
  searchInputRef,
  searchPickBookFirstBtnRef,
  chapterGapTitleInputRef,
  createBookTitleInputRef,
  CHARACTER_TAG_OPTIONS,
  applySuggestedChapterTitle,
  closeChapterGapModal,
  closeDeleteBookModal,
  confirmChapterGapFill,
  confirmChapterGapSkip,
  confirmDeleteBook,
  onCreateCharacter,
  onExpandWithTargetWords,
  openBookFromShelf,
  openChapterTitleSuggestModal,
  openSearchHit,
  runSearchNow,
  scheduleSearch,
  submitCreateBookModal,
  submitCreateForeshadow,
  submitEditCharacter,
  submitEditForeshadow,
  submitEditOrg,
  submitEditPlace,
  activeModelId,
  selectedChapterMeta
  } = props;

  return (
    <>
{createBookModalOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setCreateBookModalOpen(false);
    }}
  >
    <div
      className="modalPanel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-create-book-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-create-book-heading" className="modalHeading">
        新建书籍
      </h2>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-book-title">
          书名<span className="modalReq">*</span>
        </label>
        <input
          id="modal-book-title"
          ref={createBookTitleInputRef}
          className="modalInput"
          value={modalNewTitle}
          onChange={(e) => setModalNewTitle(e.target.value)}
          placeholder="必填"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && modalNewTitle.trim() && !busy) {
              e.preventDefault();
              void submitCreateBookModal();
            }
          }}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-book-synopsis">
          简介<span className="modalOptional">(选填)</span>
        </label>
        <textarea
          id="modal-book-synopsis"
          className="modalTextarea"
          value={modalNewSynopsis}
          onChange={(e) => setModalNewSynopsis(e.target.value)}
          placeholder="可留空,创建后再补充"
          disabled={busy}
          rows={4}
        />
      </div>
      <div className="modalActions">
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setCreateBookModalOpen(false)}>
          取消
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || !modalNewTitle.trim()}
          onClick={() => void submitCreateBookModal()}
        >
          创建
        </button>
      </div>
    </div>
  </div>
) : null}

{hiddenCharPanelOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setHiddenCharPanelOpen(false);
    }}
  >
    <div
      className="modalPanel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-hidden-chars-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-hidden-chars-heading" className="modalHeading">
        已隐藏角色
      </h2>
      <div className="modalChapterGapBody">
        {(Array.isArray(auditCharactersIndex?.hiddenNames) ? (auditCharactersIndex.hiddenNames as any[]) : [])
          .map((x: any) => String(x).trim())
          .filter(Boolean)
          .map((name) => (
            <div key={name} className="hiddenCharRow">
              <div className="hiddenCharName">{name}</div>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || !activeBook}
                onClick={async () => {
                  if (!activeBook) return;
                  try {
                    const { index } = await hideAuditCharacter(activeBook, { name, hidden: false });
                    setAuditCharactersIndex(index);
                  } catch (e: any) {
                    setStatus(e?.message || String(e));
                  }
                }}
              >
                取消隐藏
              </button>
            </div>
          ))}
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setHiddenCharPanelOpen(false)}
        >
          关闭
        </button>
      </div>
    </div>
  </div>
) : null}

{hiddenPlacePanelOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setHiddenPlacePanelOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-hidden-places-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-hidden-places-heading" className="modalHeading">
        已隐藏地点
      </h2>
      <div className="modalChapterGapBody">
        {(Array.isArray(auditPlacesIndex?.hiddenNames) ? (auditPlacesIndex.hiddenNames as any[]) : [])
          .map((x: any) => String(x).trim())
          .filter(Boolean)
          .map((name) => (
            <div key={name} className="hiddenCharRow">
              <div className="hiddenCharName">{name}</div>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || !activeBook}
                onClick={async () => {
                  if (!activeBook) return;
                  try {
                    const { index } = await hideAuditPlace(activeBook, { name, hidden: false });
                    setAuditPlacesIndex(index);
                  } catch (e: any) {
                    setStatus(e?.message || String(e));
                  }
                }}
              >
                取消隐藏
              </button>
            </div>
          ))}
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setHiddenPlacePanelOpen(false)}
        >
          关闭
        </button>
      </div>
    </div>
  </div>
) : null}

{hiddenOrgPanelOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setHiddenOrgPanelOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-hidden-orgs-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-hidden-orgs-heading" className="modalHeading">
        已隐藏组织
      </h2>
      <div className="modalChapterGapBody">
        {(Array.isArray(auditOrgsIndex?.hiddenNames) ? (auditOrgsIndex.hiddenNames as any[]) : [])
          .map((x: any) => String(x).trim())
          .filter(Boolean)
          .map((name) => (
            <div key={name} className="hiddenCharRow">
              <div className="hiddenCharName">{name}</div>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || !activeBook}
                onClick={async () => {
                  if (!activeBook) return;
                  try {
                    const { index } = await hideAuditOrg(activeBook, { name, hidden: false });
                    setAuditOrgsIndex(index);
                  } catch (e: any) {
                    setStatus(e?.message || String(e));
                  }
                }}
              >
                取消隐藏
              </button>
            </div>
          ))}
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setHiddenOrgPanelOpen(false)}
        >
          关闭
        </button>
      </div>
    </div>
  </div>
) : null}

{editOrgOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setEditOrgOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-edit-org-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-edit-org-heading" className="modalHeading">
        编辑组织:{editOrgName}
      </h2>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-org-desc">
          组织描述
        </label>
        <textarea
          id="modal-edit-org-desc"
          className="modalTextarea"
          value={editOrgDesc}
          onChange={(e) => setEditOrgDesc(e.target.value)}
          disabled={busy}
          rows={6}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-org-note">
          动态(简述)
        </label>
        <textarea
          id="modal-edit-org-note"
          className="modalTextarea"
          value={editOrgLastNote}
          onChange={(e) => setEditOrgLastNote(e.target.value)}
          disabled={busy}
          rows={6}
        />
      </div>
      <div className="modalActions">
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setEditOrgOpen(false)}>
          取消
        </button>
        <button type="button" className="btnModalPrimary" disabled={busy || !activeBook} onClick={() => void submitEditOrg()}>
          保存
        </button>
      </div>
    </div>
  </div>
) : null}

{hiddenForeshadowPanelOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setHiddenForeshadowPanelOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-hidden-foreshadows-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-hidden-foreshadows-heading" className="modalHeading">
        已隐藏伏笔
      </h2>
      <div className="modalChapterGapBody">
        {(Array.isArray(auditForeshadowsIndex?.hiddenIds) ? (auditForeshadowsIndex.hiddenIds as any[]) : [])
          .map((x: any) => String(x).trim())
          .filter(Boolean)
          .map((id) => (
            <div key={id} className="hiddenCharRow">
              <div className="hiddenCharName">
                {(() => {
                  const list = Array.isArray(auditForeshadowsIndex?.foreshadows)
                    ? (auditForeshadowsIndex.foreshadows as any[])
                    : [];
                  const f = list.find((x: any) => String(x?.id || "").trim() === id);
                  return String(f?.title || id);
                })()}
              </div>
              <button
                type="button"
                className="btnModalSecondary"
                disabled={busy || !activeBook}
                onClick={async () => {
                  if (!activeBook) return;
                  try {
                    const { index } = await hideAuditForeshadow(activeBook, { id, hidden: false });
                    setAuditForeshadowsIndex(index);
                  } catch (e: any) {
                    setStatus(e?.message || String(e));
                  }
                }}
              >
                取消隐藏
              </button>
            </div>
          ))}
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setHiddenForeshadowPanelOpen(false)}
        >
          关闭
        </button>
      </div>
    </div>
  </div>
) : null}

{foreshadowCreateOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setForeshadowCreateOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-create-foreshadow-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-create-foreshadow-heading" className="modalHeading">
        新增伏笔
      </h2>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-create-foreshadow-title">
          标题<span className="modalReq">*</span>
        </label>
        <input
          id="modal-create-foreshadow-title"
          className="modalInput"
          value={foreshadowCreateTitle}
          onChange={(e) => setForeshadowCreateTitle(e.target.value)}
          placeholder="例如:神秘戒指的来历"
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-create-foreshadow-status">
          状态
        </label>
        <select
          id="modal-create-foreshadow-status"
          className="modalSelect"
          value={foreshadowCreateStatus}
          onChange={(e) => setForeshadowCreateStatus(e.target.value as any)}
          disabled={busy}
        >
          <option value="open">未回收</option>
          <option value="progress">推进中</option>
          <option value="closed">已回收</option>
        </select>
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setForeshadowCreateOpen(false)}
        >
          取消
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || !activeBook || !foreshadowCreateTitle.trim()}
          onClick={() => void submitCreateForeshadow()}
        >
          创建
        </button>
      </div>
    </div>
  </div>
) : null}

{editForeshadowOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setEditForeshadowOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-edit-foreshadow-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-edit-foreshadow-heading" className="modalHeading">
        编辑伏笔:{editForeshadowTitle || editForeshadowId}
      </h2>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-foreshadow-title">
          标题
        </label>
        <input
          id="modal-edit-foreshadow-title"
          className="modalInput"
          value={editForeshadowTitle}
          onChange={(e) => setEditForeshadowTitle(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-foreshadow-status">
          状态
        </label>
        <select
          id="modal-edit-foreshadow-status"
          className="modalSelect"
          value={editForeshadowStatus}
          onChange={(e) => setEditForeshadowStatus(e.target.value as any)}
          disabled={busy}
        >
          <option value="open">未回收</option>
          <option value="progress">推进中</option>
          <option value="closed">已回收</option>
        </select>
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-foreshadow-chapters">
          出现章节(逗号分隔)
        </label>
        <input
          id="modal-edit-foreshadow-chapters"
          className="modalInput"
          value={editForeshadowChapters}
          onChange={(e) => setEditForeshadowChapters(e.target.value)}
          placeholder="例如:3,7,10"
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-foreshadow-progress">
          最近推进
        </label>
        <textarea
          id="modal-edit-foreshadow-progress"
          className="modalTextarea"
          value={editForeshadowLastProgress}
          onChange={(e) => setEditForeshadowLastProgress(e.target.value)}
          disabled={busy}
          rows={6}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-foreshadow-note">
          备注
        </label>
        <textarea
          id="modal-edit-foreshadow-note"
          className="modalTextarea"
          value={editForeshadowNote}
          onChange={(e) => setEditForeshadowNote(e.target.value)}
          disabled={busy}
          rows={6}
        />
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setEditForeshadowOpen(false)}
        >
          取消
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || !activeBook}
          onClick={() => void submitEditForeshadow()}
        >
          保存
        </button>
      </div>
    </div>
  </div>
) : null}

{expandModalOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!expandBusy && !busy) setExpandModalOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-expand-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-expand-heading" className="modalHeading">
        快速扩写
      </h2>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-expand-words">
          目标字数
        </label>
        <input
          id="modal-expand-words"
          className="modalInput"
          value={expandTargetWords}
          onChange={(e) => setExpandTargetWords(e.target.value)}
          disabled={busy || expandBusy}
          placeholder="例如 2500"
          inputMode="numeric"
        />
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          会自动把全书记忆"压缩摘要"投喂给模型作为已发生事件上下文。
        </div>
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-expand-extra">
          补充:当前发生的事情(可选)
        </label>
        <textarea
          id="modal-expand-extra"
          className="modalTextarea"
          value={expandExtraContext}
          onChange={(e) => setExpandExtraContext(e.target.value)}
          disabled={busy || expandBusy}
          rows={4}
          placeholder="例如:本章此刻主角刚到青石村晒谷场,准备......"
        />
      </div>
      {expandDraft.trim() ? (
        <div className="modalField">
          <label className="modalLabel">已生成扩写稿</label>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            扩写中会直接在编辑区以左右对照展示;你也可以点击"一键更换"替换正文。
          </div>
        </div>
      ) : null}
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy || expandBusy}
          onClick={() => setExpandModalOpen(false)}
        >
          取消
        </button>
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy || expandBusy || !expandDraft.trim()}
          onClick={() => {
            setChapterContent(expandDraft);
            setExpandModalOpen(false);
            setExpandDraft("");
          }}
          title="用扩写结果替换正文"
        >
          一键更换
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || expandBusy}
          onClick={() => {
            const n = Math.floor(Number(expandTargetWords.trim()));
            if (!Number.isFinite(n) || n < 200) {
              setStatus("目标字数需为 >=200 的数字。");
              return;
            }
            setExpandModalOpen(false);
            setMobileReading(false);
            setAuditReadModeOn(false);
            setPolishModeOn(false);
            setExpandModeOn(true);
            void onExpandWithTargetWords(n, expandExtraContext);
          }}
        >
          {expandBusy ? "扩写中..." : "开始扩写"}
        </button>
      </div>
    </div>
  </div>
) : null}

{editPlaceOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setEditPlaceOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-edit-place-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-edit-place-heading" className="modalHeading">
        编辑地点:{editPlaceName}
      </h2>

      <div className="modalTopActions">
        <button
          type="button"
          className="btnSort"
          disabled={busy || !activeBook}
          onClick={() => {
            setMergePlaceOpen((v: any) => !v);
            if (!Object.keys(mergePlaceSelected).some((k) => mergePlaceSelected[k])) setMergePlaceSelected({});
          }}
          title="合并其它地点到当前地点"
        >
          {mergePlaceOpen ? "收起合并" : "合并地点"}
        </button>
      </div>

      {mergePlaceOpen ? (
        <div className="modalField" style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          {(() => {
            const primaryName = editPlaceName.trim();
            const all = Array.isArray(auditPlacesIndex?.places)
              ? (auditPlacesIndex.places as any[])
                  .map((p) => ({ ...p, name: String(p?.name || "").trim() }))
                  .filter((p) => p.name)
              : [];
            const similarityScore = (a: string, b: string) => {
              const A = String(a || "").trim();
              const B = String(b || "").trim();
              if (!A || !B) return -1;
              if (A === B) return 1e9;
              if (A.includes(B) || B.includes(A)) return 5e6 + Math.min(A.length, B.length) * 1000;
              let p = 0;
              for (let i = 0; i < Math.min(A.length, B.length); i++) {
                if (A[i] !== B[i]) break;
                p += 1;
              }
              const s1 = A.slice(0, 12);
              const s2 = B.slice(0, 12);
              const n = s1.length;
              const m = s2.length;
              const dp: number[] = new Array(m + 1);
              for (let j = 0; j <= m; j++) dp[j] = j;
              for (let i = 1; i <= n; i++) {
                let prev = dp[0];
                dp[0] = i;
                for (let j = 1; j <= m; j++) {
                  const tmp = dp[j];
                  const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                  dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
                  prev = tmp;
                }
              }
              const dist = dp[m];
              return p * 100000 - dist * 1000 - Math.abs(A.length - B.length);
            };

            const options = all
              .filter((p) => p.name !== primaryName)
              .map((p) => p.name)
              .sort((a, b) => {
                const sa = similarityScore(primaryName, a);
                const sb = similarityScore(primaryName, b);
                if (sa !== sb) return sb - sa;
                return a.localeCompare(b, "zh-Hans-CN");
              });
            const pickedList = options.filter((n) => mergePlaceSelected[n]);

            const doPreview = async () => {
              if (!activeBook) return;
              const secondaryNames = pickedList;
              if (!primaryName || secondaryNames.length < 1) return;
              setMergePlaceDraftBusy(true);
              setStatus("");
              try {
                const { draft } = await previewMergeAuditPlaces(activeBook, {
                  primaryName,
                  secondaryNames,
                  modelConfigId: null
                });
                setMergePlaceDraft(draft);
                setMergePlaceDraftText(JSON.stringify(draft, null, 2));
              } catch (e: any) {
                setStatus(e?.message || String(e));
              } finally {
                setMergePlaceDraftBusy(false);
              }
            };

            const doApply = async () => {
              if (!activeBook) return;
              const secondaryNames = pickedList;
              if (!primaryName || secondaryNames.length < 1) return;
              if (!mergePlaceDraft) {
                setStatus("请先生成合并预览。");
                return;
              }
              const ok = window.confirm(
                `确认应用合并?\n\n保留:${primaryName}\n合并并移除:${secondaryNames.join("、")}\n\n提示:将按预览草稿写入地点库。`
              );
              if (!ok) return;
              setBusy(true);
              setStatus("");
              try {
                let draftObj: any = mergePlaceDraft;
                const text = mergePlaceDraftText.trim();
                if (text) {
                  try {
                    draftObj = JSON.parse(text);
                  } catch {
                    setStatus("预览 JSON 解析失败,请检查格式。");
                    return;
                  }
                }
                const { index } = await applyMergeAuditPlaces(activeBook, { primaryName, secondaryNames, draft: draftObj });
                setAuditPlacesIndex(index);
                setMergePlaceDraft(draftObj);
                setMergePlaceDraftText(JSON.stringify(draftObj, null, 2));
                setStatus("已合并。");
              } catch (e: any) {
                setStatus(e?.message || String(e));
              } finally {
                setBusy(false);
              }
            };

            return (
              <>
                <div className="muted" style={{ marginBottom: 8 }}>
                  选择要合并进"{primaryName}"的其它地点(可多选)
                </div>
                <div className="checkList">
                  {options.map((n) => (
                    <label key={n} className="checkItem">
                      <input
                        type="checkbox"
                        checked={!!mergePlaceSelected[n]}
                        disabled={busy}
                        onChange={(e) => setMergePlaceSelected((prev: any) => ({ ...prev, [n]: e.target.checked }))}
                      />
                      <span className="checkItemText">{n}</span>
                    </label>
                  ))}
                </div>

                <div className="modalActions" style={{ justifyContent: "flex-start", gap: 8, marginTop: 10 }}>
                  <button type="button" className="btnModalSecondary" disabled={busy || mergePlaceDraftBusy} onClick={() => void doPreview()}>
                    {mergePlaceDraftBusy ? "生成中..." : "生成合并预览(AI)"}
                  </button>
                  <button
                    type="button"
                    className="btnModalSecondary"
                    disabled={busy}
                    onClick={() => {
                      setMergePlaceDraft(null);
                      setMergePlaceDraftText("");
                    }}
                  >
                    清空预览
                  </button>
                  <button
                    type="button"
                    className="btnModalPrimary"
                    disabled={busy || !mergePlaceDraft}
                    onClick={() => void doApply()}
                  >
                    开始合并
                  </button>
                </div>

                {mergePlaceDraftText ? (
                  <div className="modalField" style={{ marginTop: 10 }}>
                    <label className="modalLabel" htmlFor="modal-merge-place-draft">
                      合并预览(可编辑 JSON)
                    </label>
                    <textarea
                      id="modal-merge-place-draft"
                      className="modalTextarea"
                      value={mergePlaceDraftText}
                      onChange={(e) => setMergePlaceDraftText(e.target.value)}
                      disabled={busy}
                      rows={10}
                      spellCheck={false}
                    />
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-place-desc">
          地点描述
        </label>
        <textarea
          id="modal-edit-place-desc"
          className="modalTextarea"
          value={editPlaceDesc}
          onChange={(e) => setEditPlaceDesc(e.target.value)}
          placeholder="如:青石村晒谷场,村民聚集处..."
          disabled={busy}
          rows={6}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-place-note">
          发生的事(简述)
        </label>
        <textarea
          id="modal-edit-place-note"
          className="modalTextarea"
          value={editPlaceLastNote}
          onChange={(e) => setEditPlaceLastNote(e.target.value)}
          placeholder="如:主角与反派第一次冲突..."
          disabled={busy}
          rows={6}
        />
      </div>
      <div className="modalActions">
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setEditPlaceOpen(false)}>
          取消
        </button>
        <button type="button" className="btnModalPrimary" disabled={busy || !activeBook} onClick={() => void submitEditPlace()}>
          保存
        </button>
      </div>
    </div>
  </div>
) : null}

{editCharOpen ? (
  <div
    className="modalBackdrop modalBackdropEditChar"
    role="presentation"
    onClick={() => {
      if (!busy) setEditCharOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge modalPanelEditChar"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-edit-char-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-edit-char-heading" className="modalHeading">
        编辑角色:{editCharName}
      </h2>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          角色合并:用于解决"同一角色被拆成多个角色条目"的情况(合并角色库信息)。
        </div>
        <button
          type="button"
          className="btnSort"
          disabled={busy || !activeBook}
          onClick={() => {
            setMergeFromEditOpen((v: any) => !v);
            if (!Object.keys(mergeFromEditSelected).some((k) => mergeFromEditSelected[k])) {
              // 初次打开时不默认选择,避免误合并
              setMergeFromEditSelected({});
            }
          }}
          title="合并另一张角色卡到当前角色卡"
        >
          {mergeFromEditOpen ? "收起合并" : "合并角色"}
        </button>
      </div>

      {mergeFromEditOpen ? (
        <div className="modalField" style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          {(() => {
            const primaryName = editCharName.trim();
            const all = Array.isArray(auditCharactersIndex?.characters)
              ? (auditCharactersIndex.characters as any[])
                  .map((c) => ({ ...c, name: String(c?.name || "").trim() }))
                  .filter((c) => c.name)
              : [];
            const similarityScore = (a: string, b: string) => {
              const A = String(a || "").trim();
              const B = String(b || "").trim();
              if (!A || !B) return -1;
              if (A === B) return 1e9;
              // 强相关:包含关系
              if (A.includes(B) || B.includes(A)) return 5e6 + Math.min(A.length, B.length) * 1000;
              // 共同前缀长度
              let p = 0;
              for (let i = 0; i < Math.min(A.length, B.length); i++) {
                if (A[i] !== B[i]) break;
                p += 1;
              }
              // 轻量编辑距离(截断到 12 字以内,避免 O(n*m) 放大)
              const s1 = A.slice(0, 12);
              const s2 = B.slice(0, 12);
              const n = s1.length;
              const m = s2.length;
              const dp: number[] = new Array(m + 1);
              for (let j = 0; j <= m; j++) dp[j] = j;
              for (let i = 1; i <= n; i++) {
                let prev = dp[0];
                dp[0] = i;
                for (let j = 1; j <= m; j++) {
                  const tmp = dp[j];
                  const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                  dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
                  prev = tmp;
                }
              }
              const dist = dp[m];
              // 分数越大越相似:前缀优先,其次编辑距离越小越优
              return p * 100000 - dist * 1000 - Math.abs(A.length - B.length);
            };

            const options = all
              .filter((c) => c.name !== primaryName)
              .map((c) => c.name)
              .sort((a, b) => {
                const sa = similarityScore(primaryName, a);
                const sb = similarityScore(primaryName, b);
                if (sa !== sb) return sb - sa;
                return a.localeCompare(b, "zh-Hans-CN");
              });
            const pickedList = options.filter((n) => mergeFromEditSelected[n]);

            const doMerge = async () => {
              if (!activeBook) return;
              const secondaryNames = pickedList;
              if (!primaryName || secondaryNames.length < 1) return;
              if (!mergeFromEditDraft) {
                setStatus("请先生成合并预览。");
                return;
              }
              const ok = window.confirm(
                `确认应用合并?\n\n保留:${primaryName}\n合并并移除:${secondaryNames.join("、")}\n\n提示:将按预览草稿写入角色库,并修正关系引用。`
              );
              if (!ok) return;
              setBusy(true);
              setStatus("");
              try {
                let draftObj: any = mergeFromEditDraft;
                const text = mergeFromEditDraftText.trim();
                if (text) {
                  try {
                    draftObj = JSON.parse(text);
                  } catch (err: any) {
                    throw new Error(`预览 JSON 不是合法 JSON:${err?.message || String(err)}`);
                  }
                }
                const { index } = await applyMergeAuditCharacters(activeBook, {
                  primaryName,
                  secondaryNames,
                  draft: draftObj
                });
                setAuditCharactersIndex(index);
                setMergeFromEditOpen(false);
                setMergeFromEditSelected({});
                setMergeFromEditDraft(null);
                setMergeFromEditDraftText("");
                setStatus("已合并角色(已按预览草稿写入)。");
              } catch (e: any) {
                setStatus(e?.message || String(e));
              } finally {
                setBusy(false);
              }
            };

            return (
              <>
                <div className="muted" style={{ marginBottom: 8 }}>
                  当前角色:{primaryName || "(未命名)"}
                </div>
                {options.length === 0 ? (
                  <div className="muted">当前没有其他角色可合并。</div>
                ) : (
                  <>
                    <label className="modalLabel">选择要合并进来的角色(可多选)</label>
                    <div className="editCharMergeList">
                      {options.map((name) => (
                        <label
                          key={name}
                          className="row"
                          style={{
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 10px",
                            borderBottom: "1px solid var(--border)"
                          }}
                        >
                          <span>{name}</span>
                          <input
                            type="checkbox"
                            checked={!!mergeFromEditSelected[name]}
                            disabled={busy}
                            onChange={(e) =>
                              setMergeFromEditSelected((prev: any) => ({ ...prev, [name]: e.target.checked }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      先用 AI 生成"合并后草稿"并预览,确认后才会真正写入并移除被合并角色。
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                      <button
                        type="button"
                        className="btnSort"
                        disabled={busy || mergeFromEditDraftBusy || pickedList.length < 1 || !activeBook}
                        onClick={async () => {
                          if (!activeBook) return;
                          setMergeFromEditDraftBusy(true);
                          setStatus("");
                          try {
                            const { draft } = await previewMergeAuditCharacters(activeBook, {
                              primaryName,
                              secondaryNames: pickedList,
                              modelConfigId: activeModelId ?? null
                            });
                            setMergeFromEditDraft(draft);
                            try {
                              setMergeFromEditDraftText(JSON.stringify(draft, null, 2));
                            } catch {
                              setMergeFromEditDraftText(String(draft || ""));
                            }
                          } catch (e: any) {
                            setMergeFromEditDraft(null);
                            setMergeFromEditDraftText("");
                            setStatus(e?.message || String(e));
                          } finally {
                            setMergeFromEditDraftBusy(false);
                          }
                        }}
                        title="调用当前活动模型生成合并草稿"
                      >
                        {mergeFromEditDraftBusy ? "生成中..." : "生成合并预览(AI)"}
                      </button>
                      <button
                        type="button"
                        className="btnSort"
                        disabled={busy || mergeFromEditDraftBusy || !mergeFromEditDraft}
                        onClick={() => {
                          setMergeFromEditDraft(null);
                          setMergeFromEditDraftText("");
                        }}
                      >
                        清空预览
                      </button>
                    </div>
                    {mergeFromEditDraftText.trim() ? (
                      <div className="modalField" style={{ marginTop: 10 }}>
                        <label className="modalLabel">合并后草稿预览(JSON)</label>
                        <textarea
                          className="modalTextarea modalTextareaAuto"
                          value={mergeFromEditDraftText}
                          onChange={(e) => setMergeFromEditDraftText(e.target.value)}
                          disabled={busy || mergeFromEditDraftBusy}
                          rows={10}
                        />
                        <div className="muted" style={{ marginTop: 6 }}>
                          你可以在这里手工微调 JSON(会按此内容应用)。不想手改就直接点击"开始合并"。
                        </div>
                      </div>
                    ) : null}
                    <div className="modalActions" style={{ padding: 0, marginTop: 10 }}>
                      <button
                        type="button"
                        className="btnModalPrimary"
                        disabled={busy || pickedList.length < 1 || !mergeFromEditDraft}
                        onClick={() => void doMerge()}
                      >
                        开始合并
                      </button>
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
      ) : null}
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-role">
          身份
        </label>
        <input
          id="modal-edit-char-role"
          className="modalInput modalInputFramed"
          value={editCharRole}
          onChange={(e) => setEditCharRole(e.target.value)}
          placeholder="如:主角/配角/反派..."
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-tags">
          标签<span className="modalOptional">(逗号分隔)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockTags}
            onChange={(e) => setEditCharLockTags(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <textarea
          id="modal-edit-char-tags"
          className="modalTextarea modalTextareaAuto"
          value={editCharTags}
          onChange={(e) => setEditCharTags(e.target.value)}
          placeholder="盟友, 敌对, 神秘..."
          disabled={busy}
          rows={2}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-personality">
          性格分析
        </label>
        <textarea
          id="modal-edit-char-personality"
          className="modalTextarea modalTextareaAuto"
          value={editCharPersonality}
          onChange={(e) => setEditCharPersonality(e.target.value)}
          placeholder="性格、动机、弱点、行为模式..."
          disabled={busy}
          rows={2}
        />
      </div>

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-social-prof">
          社会身份:职业
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockSocialTags}
            onChange={(e) => setEditCharLockSocialTags(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <input
          id="modal-edit-char-social-prof"
          className="modalInput modalInputFramed"
          value={editCharSocialProfession}
          onChange={(e) => setEditCharSocialProfession(e.target.value)}
          placeholder="如:老兵/捕快/商人..."
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-social-class">
          社会身份:阶级
        </label>
        <input
          id="modal-edit-char-social-class"
          className="modalInput modalInputFramed"
          value={editCharSocialClass}
          onChange={(e) => setEditCharSocialClass(e.target.value)}
          placeholder="如:贵族/平民/宗门内门..."
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-social-titles">
          社会身份:头衔<span className="modalOptional">(一行一个)</span>
        </label>
        <textarea
          id="modal-edit-char-social-titles"
          className="modalTextarea"
          value={editCharSocialTitles}
          onChange={(e) => setEditCharSocialTitles(e.target.value)}
          placeholder={"如:镇北将军\n青石村猎户..."}
          disabled={busy}
          rows={4}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-social-other">
          社会身份:其他标签<span className="modalOptional">(一行一个)</span>
        </label>
        <textarea
          id="modal-edit-char-social-other"
          className="modalTextarea"
          value={editCharSocialOther}
          onChange={(e) => setEditCharSocialOther(e.target.value)}
          placeholder={"如:军功在身\n被通缉..."}
          disabled={busy}
          rows={4}
        />
      </div>

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-debts">
          历史债<span className="modalOptional">(一行一个)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockHistoricalDebts}
            onChange={(e) => setEditCharLockHistoricalDebts(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <textarea
          id="modal-edit-char-debts"
          className="modalTextarea"
          value={editCharHistoricalDebts}
          onChange={(e) => setEditCharHistoricalDebts(e.target.value)}
          placeholder={"如:第5章曾杀过人\n欠某人一条命..."}
          disabled={busy}
          rows={5}
        />
      </div>

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-occurred">
          发生过的事情<span className="modalOptional">(一行一个)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockOccurredNotes}
            onChange={(e) => setEditCharLockOccurredNotes(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <textarea
          id="modal-edit-char-occurred"
          className="modalTextarea"
          value={editCharOccurredNotes}
          onChange={(e) => setEditCharOccurredNotes(e.target.value)}
          placeholder={"如:第8章与某人对峙\n在村口救下孩子..."}
          disabled={busy}
          rows={6}
        />
      </div>

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-want">
          Want<span className="modalOptional">(显性目标)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockNarrativeDrives}
            onChange={(e) => setEditCharLockNarrativeDrives(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <input
          id="modal-edit-char-want"
          className="modalInput modalInputFramed"
          value={editCharWant}
          onChange={(e) => setEditCharWant(e.target.value)}
          placeholder="如:复仇/变强/赚一千万..."
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-need">
          Need<span className="modalOptional">(隐性成长)</span>
        </label>
        <input
          id="modal-edit-char-need"
          className="modalInput modalInputFramed"
          value={editCharNeed}
          onChange={(e) => setEditCharNeed(e.target.value)}
          placeholder="如:学会信任/面对恐惧..."
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-moral">
          道德罗盘
        </label>
        <input
          id="modal-edit-char-moral"
          className="modalInput modalInputFramed"
          value={editCharMoralCompass}
          onChange={(e) => setEditCharMoralCompass(e.target.value)}
          placeholder="如:利己/集体主义/底线..."
          disabled={busy}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-flaws">
          缺陷<span className="modalOptional">(一行一个)</span>
        </label>
        <textarea
          id="modal-edit-char-flaws"
          className="modalTextarea"
          value={editCharFlaws}
          onChange={(e) => setEditCharFlaws(e.target.value)}
          placeholder={"如:冲动\n不善表达..."}
          disabled={busy}
          rows={4}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-blind">
          盲点<span className="modalOptional">(一行一个)</span>
        </label>
        <textarea
          id="modal-edit-char-blind"
          className="modalTextarea"
          value={editCharBlindSpots}
          onChange={(e) => setEditCharBlindSpots(e.target.value)}
          placeholder={"如:误以为某人可信\n不了解某势力真实目的..."}
          disabled={busy}
          rows={4}
        />
      </div>

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-ling">
          语气/句式特征<span className="modalOptional">(一行一个,3-7条即可)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockFingerprints}
            onChange={(e) => setEditCharLockFingerprints(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <textarea
          id="modal-edit-char-ling"
          className="modalTextarea"
          value={editCharLinguisticStyle}
          onChange={(e) => setEditCharLinguisticStyle(e.target.value)}
          placeholder={"如:短句居多\n爱反问..."}
          disabled={busy}
          rows={4}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-catch">
          口癖<span className="modalOptional">(一行一个)</span>
        </label>
        <textarea
          id="modal-edit-char-catch"
          className="modalTextarea"
          value={editCharCatchphrases}
          onChange={(e) => setEditCharCatchphrases(e.target.value)}
          placeholder={"如:懂?\n别急..."}
          disabled={busy}
          rows={3}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-man">
          标志性动作<span className="modalOptional">(一行一个)</span>
        </label>
        <textarea
          id="modal-edit-char-man"
          className="modalTextarea"
          value={editCharMannerisms}
          onChange={(e) => setEditCharMannerisms(e.target.value)}
          placeholder={"如:思考时揉指关节\n紧张时摸刀柄..."}
          disabled={busy}
          rows={4}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-mask">
          社交面具<span className="modalOptional">(一行一个:场景=人设)</span>
        </label>
        <textarea
          id="modal-edit-char-mask"
          className="modalTextarea"
          value={editCharMaskLines}
          onChange={(e) => setEditCharMaskLines(e.target.value)}
          placeholder={"如:在部下面前=严厉\n在妻子面前=温柔..."}
          disabled={busy}
          rows={4}
        />
      </div>

      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-relations">
          关系钩子:结构化
          <span className="modalOptional">(一行一个:对方|types=a,b|情感|冲突|秘密1,秘密2)</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={editCharLockRelationalHooks}
            onChange={(e) => setEditCharLockRelationalHooks(e.target.checked)}
            disabled={busy}
          />
          锁定(后续审计不自动改)
        </label>
        <textarea
          id="modal-edit-char-relations"
          className="modalTextarea"
          value={editCharRelationsLines}
          onChange={(e) => setEditCharRelationsLines(e.target.value)}
          placeholder="如:张三|types=narrative.Ally,karma.Contractual|亏欠|债务纠葛|暗号,家族秘闻"
          disabled={busy}
          rows={5}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-rel-free">
          关系钩子:自由文本<span className="modalOptional">(兜底)</span>
        </label>
        <textarea
          id="modal-edit-char-rel-free"
          className="modalTextarea"
          value={editCharRelationsFreeText}
          onChange={(e) => setEditCharRelationsFreeText(e.target.value)}
          placeholder="无法结构化的关系线索..."
          disabled={busy}
          rows={4}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-edit-char-state">
          state<span className="modalOptional">(JSON,可选)</span>
        </label>
        <textarea
          id="modal-edit-char-state"
          className="modalTextarea"
          value={editCharStateJson}
          onChange={(e) => setEditCharStateJson(e.target.value)}
          disabled={busy}
          rows={8}
        />
      </div>
      <div className="modalActions">
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => setEditCharOpen(false)}>
          取消
        </button>
        <button type="button" className="btnModalPrimary" disabled={busy || !activeBook} onClick={() => void submitEditCharacter()}>
          保存
        </button>
      </div>
    </div>
  </div>
) : null}

{chapterGapModalOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) closeChapterGapModal();
    }}
  >
    <div
      className="modalPanel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-chapter-gap-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-chapter-gap-heading" className="modalHeading">
        检测到章节序号空缺
      </h2>
      <p className="modalChapterGapMuted">
        {(() => {
          const m = books.find((bk: any) => bk.slug === chapterGapModalBookSlug);
          return m ? `《${m.title}》` : chapterGapModalBookSlug;
        })()}
      </p>
      <p className="modalChapterGapBody">
        当前空缺:{formatMissingChapterList(chapterGapModalIndexes)}。填写章节标题后,选择补齐最先空缺或跳过空缺接续在最大序号之后。
      </p>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-chapter-gap-title">
          章节标题<span className="modalReq">*</span>
        </label>
        <input
          id="modal-chapter-gap-title"
          ref={chapterGapTitleInputRef}
          className="modalInput"
          value={chapterGapModalDraftTitle}
          onChange={(e) => setChapterGapModalDraftTitle(e.target.value)}
          placeholder="将写入文件名中的标题部分"
          disabled={busy}
        />
      </div>
      <div className="modalActions modalActionsWrap">
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => closeChapterGapModal()}>
          取消
        </button>
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy || !chapterGapModalDraftTitle.trim()}
          onClick={() => void confirmChapterGapSkip()}
        >
          跳过空缺
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || chapterGapModalIndexes.length === 0 || !chapterGapModalDraftTitle.trim()}
          onClick={() => void confirmChapterGapFill()}
        >
          补齐第 {chapterGapModalIndexes[0]} 章
        </button>
      </div>
    </div>
  </div>
) : null}

{chapterTitleSuggestOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy && !chapterTitleSuggestBusy) setChapterTitleSuggestOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge titleSuggestModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-chapter-title-suggest-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-chapter-title-suggest-heading" className="modalHeading">
        章节名候选
      </h2>
      <div className="muted titleSuggestCurrent">
        {selectedChapterMeta ? `当前:${selectedChapterMeta.title}` : ""}
      </div>
      <div className="titleSuggestControls" role="radiogroup" aria-label="章节名生成风格">
        {[
          ["boom", "爆点"],
          ["suspense", "悬疑钩子"],
          ["hotblood", "热血燃"],
          ["funny", "轻松幽默"],
          ["poetic", "文艺质感"],
          ["minimal", "极简有力"],
          ["normal", "中性"]
        ].map(([id, label]) => {
          const disabledStyle = busy || chapterTitleSuggestBusy || !(chapterTitleSuggestByStyle as any)?.[id]?.length;
          return (
            <label key={id} className={`titleSuggestStyleItem ${disabledStyle ? "disabled" : ""}`}>
              <input
                type="radio"
                name="chapterTitleStyle"
                value={id}
                checked={chapterTitleSuggestStyle === (id as any)}
                onChange={() => {
                  const next = id as any;
                  setChapterTitleSuggestStyle(next);
                  const list = (chapterTitleSuggestByStyle as any)?.[id] || [];
                  setChapterTitleSuggestList(list);
                  setChapterTitleSuggestPicked(list[0] || "");
                }}
                disabled={disabledStyle}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
      {chapterTitleSuggestErr ? (
        <div className="auditErrorBox titleSuggestErr">
          <div className="auditErrorTitle">生成失败</div>
          <div className="auditErrorMsg">{chapterTitleSuggestErr}</div>
        </div>
      ) : null}

      {chapterTitleSuggestBusy ? (
        <div className="muted">生成中...</div>
      ) : chapterTitleSuggestList.length ? (
        <div className="titleSuggestList" role="radiogroup" aria-label="章节名候选">
          {chapterTitleSuggestList.map((t: any) => (
            <label key={t} className="titleSuggestItem">
              <input
                type="radio"
                name="chapterTitleSuggest"
                checked={chapterTitleSuggestPicked === t}
                onChange={() => setChapterTitleSuggestPicked(t)}
                disabled={busy}
              />
              <span className="titleSuggestText">{t}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="muted">暂无候选。</div>
      )}

      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy || chapterTitleSuggestBusy}
          onClick={() => setChapterTitleSuggestOpen(false)}
        >
          取消
        </button>
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy || chapterTitleSuggestBusy || !activeBook || !selectedChapter}
          onClick={() => void openChapterTitleSuggestModal()}
        >
          重新生成
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || chapterTitleSuggestBusy || !chapterTitleSuggestPicked.trim()}
          onClick={() => void applySuggestedChapterTitle()}
        >
          使用该标题
        </button>
      </div>
    </div>
  </div>
) : null}

{searchOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!searchBusy) setSearchOpen(false);
    }}
  >
    <div
      className="modalPanel modalPanelOpaque modalPanelLarge searchModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-search-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-search-heading" className="modalHeading">
        全书搜索
      </h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        {(() => {
          const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
          return isMac ? "快捷键:⌘I" : "快捷键:Ctrl+I";
        })()}
      </div>

      {!activeBook ? (
        <div style={{ marginBottom: 12 }}>
          <div className="auditErrorBox" style={{ margin: 0 }}>
            <div className="auditErrorTitle">未选择书籍</div>
            <div className="auditErrorMsg">请选择要搜索的书籍(点击后会自动跳转到该书并在此弹窗内继续搜索)。</div>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {(books || []).map((b: any, idx: any) => (
                <button
                  key={b.slug}
                  type="button"
                  ref={idx === 0 ? searchPickBookFirstBtnRef : undefined}
                  className="chapterEntityItem"
                  disabled={busy}
                  onClick={async () => {
                    await openBookFromShelf(b);
                    window.setTimeout(() => {
                      searchInputRef.current?.focus();
                      if (searchQ.trim()) void runSearchNow(searchQ);
                    }, 0);
                  }}
                  title={`跳转到《${b.title}》`}
                >
                  <span className="chapterEntityName">{b.title}</span>
                  <span className="muted chapterEntityMeta">{b.slug}</span>
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <input
          ref={searchInputRef}
          className="modalInput"
          value={searchQ}
          onChange={(e) => {
            const v = e.target.value;
            setSearchQ(v);
            setSearchErr("");
            scheduleSearch(v);
          }}
          placeholder={activeBook ? "输入关键词(仅搜索章节正文)" : "先选择一本书,然后输入关键词"}
          disabled={busy || !activeBook}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearchNow(searchQ);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              if (!searchBusy) setSearchOpen(false);
            }
          }}
        />
        {activeBook ? (
          <button
            type="button"
            className="btnSquare"
            style={{ padding: "6px 10px", height: 34, lineHeight: "20px", fontSize: 12, whiteSpace: "nowrap" }}
            disabled={busy || searchBusy}
            onClick={() => {
              const next = searchSort === "asc" ? "desc" : "asc";
              setSearchSort(next);
              if (searchQ.trim()) scheduleSearch(searchQ);
            }}
            title="切换排序"
          >
            {searchSort === "asc" ? "正序" : "倒序"}
          </button>
        ) : null}
      </div>

      {searchErr ? (
        <div className="auditErrorBox" style={{ marginTop: 10 }}>
          <div className="auditErrorTitle">搜索失败</div>
          <div className="auditErrorMsg">{searchErr}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 12, maxHeight: "54vh", overflow: "auto" }}>
        {searchGroups.length === 0 ? (
          <div className="muted">输入关键词后会显示结果。</div>
        ) : (
          searchGroups.map((g: any) => (
            <div key={g.kind} style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                章节 · 命中 {g.count}
              </div>
              {(g.hits || []).length ? (
                <div className="writingPackList">
                  {g.hits.map((h: any, idx: any) => (
                    <button
                      key={`${h.kind}-${h.path}-${h.lineNo}-${idx}`}
                      type="button"
                      className="chapterEntityItem"
                      disabled={busy}
                      onClick={() => void openSearchHit(h)}
                      title={`${h.path}:${h.lineNo}`}
                    >
                      <span className="chapterEntityName">
                        {h.title} <span className="muted">L{h.lineNo}</span>
                      </span>
                      <span className="muted chapterEntityMeta">{h.excerpt}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="muted">(本组无结果)</div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="modalActions">
        <button type="button" className="btnModalSecondary" disabled={busy || searchBusy} onClick={() => setSearchOpen(false)}>
          关闭
        </button>
      </div>
    </div>
  </div>
) : null}

{deleteBookModalOpen && deleteBookTarget ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) closeDeleteBookModal();
    }}
  >
    <div
      className="modalPanel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-delete-book-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-delete-book-heading" className="modalHeading">
        废弃书籍
      </h2>
      <p className="modalChapterGapBody">
        确定废弃《{deleteBookTarget.title}》吗?不会删除任何本地内容,但书架将不再展示该书。
      </p>
      <div className="modalActions">
        <button type="button" className="btnModalSecondary" disabled={busy} onClick={() => closeDeleteBookModal()}>
          取消
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy}
          onClick={() => void confirmDeleteBook()}
        >
          确认废弃
        </button>
      </div>
    </div>
  </div>
) : null}

{createCharacterModalOpen ? (
  <div
    className="modalBackdrop"
    role="presentation"
    onClick={() => {
      if (!busy) setCreateCharacterModalOpen(false);
    }}
  >
    <div
      className="modalPanel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-create-character-heading"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-create-character-heading" className="modalHeading">
        新增角色
      </h2>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-character-name">
          角色名<span className="modalReq">*</span>
        </label>
        <input
          id="modal-character-name"
          className="modalInput"
          value={modalCharacterName}
          onChange={(e) => setModalCharacterName(e.target.value)}
          placeholder="必填"
          disabled={busy || !activeBook}
        />
      </div>
      <div className="modalField">
        <label className="modalLabel" htmlFor="modal-character-role">
          身份
        </label>
        <select
          id="modal-character-role"
          className="select"
          value={modalCharacterRole}
          onChange={(e) => setModalCharacterRole(e.target.value as CharacterRole)}
          disabled={busy || !activeBook}
        >
          {CHARACTER_ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="modalField">
        <div className="modalLabel">标签</div>
        <div className="chips">
          {CHARACTER_TAG_OPTIONS.map((t: any) => {
            const active = modalCharacterTags.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={`chip ${active ? "active" : ""}`}
                onClick={() =>
                  setModalCharacterTags((prev: any) =>
                    active ? prev.filter((x: any) => x !== t) : [...prev, t]
                  )
                }
                disabled={busy || !activeBook}
                aria-pressed={active}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input
            value={modalCharacterTagDraft}
            onChange={(e) => setModalCharacterTagDraft(e.target.value)}
            placeholder="输入自定义标签,回车添加"
            disabled={busy || !activeBook}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const t = modalCharacterTagDraft.trim();
              if (!t) return;
              setModalCharacterTags((prev: any) => (prev.includes(t) ? prev : [...prev, t]));
              setModalCharacterTagDraft("");
            }}
          />
          <button
            type="button"
            disabled={busy || !activeBook || !modalCharacterTagDraft.trim()}
            onClick={() => {
              const t = modalCharacterTagDraft.trim();
              if (!t) return;
              setModalCharacterTags((prev: any) => (prev.includes(t) ? prev : [...prev, t]));
              setModalCharacterTagDraft("");
            }}
          >
            添加标签
          </button>
        </div>
        {modalCharacterTags.length ? (
          <div className="chips" style={{ marginTop: 10 }}>
            {modalCharacterTags.map((t: any) => (
              <button
                key={t}
                type="button"
                className="chip active"
                onClick={() => setModalCharacterTags((prev: any) => prev.filter((x: any) => x !== t))}
                disabled={busy || !activeBook}
                title="点击移除"
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="modalActions">
        <button
          type="button"
          className="btnModalSecondary"
          disabled={busy}
          onClick={() => setCreateCharacterModalOpen(false)}
        >
          取消
        </button>
        <button
          type="button"
          className="btnModalPrimary"
          disabled={busy || !activeBook || !modalCharacterName.trim()}
          onClick={() => void onCreateCharacter()}
        >
          创建
        </button>
      </div>
    </div>
  </div>
) : null}
    </>
  );
}
