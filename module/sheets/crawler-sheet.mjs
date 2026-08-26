import { SYSTEM_ID, ActorSheetV2, HandlebarsMixin, enrich } from "../helpers/compat.mjs";
import { RichTextMixin } from "../helpers/richtext.mjs";
import { CRAWLER } from "../data/config.mjs";

/** Shift-click = Advantage, Ctrl-click = Disadvantage (they cancel if both are held). */
function rollModifiers(event) {
  return { advantage: event.shiftKey, disadvantage: event.ctrlKey };
}

export class CrawlerSheet extends RichTextMixin(HandlebarsMixin(ActorSheetV2)) {

  tab = "skills";

  static DEFAULT_OPTIONS = {
    classes: ["crawl", "sheet", "crawler"],
    position: { width: 760, height: 780 },
    window: { resizable: true, icon: "fa-solid fa-tower-broadcast" },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      showTab: CrawlerSheet._onShowTab,
      rollAttribute: CrawlerSheet._onRollAttribute,
      rollSkill: CrawlerSheet._onRollSkill,
      rollAttack: CrawlerSheet._onRollAttack,
      castAbility: CrawlerSheet._onCastAbility,
      adjustRank: CrawlerSheet._onAdjustRank,
      toggleEquip: CrawlerSheet._onToggleEquip,
      createItem: CrawlerSheet._onCreateItem,
      editItem: CrawlerSheet._onEditItem,
      deleteItem: CrawlerSheet._onDeleteItem,
      seedSkills: CrawlerSheet._onSeedSkills,
      pinItem: CrawlerSheet._onPinItem,
      unpinItem: CrawlerSheet._onUnpinItem,
      rollHotlist: CrawlerSheet._onRollHotlist,
      createEffect: CrawlerSheet._onCreateEffect,
      editEffect: CrawlerSheet._onEditEffect,
      toggleEffect: CrawlerSheet._onToggleEffect,
      deleteEffect: CrawlerSheet._onDeleteEffect,
      applyInjury: CrawlerSheet._onApplyInjury
    }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/actor/crawler-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    const skills = actor.items.filter(i => i.type === "skill")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(skill => ({
        id: skill.id,
        name: skill.name,
        attribute: skill.system.attribute,
        attributeLabel: CRAWLER.attributes[skill.system.attribute],
        rank: skill.system.rank,
        floorBonus: skill.system.floorBonus,
        total: actor.skillModifier(skill),
        checkType: skill.system.checkType,
        checkTypeLabel: CRAWLER.skillCheckTypes[skill.system.checkType] ?? skill.system.checkType,
        rollable: skill.system.checkType !== "passive",
        pinned: (system.hotlist ?? []).includes(skill.id)
      }));

    const gear = actor.items.filter(i => i.type === "gear")
      .map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system,
        kindLabel: CRAWLER.gearKinds[item.system.kind] ?? item.system.kind,
        slotLabel: CRAWLER.gearSlots[item.system.slot] ?? item.system.slot,
        damageTypeLabel: CRAWLER.damageTypes[item.system.damageType] ?? "",
        pinned: (system.hotlist ?? []).includes(item.id),
        cooldownRemaining: this._cooldownRemaining(item) }));

    const abilities = actor.items.filter(i => i.type === "ability")
      .map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system,
        kindLabel: CRAWLER.abilityKinds[item.system.kind] ?? item.system.kind,
        damageTypeLabel: CRAWLER.damageTypes[item.system.damageType] ?? "",
        pinned: (system.hotlist ?? []).includes(item.id),
        cooldownRemaining: this._cooldownRemaining(item) }));

    // One occupant per exclusive slot (head/torso/arms/hands/legs/feet); accessories stack to 10.
    const exclusiveSlots = ["head", "torso", "arms", "hands", "legs", "feet"];
    const gearSlots = exclusiveSlots.map(slot => ({
      slot, label: CRAWLER.gearSlots[slot],
      item: gear.find(g => g.slot === slot && g.equipped) ?? null
    }));
    const accessories = gear.filter(g => g.slot === "accessory" && g.equipped);

    const hotlist = (system.hotlist ?? [])
      .map(id => actor.items.get(id))
      .filter(Boolean)
      .map(item => ({
        id: item.id, name: item.name, img: item.img, type: item.type,
        sub: item.type === "skill" ? CRAWLER.attributes[item.system.attribute]
          : item.type === "gear" ? `${item.system.damage} + ${item.system.attribute.toUpperCase()}`
          : item.system.manaCost ? `${item.system.manaCost} Mana` : ""
      }));

    const effects = actor.effects.map(e => ({
      id: e.id, name: e.name, img: e.img, disabled: e.disabled,
      duration: e.duration?.label || "—"
    }));

    const isGM = game.user.isGM;

    return Object.assign(context, {
      actor,
      system,
      config: CRAWLER,
      editable: this.isEditable,
      isGM,
      tab: this.tab,
      tabs: [
        { id: "skills", label: "Skills" },
        { id: "gear", label: "Gear" },
        { id: "abilities", label: "Abilities" },
        { id: "hotlist", label: "Hotlist" },
        { id: "effects", label: "Effects" },
        { id: "notes", label: "Notes" },
        ...(isGM ? [{ id: "gm", label: "GM Notes" }] : [])
      ],
      attributes: Object.entries(CRAWLER.attributes).map(([key, label]) => ({
        key, label, abbr: key.toUpperCase(),
        value: system.attributes[key].value,
        bonus: system.attributes[key].bonus,
        total: system.attributes[key].total,
        mod: system.attributes[key].mod
      })),
      sizes: CRAWLER.sizes,
      skills,
      weapons: gear.filter(g => g.kind === "weapon"),
      otherGear: gear.filter(g => g.kind !== "weapon"),
      gearSlots,
      accessories,
      spells: abilities.filter(a => a.kind === "spell"),
      otherAbilities: abilities.filter(a => a.kind !== "spell"),
      hotlist,
      effects,
      hpSlots: Array.from({ length: 10 }, (_, i) => ({
        filled: i < system.hp.filledSlots,
        temp: i >= system.hp.filledSlots && i < system.hp.filledSlots + system.hp.tempSlots
      })),
      manaPct: Math.clamp(Math.round((system.mana.value / Math.max(1, system.mana.max)) * 100), 0, 100),
      editing: {
        biography: this.editingFields.has("biography"),
        gmNotes: this.editingFields.has("gmNotes")
      },
      rendered: {
        biography: await enrich(system.details.biography, { relativeTo: actor }),
        gmNotes: isGM ? await enrich(system.gmNotes, { relativeTo: actor }) : ""
      }
    });
  }

  /** Rounds left on an item's Cooldown, or null if it's not on cooldown (or combat isn't active). */
  _cooldownRemaining(item) {
    if (!game.combat?.started) return null;
    const until = item.getFlag(SYSTEM_ID, "cooldownUntil");
    if (until === undefined) return null;
    const remaining = until - game.combat.round;
    return remaining > 0 ? remaining : null;
  }

  /** Embedded item fields can't ride the document form, so handle them directly. */
  async _onRender(context, options) {
    await super._onRender?.(context, options);
    if (!this.isEditable) return;

    for (const input of this.element.querySelectorAll("[data-item-id][data-field]")) {
      input.addEventListener("change", async event => {
        const el = event.currentTarget;
        const item = this.document.items.get(el.dataset.itemId);
        if (!item) return;
        const raw = el.type === "checkbox" ? el.checked : el.value;
        const value = el.dataset.dtype === "Number" ? Number(raw) : raw;
        await item.update({ [el.dataset.field]: value });
      });
    }
  }

  /* ---------------------------------- */
  /*  Actions                           */
  /* ---------------------------------- */

  static _onShowTab(event, target) {
    this.tab = target.dataset.tab;
    this.render();
  }

  static async _onRollAttribute(event, target) {
    return this.document.rollAttribute(target.dataset.key, rollModifiers(event));
  }

  static async _onRollSkill(event, target) {
    return this.document.rollSkill(target.closest("[data-item-id]").dataset.itemId, rollModifiers(event));
  }

  static async _onRollAttack(event, target) {
    return this.document.rollAttack(target.closest("[data-item-id]").dataset.itemId, rollModifiers(event));
  }

  static async _onAdjustRank(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const delta = Number(target.dataset.delta ?? 1);
    const rank = Math.clamp(item.system.rank + delta, 0, 5);
    return item.update({ "system.rank": rank });
  }

  static async _onToggleEquip(event, target) {
    return this.document.equipGear(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onCastAbility(event, target) {
    return this.document.castAbility(target.closest("[data-item-id]").dataset.itemId, rollModifiers(event));
  }

  static async _onPinItem(event, target) {
    return this.document.addToHotlist(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onUnpinItem(event, target) {
    return this.document.removeFromHotlist(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onRollHotlist(event, target) {
    return this.document.rollHotlistEntry(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onCreateItem(event, target) {
    const type = target.dataset.type;
    const created = await this.document.createEmbeddedDocuments("Item", [{
      name: `New ${type}`,
      type,
      system: type === "skill" ? { attribute: target.dataset.attribute ?? "str" } : {}
    }]);
    return created[0]?.sheet.render(true);
  }

  static _onEditItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item?.sheet.render(true);
  }

  static async _onDeleteItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete" },
      content: `<p>Delete <strong>${item.name}</strong>?</p>`
    });
    if (confirmed) await item.delete();
  }

  static async _onSeedSkills() {
    return this.document.seedSkills();
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

  static async _onApplyInjury(event, target) {
    return this.document.applyInjury(target.dataset.severity);
  }
}
