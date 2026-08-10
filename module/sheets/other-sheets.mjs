import { SYSTEM_ID, ActorSheetV2, ItemSheetV2, HandlebarsMixin, enrich } from "../helpers/compat.mjs";
import { CRAWLER } from "../data/config.mjs";
import * as Dice from "../helpers/rolls.mjs";

export class MobSheet extends HandlebarsMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["crawl", "sheet", "mob"],
    position: { width: 520, height: 560 },
    window: { resizable: true, icon: "fa-solid fa-skull" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollAttack: MobSheet._onAttack,
      rollDamage: MobSheet._onDamage
    }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/actor/mob-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      actor: this.document,
      system: this.document.system,
      editable: this.isEditable,
      traits: await enrich(this.document.system.traits, { relativeTo: this.document })
    });
  }

  static async _onAttack() {
    return Dice.rollCheck({
      actor: this.document,
      label: `Attack — ${this.document.name}`,
      mod: this.document.system.attack,
      dc: Dice.targetDefense()
    });
  }

  static async _onDamage() {
    const roll = await new Roll(this.document.system.damage || "1d6").evaluate();
    return Dice.postDamageCard({
      actor: this.document,
      label: `Damage — ${this.document.name}`,
      roll
    });
  }
}

export class CrawlerItemSheet extends HandlebarsMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["crawl", "sheet", "item"],
    position: { width: 520, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/item/item-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    return Object.assign(context, {
      item,
      system: item.system,
      editable: this.isEditable,
      config: CRAWLER,
      isSkill: item.type === "skill",
      isGear: item.type === "gear",
      isAbility: item.type === "ability",
      description: await enrich(item.system.description, { relativeTo: item })
    });
  }
}
