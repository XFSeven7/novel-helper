import type { CharacterRole } from "../constants";

export function auditCharacterRoleClass(role: string): string {
  switch (role) {
    case "主角":
      return "auditCharRole auditCharRoleProtagonist";
    case "反派":
      return "auditCharRole auditCharRoleVillain";
    case "盟友":
      return "auditCharRole auditCharRoleAlly";
    case "配角":
      return "auditCharRole auditCharRoleSupporting";
    case "路人":
      return "auditCharRole auditCharRoleExtra";
    default:
      return "auditCharRole auditCharRoleOther";
  }
}

export function auditCharacterNewBadgeClass(v: string): string {
  const t = (v || "").toLowerCase();
  if (t === "new") return "auditCharMeta auditCharMetaNew";
  if (t === "existing") return "auditCharMeta auditCharMetaExisting";
  return "auditCharMeta auditCharMetaUnknown";
}

export function formatAuditCharField(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => formatAuditCharField(x)).filter(Boolean);
    return parts.join("；");
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function isCharacterRole(v: string): v is CharacterRole {
  return ["主角", "配角", "反派", "盟友", "路人", "其他"].includes(String(v || ""));
}

