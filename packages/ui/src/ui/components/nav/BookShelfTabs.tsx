export type BookShelfTabId = "books" | "planning";

export function BookShelfTabs({
  tab,
  onChange,
  disabled
}: {
  tab: BookShelfTabId;
  onChange: (tab: BookShelfTabId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="bookShelfTabs" role="tablist" aria-label="书架视图">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "books"}
        className={`bookShelfTab${tab === "books" ? " bookShelfTabActive" : ""}`}
        disabled={disabled}
        onClick={() => onChange("books")}
      >
        书架
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "planning"}
        className={`bookShelfTab${tab === "planning" ? " bookShelfTabActive" : ""}`}
        disabled={disabled}
        onClick={() => onChange("planning")}
      >
        新书规划
      </button>
    </div>
  );
}
