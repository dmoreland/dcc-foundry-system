import { SYSTEM_ID, ActorSheetV2, ItemSheetV2, HandlebarsMixin, enrich } from "../helpers/compat.mjs";
import { RichTextMixin } from "../helpers/richtext.mjs";
import { CRAWLER } from "../data/config.mjs";
import * as Dice from "../helpers/rolls.mjs";

export class MobSheet extends RichTextMixin(HandlebarsMixin(ActorSheetV2)) {

  static DEFAULT_OPTIONS = {
    classes: ["crawl", "sheet", "mob"],
    position: { width: 520, height: 700 },
    window: { resizable: true, icon: "fa-solid fa-skull" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollAttack: MobSheet._onAttack,
      rollDamage: MobSheet._onDamage,
      addAttack: MobSheet._onAddAttack,
      removeAttack: MobSheet._onRemoveAttack,
      createEffect: MobSheet._onCreateEffect,
      editEffect: MobSheet._onEditEffect,
      toggleEffect: MobSheet._onToggleEffect,
      deleteEffect: MobSheet._onDeleteEffect
    }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/actor/mob-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    const effects = this.document.effects.map(e => ({
      id: e.id, name: e.name, img: e.img, disabled: e.disabled,
      duration: e.duration?.label || "—"
    }));
    return Object.assign(context, {
      actor: this.document,
      system,
      config: CRAWLER,
      editable: this.isEditable,
      isGM: game.user.isGM,
      effects,
      editing: {
        traits: this.editingFields.has("traits"),
        gmNotes: this.editingFields.has("gmNotes")
      },
      rendered: {
        traits: await enrich(system.traits, { relativeTo: this.document }),
        gmNotes: await enrich(system.gmNotes, { relativeTo: this.document })
      }
    });
  }

  static async _onAttack(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    return this.document.rollMobAttack(index, { advantage: event.shiftKey, disadvantage: event.ctrlKey });
  }

  static async _onDamage(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    return this.document.rollMobDamage(index, { crit: event.shiftKey });
  }

  static async _onAddAttack() {
    return this.document.addAttack();
  }

  static async _onRemoveAttack(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    return this.document.removeAttack(index);
  }

  static async _onCreateEffect() {
    const [effect] = await this.document.createEmbeddedDocuments("ActiveEffect", [{
      name: "New Effect", icon: "icons/svg/aura.svg", disabled: false
    }]);
    return effect?.sheet.render(true);
  }

  static _onEditEffect(event, target) {
    const effect = this.document.effects.get(target.closest("[data-effect-id]").dataset.effectId);
    return effect?.sheet.render(true);
  }

  static async _onToggleEffect(event, target) {
    const effect = this.document.effects.get(target.closest("[data-effect-id]").dataset.effectId);
    return effect?.update({ disabled: !effect.disabled });
  }

  static async _onDeleteEffect(event, target) {
    const effect = this.document.effects.get(target.closest("[data-effect-id]").dataset.effectId);
    if (!effect) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete" },
      content: `<p>Delete <strong>${effect.name}</strong>?</p>`
    });
    if (confirmed) await effect.delete();
  }
}

export class CrawlerItemSheet extends RichTextMixin(HandlebarsMixin(ItemSheetV2)) {

  static DEFAULT_OPTIONS = {
    classes: ["crawl", "sheet", "item"],
    position: { width: 520, height: 680 },
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
      editing: { description: this.editingFields.has("description") },
      rendered: { description: await enrich(item.system.description, { relativeTo: item }) }
    });
  }
}
