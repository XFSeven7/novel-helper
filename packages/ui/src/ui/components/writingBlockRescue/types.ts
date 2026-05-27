export type RescueLength = "short" | "mid" | "long";
export type RescueRoute = "event" | "emotion" | "info";
export type RescueVariant = "A" | "B" | "C";

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

export type EntropyCardTag = "weather" | "sense" | "sidequest" | "limit";
export type EntropyCard = {
  id: string;
  tag: EntropyCardTag;
  title: string;
  effect: string;
  microPrompt: string;
};

export const ROUTE_LABELS: Record<RescueRoute, string> = {
  event: "事件推进",
  emotion: "情感推进",
  info: "信息推进"
};

export const VARIANT_LABELS: Record<RescueVariant, string> = {
  A: "顺理成章",
  B: "意料之外",
  C: "角色失控"
};
