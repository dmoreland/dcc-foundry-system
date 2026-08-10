import { SYSTEM_ID, ActorSheetV2, HandlebarsMixin, enrich } from "../helpers/compat.mjs";
import { CRAWLER } from "../data/config.mjs";

export class CrawlerSheet extends HandlebarsMixin(ActorSheetV2) {

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
      adjustRank: CrawlerSheet._onAdjustRank,
      toggleEquip: CrawlerSheet._onToggleEquip,
      createItem: CrawlerSheet._onCreateItem,
      editItem: CrawlerSheet._onEditItem,
      deleteItem: CrawlerSheet._onDeleteItem,
      seedSkills: CrawlerSheet._onSeedSkills
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
        total: actor.skillModifier(skill)
      }));

    const gear = actor.items.filter(i => i.type === "gear")
      .map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system,
        kindLabel: CRAWLER.gearKinds[item.system.kind] ?? item.system.kind }));

    const abilities = actor.items.filter(i => i.type === "ability")
      .map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system,
        kindLabel: CRAWLER.abilityKinds[item.system.kind] ?? item.system.kind }));

    return Object.assign(context, {
      actor,
      system,
      config: CRAWLER,
      editable: this.isEditable,
      tab: this.tab,
      tabs: [
        { id: "skills", label: "Skills" },
        { id: "gear", label: "Gear" },
        { id: "abilities", label: "Abilities" },
        { id: "notes", label: "Notes" }
      ],
      attributes: Object.entries(CRAWLER.attributes).map(([key, label]) => ({
        key, label, abbr: key.toUpperCase(),
        value: system.attributes[key].value,
        bonus: system.attributes[key].bonus,
        total: system.attributes[key].total
      })),
      skills,
      weapons: gear.filter(g => g.kind === "weapon"),
      otherGear: gear.filter(g => g.kind !== "weapon"),
      abilities,
      hpPct: Math.clamp(Math.round((system.hp.value / Math.max(1, system.hp.max)) * 100), 0, 100),
      manaPct: Math.clamp(Math.round((system.mana.value / Math.max(1, system.mana.max)) * 100), 0, 100),
      biography: await enrich(system.details.biography, { relativeTo: actor })
    });
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
    return this.document.rollAttribute(target.dataset.key);
  }

  static async _onRollSkill(event, target) {
    return this.document.rollSkill(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onRollAttack(event, target) {
    return this.document.rollAttack(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onAdjustRank(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const delta = Number(target.dataset.delta ?? 1);
    const rank = Math.clamp(item.system.rank + delta, 0, 5);
    return item.update({ "system.rank": rank });
  }

  static async _onToggleEquip(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    return item?.update({ "system.equipped": !item.system.equipped });
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
}
