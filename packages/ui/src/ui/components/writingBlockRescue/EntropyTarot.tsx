import { useCallback, useMemo, useState } from "react";
import type { EntropyCard } from "./types";
import { ENTROPY_CARDS, shuffleDeck } from "./entropyCards";

type DrawSnapshot = {
  deck: EntropyCard[];
  discard: EntropyCard[];
  current: EntropyCard | null;
};

type Props = {
  injectEntropy: boolean;
  onInjectEntropyChange: (v: boolean) => void;
  currentCardId: string | null;
  onCurrentCardChange: (card: EntropyCard | null) => void;
  disabled?: boolean;
};

export function EntropyTarot({
  injectEntropy,
  onInjectEntropyChange,
  currentCardId,
  onCurrentCardChange,
  disabled
}: Props) {
  const [deck, setDeck] = useState<EntropyCard[]>(() => shuffleDeck(ENTROPY_CARDS));
  const [discard, setDiscard] = useState<EntropyCard[]>([]);
  const [history, setHistory] = useState<DrawSnapshot[]>([]);

  const currentCard = useMemo(
    () => (currentCardId ? ENTROPY_CARDS.find((c) => c.id === currentCardId) ?? null : null),
    [currentCardId]
  );

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h, { deck: [...deck], discard: [...discard], current: currentCard }]);
  }, [deck, discard, currentCard]);

  const draw = useCallback(() => {
    pushHistory();
    let nextDeck = deck;
    let nextDiscard = discard;
    if (!nextDeck.length) {
      nextDeck = shuffleDeck(nextDiscard.length ? nextDiscard : ENTROPY_CARDS);
      nextDiscard = [];
    }
    const [picked, ...rest] = nextDeck;
    setDeck(rest);
    setDiscard([...nextDiscard, picked]);
    onCurrentCardChange(picked);
  }, [deck, discard, onCurrentCardChange, pushHistory]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setDeck(prev.deck);
      setDiscard(prev.discard);
      onCurrentCardChange(prev.current);
      return h.slice(0, -1);
    });
  }, [onCurrentCardChange]);

  const reshuffle = useCallback(() => {
    pushHistory();
    setDeck(shuffleDeck(ENTROPY_CARDS));
    setDiscard([]);
    onCurrentCardChange(null);
  }, [onCurrentCardChange, pushHistory]);

  return (
    <div className="entropyTarotMini" aria-label="变量抽卡 Entropy Tarot">
      <div className="entropyTarotMiniTitle">变量抽卡</div>
      {currentCard ? (
        <div className="entropyTarotMiniCard">
          <div className="entropyTarotMiniCardTitle">{currentCard.title}</div>
          <div className="muted entropyTarotMiniCardEffect">{currentCard.effect}</div>
          <div className="entropyTarotMiniCardHook">{currentCard.microPrompt}</div>
        </div>
      ) : (
        <div className="muted entropyTarotMiniEmpty">点「抽卡」获取混沌变量</div>
      )}
      <div className="entropyTarotMiniActions">
        <button type="button" disabled={disabled} onClick={draw}>
          抽卡
        </button>
        <button type="button" disabled={disabled || !history.length} onClick={undo}>
          撤销
        </button>
        <button type="button" disabled={disabled} onClick={reshuffle}>
          洗牌
        </button>
      </div>
      <label className="entropyTarotMiniInject">
        <input
          type="checkbox"
          checked={injectEntropy}
          disabled={disabled || !currentCard}
          onChange={(e) => onInjectEntropyChange(e.target.checked)}
        />
        注入本次生成
      </label>
    </div>
  );
}
