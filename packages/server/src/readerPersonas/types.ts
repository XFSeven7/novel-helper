export type PersonaTier = "deep" | "normal" | "lurker";
export type EmojiStyle = "none" | "light" | "heavy";

export type ReaderPersona = {
  id: string;
  nickname: string;
  archetype: string;
  tier: PersonaTier;
  traits: string[];
  emojiStyle: EmojiStyle;
  templateSlots: {
    like?: string[];
    short?: string[];
    deep?: string[];
  };
  source: "builtin" | "generated";
};

export type CustomPersonasFile = {
  version: 1;
  lastInviteAt?: string;
  personas: ReaderPersona[];
};
