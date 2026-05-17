import React from "react";
import type {
  InspirationEventContent,
  InspirationItemContent,
  InspirationLoreContent,
  InspirationOrgContent,
  InspirationPlaceContent,
  InspirationTechniqueContent
} from "../../utils/inspirationParse";

export function InspirationOrgStructuredView({ data }: { data: InspirationOrgContent }) {
  const hooks = Array.isArray(data.relationship_hooks) ? data.relationship_hooks : [];
  const row = (label: string, body: string) =>
    body.trim() ? (
      <div className="inspirationOrgBlock">
        <div className="inspirationOrgLabel">{label}</div>
        <div className="inspirationOrgBody">{body.trim()}</div>
      </div>
    ) : null;
  return (
    <div className="inspirationOrgCard">
      {row("门面 / 对外宗旨", String(data.doctrine || ""))}
      {row("真实图谋 / 潜规则", String(data.hidden_agenda || ""))}
      {row("权力结构", String(data.hierarchy || ""))}
      {row("权力根基 / 核心资源", String(data.power_base || ""))}
      {row("内部派系与矛盾", String(data.internal_factions || ""))}
      {row("进退代价", String(data.entry_exit_cost || ""))}
      {hooks.length ? (
        <div className="inspirationOrgBlock">
          <div className="inspirationOrgLabel">关系钩子</div>
          <div className="inspirationOrgBody inspirationOrgHooks">
            {hooks.map((h, i) => {
              const t = String(h?.target || "").trim();
              const n = String(h?.nature || "").trim();
              const d = String(h?.description || "").trim();
              if (!t && !n && !d) return null;
              return (
                <div key={i} className="inspirationOrgHook">
                  {[t, n].filter(Boolean).join(" · ")}
                  {d ? <div className="inspirationOrgHookDesc">{d}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InspirationItemStructuredView({ data }: { data: InspirationItemContent }) {
  const hooks = Array.isArray(data.relationship_hooks) ? data.relationship_hooks : [];
  const row = (label: string, body: string) =>
    body.trim() ? (
      <div className="inspirationItemBlock">
        <div className="inspirationItemLabel">{label}</div>
        <div className="inspirationItemBody">{body.trim()}</div>
      </div>
    ) : null;
  return (
    <div className="inspirationItemCard">
      {row("外观", String(data.appearance || ""))}
      {row("归属状态", String(data.ownership_status || ""))}
      {row("功能与触发", String(data.functions || ""))}
      {row("限制与代价", String(data.limitations || ""))}
      {row("来历", String(data.origin || ""))}
      {row("叙事钩子", String(data.narrative_hooks || ""))}
      {hooks.length ? (
        <div className="inspirationItemBlock">
          <div className="inspirationItemLabel">关系钩子</div>
          <div className="inspirationItemBody inspirationItemHooks">
            {hooks.map((h, i) => {
              const t = String(h?.target || "").trim();
              const n = String(h?.nature || "").trim();
              const d = String(h?.description || "").trim();
              if (!t && !n && !d) return null;
              return (
                <div key={i} className="inspirationItemHook">
                  {[t, n].filter(Boolean).join(" · ")}
                  {d ? <div className="inspirationItemHookDesc">{d}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InspirationEventStructuredView({ data }: { data: InspirationEventContent }) {
  const hooks = Array.isArray(data.relationship_hooks) ? data.relationship_hooks : [];
  const row = (label: string, body: string) =>
    body.trim() ? (
      <div className="inspirationEventBlock">
        <div className="inspirationEventLabel">{label}</div>
        <div className="inspirationEventBody">{body.trim()}</div>
      </div>
    ) : null;
  return (
    <div className="inspirationEventCard">
      {row("触发诱因", String(data.trigger || ""))}
      {row("过程简述", String(data.description || ""))}
      {row("即时冲击", String(data.impact || ""))}
      {row("二难抉择", String(data.dilemma || ""))}
      {row("业力变动", String(data.karma_delta || ""))}
      {hooks.length ? (
        <div className="inspirationEventBlock">
          <div className="inspirationEventLabel">关系钩子</div>
          <div className="inspirationEventBody inspirationEventHooks">
            {hooks.map((h, i) => {
              const tg = String(h?.target || "").trim();
              const ch = String(h?.change || "").trim();
              if (!tg && !ch) return null;
              return (
                <div key={i} className="inspirationEventHook">
                  {tg}
                  {ch ? <div className="inspirationEventHookDesc">{ch}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InspirationLoreStructuredView({ data }: { data: InspirationLoreContent }) {
  const row = (label: string, body: string) =>
    body.trim() ? (
      <div className="inspirationLoreBlock">
        <div className="inspirationLoreLabel">{label}</div>
        <div className="inspirationLoreBody">{body.trim()}</div>
      </div>
    ) : null;
  return (
    <div className="inspirationLoreCard">
      {row("坊间传闻", String(data.surface_rumor || ""))}
      {row("底层真相", String(data.hidden_truth || ""))}
      {row("物证线索", String(data.evidence_trace || ""))}
      {row("危险权重", String(data.danger_level || ""))}
      {row("叙事价值", String(data.narrative_value || ""))}
    </div>
  );
}

export function InspirationTechniqueStructuredView({ data }: { data: InspirationTechniqueContent }) {
  const row = (label: string, body: string) =>
    body.trim() ? (
      <div className="inspirationTechniqueBlock">
        <div className="inspirationTechniqueLabel">{label}</div>
        <div className="inspirationTechniqueBody">{body.trim()}</div>
      </div>
    ) : null;
  return (
    <div className="inspirationTechniqueCard">
      {row("运行逻辑", String(data.logic_flow || ""))}
      {row("能力展现", String(data.effect || ""))}
      {row("代价与反噬", String(data.backlash || ""))}
      {row("入门门槛", String(data.requirement || ""))}
      {row("来历与血痕", String(data.lore_origin || ""))}
    </div>
  );
}

export function InspirationPlaceStructuredView({ data }: { data: InspirationPlaceContent }) {
  const sf = data.sensory_fingerprints;
  const hooks = Array.isArray(data.relationship_hooks) ? data.relationship_hooks : [];
  const row = (label: string, body: string) =>
    body.trim() ? (
      <div className="inspirationPlaceBlock">
        <div className="inspirationPlaceLabel">{label}</div>
        <div className="inspirationPlaceBody">{body.trim()}</div>
      </div>
    ) : null;
  return (
    <div className="inspirationPlaceCard">
      {row("氛围", String(data.atmosphere || ""))}
      {row("空间布局", String(data.layout || ""))}
      {row("功能用途", String(data.functions || ""))}
      {row("危险与限制", String(data.hazards || ""))}
      {row("隐藏钩子 / 伏笔", String(data.hidden_hooks || ""))}
      {sf && (sf.sound || sf.visual || sf.smell) ? (
        <div className="inspirationPlaceBlock">
          <div className="inspirationPlaceLabel">感官印记</div>
          <div className="inspirationPlaceBody">
            {sf.sound?.trim() ? <div>声:{sf.sound.trim()}</div> : null}
            {sf.visual?.trim() ? <div>视:{sf.visual.trim()}</div> : null}
            {sf.smell?.trim() ? <div>嗅:{sf.smell.trim()}</div> : null}
          </div>
        </div>
      ) : null}
      {hooks.length ? (
        <div className="inspirationPlaceBlock">
          <div className="inspirationPlaceLabel">关系钩子</div>
          <div className="inspirationPlaceBody inspirationPlaceHooks">
            {hooks.map((h, i) => {
              const t = String(h?.target || "").trim();
              const n = String(h?.nature || "").trim();
              const d = String(h?.description || "").trim();
              if (!t && !n && !d) return null;
              return (
                <div key={i} className="inspirationPlaceHook">
                  {[t, n].filter(Boolean).join(" · ")}
                  {d ? <div className="inspirationPlaceHookDesc">{d}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
