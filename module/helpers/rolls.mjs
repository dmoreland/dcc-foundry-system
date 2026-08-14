import { SYSTEM_ID, render } from "./compat.mjs";

/** Evade of the first targeted token, or null if nothing is targeted. */
export function targetEvade() {
  const target = game.user.targets.first();
  if (!target) return null;
  const sys = target.actor?.system;
  if (sys?.evade === undefined) return null;
  return typeof sys.evade === "object" ? sys.evade.value : sys.evade;
}

/**
 * The core resolution roll: d20 + modifier, optionally against a DC.
 * Returns the created ChatMessage so callers can read the total from its flags.
 */
export async function rollCheck({ actor, label, mod = 0, dc = null, itemId = null, showDamage = false }) {
  const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
  const die = roll.dice[0]?.results?.find(r => r.active)?.result ?? null;
  const crit = die === 20;
  const fumble = die === 1;
  const success = dc === null ? null : roll.total >= dc;

  const content = await render(`systems/${SYSTEM_ID}/templates/chat/check-card.hbs`, {
    label,
    actorName: actor.name,
    mod,
    modSign: mod >= 0 ? `+${mod}` : `${mod}`,
    total: roll.total,
    die,
    dc,
    success,
    crit,
    fumble,
    showDamage: showDamage && !!itemId,
    tooltip: await roll.getTooltip()
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: {
      [SYSTEM_ID]: { actorId: actor.id, tokenId: actor.token?.id ?? null, itemId, total: roll.total, crit, fumble }
    }
  });
}

/** Weapon damage. A crit adds maximum weapon damage on top of the rolled dice. */
export async function rollDamage({ actor, item, crit = false }) {
  const attrKey = item.system.attribute;
  const attrMod = (attrKey && attrKey !== "none") ? (actor.system.attributes?.[attrKey]?.total ?? 0) : 0;
  const die = item.system.damage || "1d6";

  let formula = `${die} + @attr`;
  let critBonus = 0;
  if (crit) {
    try {
      const max = await new Roll(die).evaluate({ maximize: true });
      critBonus = max.total;
    } catch (err) {
      critBonus = 0;
      formula = `(${die}) * 2 + @attr`;
    }
    if (critBonus) formula = `${die} + ${critBonus} + @attr`;
  }

  const roll = await new Roll(formula, { attr: attrMod }).evaluate();
  return postDamageCard({
    actor,
    label: `${crit ? "Critical damage" : "Damage"} — ${item.name}`,
    roll,
    crit
  });
}

/**
 * Render and post a damage card. The card carries Apply buttons that damage or heal
 * the currently selected token(s). Returns the created ChatMessage.
 */
export async function postDamageCard({ actor, label, roll, crit = false }) {
  const content = await render(`systems/${SYSTEM_ID}/templates/chat/damage-card.hbs`, {
    label,
    actorName: actor.name,
    total: roll.total,
    formula: roll.formula,
    crit
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: { [SYSTEM_ID]: { actorId: actor.id, damage: roll.total } }
  });
}

/**
 * Apply an amount to every selected token the user owns.
 * `multiplier` scales the amount: 1 full, 0.5 half, 2 double, -1 to heal.
 * Posts a single chat notice summarising the result.
 */
export async function applyToSelected(amount, multiplier = 1) {
  const tokens = canvas.tokens?.controlled ?? [];
  if (!tokens.length) return ui.notifications.warn("Select one or more tokens on the canvas first.");

  const results = [];
  for (const token of tokens) {
    const actor = token.actor;
    if (!actor?.isOwner) continue;
    const res = await actor.applyDamage?.(amount, { multiplier });
    if (res) results.push(res);
  }
  if (!results.length) return ui.notifications.warn("You don't own any of the selected tokens.");

  const healing = multiplier < 0;
  const rows = results.map(r => {
    const change = Math.abs(r.after - r.before);
    const tail = r.after === 0 && !healing ? " — down" : "";
    return `<li><strong>${r.name}</strong> ${healing ? "heals" : "takes"} ${change} (${r.before} → ${r.after} HP)${tail}</li>`;
  }).join("");

  return ChatMessage.create({
    content: `<div class="crawl-notice ${healing ? "crawl-heal" : "crawl-impact"}">
      <span class="crawl-tab">${healing ? "Healed" : "Impact"}</span>
      <ul class="crawl-apply-list">${rows}</ul></div>`
  });
}
