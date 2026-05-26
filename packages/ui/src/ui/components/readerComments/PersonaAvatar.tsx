import React, { useMemo } from "react";
import multiavatar from "@multiavatar/multiavatar/esm";

export type PersonaAvatarProps = {
  personaId?: string | null;
  kind?: "persona" | "author";
  size?: number;
  className?: string;
};

export function PersonaAvatar({ personaId, kind = "persona", size = 32, className }: PersonaAvatarProps) {
  const svg = useMemo(() => {
    if (kind === "author" || !personaId) return null;
    return multiavatar(personaId);
  }, [kind, personaId]);

  if (kind === "author") {
    return (
      <span
        className={`personaAvatar personaAvatarAuthor ${className ?? ""}`.trim()}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        aria-hidden
      >
        作
      </span>
    );
  }

  if (!svg) return null;

  return (
    <span
      className={`personaAvatar ${className ?? ""}`.trim()}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-hidden
    />
  );
}
