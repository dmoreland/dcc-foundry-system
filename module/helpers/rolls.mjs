import { SYSTEM_ID, render, enrich } from "./compat.mjs";
import { CRAWLER } from "../data/config.mjs";

/** Evade of a target (defaults to the first user-targeted token), or null if there is none. */
export function targetEvade(target = game.user.targets.first()) {
  if (!target) return null;
  const sys = target.actor?.system;
  if (sys?.evade === undefined) return null;
  return typeof sys.evade === "object" ? sys.evade.value : sys.evade;
}

/**
 * Advantage/Disadvantage size gap (Table 9: Creature Size). A 4+ size-class gap grants the
 * smaller side Advantage when attacking up, and gives the larger side Disadvantage (offset by
 * bonus damage) when attacking down. Returns a no-op object if there's no size gap or no target.
 */
export function targetSizeModifier(actor, target = game.user.targets.first()) {
  const none = { advantage: false, disadvantage: false, bonusDamage: 0 };
  const attackerSize = CRAWLER.sizeValues[actor?.system?.size];
  const targetSize = CRAWLER.sizeValues[target?.actor?.system?.size];
  if (attackerSize === undefined || targetSize === undefined) return none;

  const gap = targetSize - attackerSize;
  if (gap >= 4) return { advantage: true, disadvantage: false, bonusDamage: 0 };
  if (gap <= -4) return { advantage: false, disadvantage: true, bonusDamage: attackerSize };
  return none;
}

/** Double the number of dice in each NdX term of a formula (crit rule), leaving flat modifiers alone. */
export function doubleDiceCount(formula) {
  return String(formula ?? "").replace(/(\d+)d(\d+)/gi, (match, count, size) => `${Number(count) * 2}d${size}`);
}

function d20Formula(advantage, disadvantage) {
  if (advantage && !disadvantage) return "2d20kh";
  if (disadvantage && !advantage) return "2d20kl";
  return "1d20";
}

function activeDie(roll) {
  return roll.dice[0]?.results?.find(r => r.active)?.result ?? null;
}

function signed(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * The core resolution roll: d20 (or 2d20kh/kl for Advantage/Disadvantage) + modifier,
 * optionally against a DC. Returns the created ChatMessage so callers can read the total
 * from its flags.
 */
export async function rollCheck({
  actor, label, mod = 0, dc = null, itemId = null, mobAttackIndex = null,
  rank = 0, bonusDamage = 0, extraDamage = "", showDamage = false, advantage = false, disadvantage = false,
  flavor = "", relativeTo = actor
}) {
  const roll = await new Roll(`${d20Formula(advantage, disadvantage)} + @mod`, { mod }).evaluate();
  const die = activeDie(roll);
  const crit = die === 20;
  const fumble = die === 1;
  const success = dc === null ? null : roll.total >= dc;

  const content = await render(`systems/${SYSTEM_ID}/templates/chat/check-card.hbs`, {
    label,
    actorName: actor.name,
    mod,
    modSign: signed(mod),
    total: roll.total,
    die,
    dc,
    success,
    crit,
    fumble,
    showDamage: showDamage && (!!itemId || mobAttackIndex !== null),
    tooltip: await roll.getTooltip(),
    flavor: flavor ? await enrich(flavor, { relativeTo }) : ""
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: {
      [SYSTEM_ID]: {
        actorId: actor.id, tokenId: actor.token?.id ?? null, itemId, mobAttackIndex,
        rank, bonusDamage, extraDamage, total: roll.total, crit, fumble
      }
    }
  });
}

/**
 * Resolve an attack against a target. Mobs never roll their own defense — attacking a Mob
 * (or attacking with no target) resolves immediately against its passive Evade DC. Attacking
 * a Crawler instead posts a pending card: the defender chooses to roll Evade or take the hit.
 */
export async function resolveAttack({
  actor, label, mod, advantage = false, disadvantage = false,
  itemId = null, mobAttackIndex = null, rank = 0, bonusDamage = 0, extraDamage = "",
  target = game.user.targets.first(), flavor = "", relativeTo = actor
}) {
  if (target?.actor?.type === "crawler") {
    return postPendingAttack({ actor, label, mod, advantage, disadvantage, itemId, mobAttackIndex, rank, bonusDamage, extraDamage, target, flavor, relativeTo });
  }
  return rollCheck({
    actor, label, mod, advantage, disadvantage,
    dc: targetEvade(target), itemId, mobAttackIndex, rank, bonusDamage, extraDamage, showDamage: true, flavor, relativeTo
  });
}

async function postPendingAttack({ actor, label, mod, advantage, disadvantage, itemId, mobAttackIndex, rank, bonusDamage, extraDamage, target, flavor, relativeTo }) {
  const roll = await new Roll(`${d20Formula(advantage, disadvantage)} + @mod`, { mod }).evaluate();
  const die = activeDie(roll);
  const crit = die === 20;
  const fumble = die === 1;

  const content = await render(`systems/${SYSTEM_ID}/templates/chat/attack-pending.hbs`, {
    label,
    actorName: actor.name,
    targetName: target.actor.name,
    mod,
    modSign: signed(mod),
    total: roll.total,
    die,
    crit,
    fumble,
    tooltip: await roll.getTooltip(),
    flavor: flavor ? await enrich(flavor, { relativeTo }) : ""
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: {
      [SYSTEM_ID]: {
        actorId: actor.id, tokenId: actor.token?.id ?? null, itemId, mobAttackIndex, rank, bonusDamage, extraDamage,
        attackTotal: roll.total, attackCrit: crit, attackFumble: fumble,
        targetActorId: target.actor.id, targetTokenId: target.document?.id ?? target.id,
        awaitingEvade: true
      }
    }
  });
}

/**
 * Post the result of a defender's response to a pending attack (either an Evade roll or
 * taking the hit outright). `evadeRoll` is null when the defender chose not to roll.
 */
export async function postEvadeResult({
  defenderName, evadeRoll, attackTotal, attackCrit, attackFumble, label,
  attackerActorId, attackerTokenId, itemId, mobAttackIndex, rank, bonusDamage, extraDamage
}) {
  let hit, naturalOne = false, evadeTotal = null, evadeDie = null;

  if (attackFumble) {
    hit = false;
  } else if (attackCrit) {
    hit = true;
  } else if (evadeRoll) {
    evadeDie = activeDie(evadeRoll);
    evadeTotal = evadeRoll.total;
    naturalOne = evadeDie === 1;
    hit = naturalOne || attackTotal >= evadeTotal;
  } else {
    hit = true;
  }

  const content = await render(`systems/${SYSTEM_ID}/templates/chat/evade-card.hbs`, {
    defenderName, label, attackTotal, hit, naturalOne,
    rolled: !!evadeRoll, evadeTotal, evadeDie,
    crit: attackCrit,
    showDamage: hit && (!!itemId || mobAttackIndex !== null)
  });

  return ChatMessage.create({
    content,
    rolls: evadeRoll ? [evadeRoll] : [],
    sound: evadeRoll ? CONFIG.sounds.dice : undefined,
    flags: {
      [SYSTEM_ID]: {
        actorId: attackerActorId, tokenId: attackerTokenId,
        itemId, mobAttackIndex, rank, bonusDamage, extraDamage,
        doubleDamage: naturalOne
      }
    }
  });
}

/** Weapon/spell damage. A crit doubles the number of base damage dice. If the item's
 * "grants a Rank Damage Die" toggle is on (i.e. its own book Upgrade text grants one — this
 * is per-item, not automatic for every weapon), that die and any flat bonus damage (from
 * size) are added afterward, undoubled. */
export async function rollDamage({ actor, item, crit = false, rank = 0, bonusDamage = 0, extraDamage = "", doubleDamage = false }) {
  const dmgAttrSetting = item.system.damageAttribute;
  const attrKey = (dmgAttrSetting && dmgAttrSetting !== "same") ? dmgAttrSetting : item.system.attribute;
  const attrMod = (attrKey && attrKey !== "none") ? (actor.system.attributes?.[attrKey]?.mod ?? 0) : 0;
  const baseDie = item.system.damage || "1d6";
  const die = crit ? doubleDiceCount(baseDie) : baseDie;
  const rankDie = item.system.rankDamageDie
    ? (item.system.rankDamageDieFormula || CRAWLER.rankDamageDie(rank))
    : "";

  let formula = `${die} + @attr`;
  if (rankDie) formula += ` + ${rankDie}`;
  if (extraDamage) formula += ` + ${extraDamage}`;
  if (bonusDamage) formula += ` + ${bonusDamage}`;
  if (doubleDamage) formula = `(${formula}) * 2`;

  const roll = await new Roll(formula, { attr: attrMod }).evaluate();
  return postDamageCard({
    actor,
    label: `${crit ? "Critical damage" : "Damage"} — ${item.name}`,
    roll,
    crit
  });
}

/** Post a plain info card (name + flavor text, no roll) — used for Passive skills, which
 * have nothing to roll but still deserve a way to share their description in chat. */
export async function postInfo({ actor, label, flavor = "", relativeTo = actor }) {
  const content = await render(`systems/${SYSTEM_ID}/templates/chat/info-card.hbs`, {
    label,
    actorName: actor.name,
    flavor: flavor ? await enrich(flavor, { relativeTo }) : ""
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

/**
 * Render and post a damage card. The card carries Apply buttons that damage or heal
 * the currently selected token(s) — those already recompute each target's own Damage
 * Resistance individually, this just previews it for whoever's currently targeted.
 * Returns the created ChatMessage.
 */
export async function postDamageCard({ actor, label, roll, crit = false }) {
  const target = game.user.targets.first();
  const targetSys = target?.actor?.system;
  const dr = targetSys?.damageResistance;
  const targetDR = dr === undefined ? null : (typeof dr === "object" ? dr.value : dr);
  const afterDR = targetDR === null ? null : Math.max(0, roll.total - targetDR);

  const content = await render(`systems/${SYSTEM_ID}/templates/chat/damage-card.hbs`, {
    label,
    actorName: actor.name,
    total: roll.total,
    formula: roll.formula,
    crit,
    tooltip: await roll.getTooltip(),
    targetName: target?.actor?.name ?? null,
    targetDR,
    afterDR
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
 * Post a healing card — a flat number of Health Bar slots, no roll, no attribute, no Damage
 * Resistance (per the book, healing is never a calculation). Carries an Apply Heal button that
 * heals whichever tokens are currently selected on the canvas.
 */
export async function postHealCard({ actor, label, healSlots, flavor = "", relativeTo = actor }) {
  const content = await render(`systems/${SYSTEM_ID}/templates/chat/heal-card.hbs`, {
    label,
    actorName: actor.name,
    healSlots,
    flavor: flavor ? await enrich(flavor, { relativeTo }) : ""
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [SYSTEM_ID]: { actorId: actor.id, healSlots } }
  });
}

/**
 * Heal every selected token the user owns by a flat number of Health Bar slots (no DR, no
 * amount-to-slots conversion — see CrawlerActor#healSlots). Posts a chat notice, reusing the
 * same summary format as applyToSelected.
 */
export async function applyHealSlotsToSelected(slots) {
  const tokens = canvas.tokens?.controlled ?? [];
  if (!tokens.length) return ui.notifications.warn("Select one or more tokens on the canvas first.");

  const results = [];
  for (const token of tokens) {
    const actor = token.actor;
    if (!actor?.isOwner) continue;
    const res = await actor.healSlots?.(slots);
    if (res) results.push(res);
  }
  if (!results.length) return ui.notifications.warn("You don't own any of the selected tokens.");

  const rows = results.map(r => {
    const change = Math.abs(r.after - r.before);
    return `<li><strong>${r.name}</strong> heals ${change} slot${change === 1 ? "" : "s"} (${r.before} → ${r.after}/${r.maxSlots})</li>`;
  }).join("");

  return ChatMessage.create({
    content: `<div class="crawl-notice crawl-heal">
      <span class="crawl-tab">Healed</span>
      <ul class="crawl-apply-list">${rows}</ul></div>`
  });
}

/**
 * Post a Mana-restoration card — a flat amount or a full restore, no roll. Carries an Apply
 * button that restores whichever tokens are currently selected on the canvas.
 */
export async function postManaCard({ actor, label, amount = 0, full = false, flavor = "", relativeTo = actor }) {
  const content = await render(`systems/${SYSTEM_ID}/templates/chat/mana-card.hbs`, {
    label,
    actorName: actor.name,
    amount,
    full,
    flavor: flavor ? await enrich(flavor, { relativeTo }) : ""
  });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [SYSTEM_ID]: { actorId: actor.id, manaAmount: amount, manaFull: full } }
  });
}

/** Restore Mana on every selected token the user owns, by a flat amount or to full. */
export async function applyManaToSelected(amount, full = false) {
  const tokens = canvas.tokens?.controlled ?? [];
  if (!tokens.length) return ui.notifications.warn("Select one or more tokens on the canvas first.");

  const results = [];
  for (const token of tokens) {
    const actor = token.actor;
    if (!actor?.isOwner) continue;
    const res = await actor.restoreMana?.(amount, { full });
    if (res) results.push(res);
  }
  if (!results.length) return ui.notifications.warn("You don't own any of the selected tokens.");

  const rows = results.map(r => {
    const change = Math.abs(r.after - r.before);
    return `<li><strong>${r.name}</strong> regains ${change} Mana (${r.before} → ${r.after}/${r.max})</li>`;
  }).join("");

  return ChatMessage.create({
    content: `<div class="crawl-notice crawl-heal">
      <span class="crawl-tab">Mana Restored</span>
      <ul class="crawl-apply-list">${rows}</ul></div>`
  });
}

const REST_LABELS = {
  short: "Short Rest (2 hours)",
  long: "Long Rest (8 hours)",
  fullday: "Full Day's Rest (30 hours)",
  break: "Took a Break (1 hour)"
};

/** Post a summary of a rest/passive-recovery action (see CrawlerActor#rest) — what HP/Mana
 *  changed and, for a Full Day's Rest, how many Injuries were cleared. */
export async function postRestCard({ actor, type, healResult, manaResult, injuriesCleared = 0 }) {
  const rows = [];
  if (healResult && healResult.after !== healResult.before) {
    rows.push(`<li>Health Bar: ${healResult.before} → ${healResult.after}/${healResult.maxSlots} slots</li>`);
  }
  if (manaResult && manaResult.after !== manaResult.before) {
    rows.push(`<li>Mana: ${manaResult.before} → ${manaResult.after}/${manaResult.max}</li>`);
  }
  if (injuriesCleared) {
    rows.push(`<li>Cleared ${injuriesCleared} Injury effect${injuriesCleared === 1 ? "" : "s"}</li>`);
  }
  if (!rows.length) rows.push("<li>No change — already at full Health and Mana.</li>");

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="crawl-notice crawl-heal">
      <span class="crawl-tab">${REST_LABELS[type] ?? "Rest"}</span>
      <ul class="crawl-apply-list">${rows.join("")}</ul></div>`
  });
}

/**
 * Apply an amount to every selected token the user owns.
 * `multiplier` scales the amount: 1 full, 0.5 half, 2 double, -1 to heal.
 * Posts a single chat notice summarising the result, in Health Bar slots.
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
    return `<li><strong>${r.name}</strong> ${healing ? "heals" : "loses"} ${change} slot${change === 1 ? "" : "s"} (${r.before} → ${r.after}/${r.maxSlots})${tail}</li>`;
  }).join("");

  return ChatMessage.create({
    content: `<div class="crawl-notice ${healing ? "crawl-heal" : "crawl-impact"}">
      <span class="crawl-tab">${healing ? "Healed" : "Impact"}</span>
      <ul class="crawl-apply-list">${rows}</ul></div>`
  });
}
