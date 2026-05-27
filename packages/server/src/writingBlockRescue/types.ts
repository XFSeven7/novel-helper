export type RescueLength = "short" | "mid" | "long";
export type RescueRoute = "event" | "emotion" | "info";
export type RescueVariant = "A" | "B" | "C";

export type EntropyCardTag = "weather" | "sense" | "sidequest" | "limit";
export type EntropyCard = {
  id: string;
  tag: EntropyCardTag;
  title: string;
  effect: string;
  microPrompt: string;
};

export type RescueItem = {
  oneLinePlan: string;
  readerHook: string;
  risk: string;
  beats: string[];
  sceneCard: {
    goal: string;
    conflict: string;
    turningPoint: string;
    cost: string;
    reveal: string;
    hook: string;
  };
  decisions: { choice: string; consequence: string; risk: string; whenToUse: string }[];
  citations: string[];
  newInfo?: boolean;
  oocEdgeTest?: boolean;
};

export type RescueResult = Record<RescueRoute, Record<RescueVariant, RescueItem>>;

export type RescueRequest = {
  bookId: string;
  chapterFilename: string;
  length: RescueLength;
  moreChaos?: boolean;
  cursorHint?: string;
  entropyCardId?: string;
  injectEntropy?: boolean;
};

export function isRescueVariant(v: unknown): v is RescueVariant {
  return v === "A" || v === "B" || v === "C";
}
