import { SYSTEM_ID, preload, registerSheet, unregisterCoreSheet, onChatCardRender } from "./helpers/compat.mjs";
import { CRAWLER } from "./data/config.mjs";
import { CrawlerData, MobData, SkillData, GearData, AbilityData } from "./data/models.mjs";
import { CrawlerActor, CrawlerItem } from "./documents.mjs";
import { CrawlerSheet } from "./sheets/crawler-sheet.mjs";
import { MobSheet, CrawlerItemSheet } from "./sheets/other-sheets.mjs";
import * as Dice from "./helpers/rolls.mjs";
import { seedWorld } from "./data/seed.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Booting.`);

  CONFIG.CRAWLER = CRAWLER;
  CONFIG.Actor.documentClass = CrawlerActor;
  CONFIG.Item.documentClass = CrawlerItem;
  CONFIG.Actor.dataModels = { crawler: CrawlerData, mob: MobData };
  CONFIG.Item.dataModels = { skill: SkillData, gear: GearData, ability: AbilityData };

  // Initiative is d20 + Dexterity.
  CONFIG.Combat.initiative = { formula: "1d20 + @dex", decimals: 0 };

  game.crawler = {
    CrawlerActor,
    CrawlerItem,
    dice: Dice,
    seedWorld
  };

  registerHandlebarsHelpers();

  unregisterCoreSheet(Actor);
  unregisterCoreSheet(Item);
  registerSheet(Actor, CrawlerSheet, { types: ["crawler"], makeDefault: true, label: "Crawler Sheet" });
  registerSheet(Actor, MobSheet, { types: ["mob"], makeDefault: true, label: "Mob Sheet" });
  registerSheet(Item, CrawlerItemSheet, { types: ["skill", "gear", "ability"], makeDefault: true, label: "Crawl Item Sheet" });

  return preload([
    `systems/${SYSTEM_ID}/templates/actor/crawler-sheet.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/mob-sheet.hbs`,
    `systems/${SYSTEM_ID}/templates/item/item-sheet.hbs`,
    `systems/${SYSTEM_ID}/templates/partials/richtext.hbs`,
    `systems/${SYSTEM_ID}/templates/partials/effects-list.hbs`,
    `systems/${SYSTEM_ID}/templates/chat/check-card.hbs`,
    `systems/${SYSTEM_ID}/templates/chat/damage-card.hbs`,
    `systems/${SYSTEM_ID}/templates/chat/attack-pending.hbs`,
    `systems/${SYSTEM_ID}/templates/chat/evade-card.hbs`
  ]);
});

/* -------------------------------------------- */
/*  Handlebars                                  */
/* -------------------------------------------- */

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("crEq", (a, b) => a === b);
  Handlebars.registerHelper("crSign", value => (Number(value) >= 0 ? `+${value}` : `${value}`));
  Handlebars.registerHelper("crUpper", value => String(value ?? "").toUpperCase());
  Handlebars.registerHelper("crOptions", (choices, selected) => {
    const html = Object.entries(choices ?? {})
      .map(([key, label]) => `<option value="${key}"${key === selected ? " selected" : ""}>${label}</option>`)
      .join("");
    return new Handlebars.SafeString(html);
  });
}

/* -------------------------------------------- */
/*  Chat card buttons                           */
/* -------------------------------------------- */

onChatCardRender((message, html) => {
  const flags = message.flags?.[SYSTEM_ID];
  if (!flags) return;

  for (const button of html.querySelectorAll("[data-crawl-action]")) {
    button.addEventListener("click", async event => {
      event.preventDefault();
      const action = event.currentTarget.dataset.crawlAction;

      // Apply damage/healing acts on the selected token(s), not the card's source actor.
      if (action === "applyDamage") {
        const amount = Number(event.currentTarget.dataset.amount ?? 0);
        const multiplier = Number(event.currentTarget.dataset.multiplier ?? 1);
        return Dice.applyToSelected(amount, multiplier);
      }

      if (action === "evade" || action === "takeHit") {
        const targetActor = resolveTargetActor(flags);
        if (!targetActor) return ui.notifications.warn("That target is no longer available.");
        if (!targetActor.isOwner) return ui.notifications.warn("Only that Crawler's owner (or the GM) can respond.");
        return action === "evade" ? targetActor.rollEvade(flags) : targetActor.skipEvade(flags);
      }

      const actor = resolveActor(flags);
      if (!actor) return ui.notifications.warn("That Crawler is no longer available.");

      if (action === "damage" || action === "crit") {
        const crit = action === "crit";
        if (flags.mobAttackIndex !== null && flags.mobAttackIndex !== undefined) {
          return actor.rollMobDamage(flags.mobAttackIndex, { crit, doubleDamage: flags.doubleDamage });
        }
        const item = actor.items.get(flags.itemId);
        if (!item) return ui.notifications.warn("That weapon is gone.");
        return Dice.rollDamage({
          actor, item, crit,
          rank: flags.rank ?? 0, bonusDamage: flags.bonusDamage ?? 0, doubleDamage: flags.doubleDamage
        });
      }
    });
  }
});

function resolveActor(flags) {
  if (flags.tokenId) {
    const token = canvas.tokens?.get(flags.tokenId);
    if (token?.actor) return token.actor;
  }
  return game.actors.get(flags.actorId);
}

function resolveTargetActor(flags) {
  if (flags.targetTokenId) {
    const token = canvas.tokens?.get(flags.targetTokenId);
    if (token?.actor) return token.actor;
  }
  return game.actors.get(flags.targetActorId);
}
