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
      rollEvadeCheck: CrawlerSheet._onRollEvadeCheck,
      rollSkill: CrawlerSheet._onRollSkill,
      rollAttackGear: CrawlerSheet._onRollAttackGear,
      useItem: CrawlerSheet._onUseItem,
      adjustRank: CrawlerSheet._onAdjustRank,
      toggleEquip: CrawlerSheet._onToggleEquip,
      createItem: CrawlerSheet._onCreateItem,
      editItem: CrawlerSheet._onEditItem,
      deleteItem: CrawlerSheet._onDeleteItem,
      pinItem: CrawlerSheet._onPinItem,
      unpinItem: CrawlerSheet._onUnpinItem,
      rollHotlist: CrawlerSheet._onRollHotlist,
      createEffect: CrawlerSheet._onCreateEffect,
      editEffect: CrawlerSheet._onEditEffect,
      toggleEffect: CrawlerSheet._onToggleEffect,
      deleteEffect: CrawlerSheet._onDeleteEffect,
      applyInjury: CrawlerSheet._onApplyInjury,
      rest: CrawlerSheet._onRest
    }
  };

  static PARTS = {
    main: { template: `systems/${SYSTEM_ID}/templates/actor/crawler-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    const hotlistIds = system.hotlist ?? [];

    const skillItems = actor.items.filter(i => i.type === "skill");
    const skills = skillItems
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(skill => {
        const s = skill.system;
        return {
          id: skill.id,
          name: skill.name,
          skillType: s.skillType,
          kind: s.kind,
          kindLabel: CRAWLER.featureKinds[s.kind] ?? s.kind,
          attribute: s.attribute,
          attributeLabel: CRAWLER.attributes[s.attribute] ?? "",
          damageAttribute: s.damageAttribute === "same" ? s.attribute : s.damageAttribute,
          rank: s.rank,
          floorBonus: s.floorBonus,
          total: actor.skillModifier(skill),
          checkType: s.checkType,
          checkTypeLabel: CRAWLER.skillCheckTypes[s.checkType] ?? s.checkType,
          attackType: s.attackType,
          attackTypeLabel: CRAWLER.attackTypes[s.attackType] ?? "",
          damage: s.damage,
          damageTypeLabel: CRAWLER.damageTypes[s.damageType] ?? "",
          range: s.range,
          manaCost: s.manaCost,
          rollable: s.skillType !== "feature" && s.checkType !== "passive",
          healing: s.healing,
          healSlots: s.healSlots,
          manaRestore: s.manaRestore,
          manaRestoreAmount: s.manaRestoreAmount,
          manaRestoreFull: s.manaRestoreFull,
          cooldownRemaining: this._cooldownRemaining(skill),
          pinned: hotlistIds.includes(skill.id),
          buffScope: s.buffScope,
          buffSkillName: s.buffSkillName
        };
      });

    const attackSkills = skills.filter(s => s.skillType === "attack");
    const spellSkills = skills.filter(s => s.skillType === "spell");
    const utilitySkills = skills.filter(s => s.skillType === "utility");
    const features = skills.filter(s => s.skillType === "feature");

    // A Utility Skill can boost an Attack/Spell if its scope matches by melee/ranged or by name.
    const boostsFor = skill => utilitySkills.filter(u => {
      if (u.buffScope === "none") return false;
      if (u.buffScope === "specific") return u.buffSkillName === skill.name;
      return u.buffScope === skill.attackType;
    });
    for (const s of [...attackSkills, ...spellSkills]) s.boosts = boostsFor(s);

    const gear = actor.items.filter(i => i.type === "gear")
      .map(item => {
        const linkedSkill = skillItems.find(s => s.name === item.system.skill);
        return {
          id: item.id, name: item.name, img: item.img, ...item.system,
          kindLabel: CRAWLER.gearKinds[item.system.kind] ?? item.system.kind,
          slotLabel: CRAWLER.gearSlots[item.system.slot] ?? item.system.slot,
          linkedSkillId: linkedSkill?.id ?? null,
          linkedSkillDamage: linkedSkill?.system.damage ?? "",
          pinned: hotlistIds.includes(item.id)
        };
      });

    // One occupant per exclusive slot (head/torso/arms/hands/legs/feet); accessories stack to 10.
    const exclusiveSlots = ["head", "torso", "arms", "hands", "legs", "feet"];
    const gearSlots = exclusiveSlots.map(slot => ({
      slot, label: CRAWLER.gearSlots[slot],
      item: gear.find(g => g.slot === slot && g.equipped) ?? null
    }));
    const accessories = gear.filter(g => g.slot === "accessory" && g.equipped);

    const hotlist = hotlistIds
      .map(id => actor.items.get(id))
      .filter(Boolean)
      .map(item => {
        let sub = "";
        if (item.type === "skill") {
          sub = (item.system.skillType === "attack" || item.system.skillType === "spell")
            ? `${item.system.damage || "—"}${item.system.manaCost ? ` · ${item.system.manaCost} Mana` : ""}`
            : (CRAWLER.attributes[item.system.attribute] ?? "Passive");
        } else if (item.type === "gear") {
          sub = CRAWLER.gearKinds[item.system.kind] ?? "";
        }
        return { id: item.id, name: item.name, img: item.img, type: item.type, sub };
      });

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
        { id: "character", label: "Character" },
        { id: "skills", label: "Skills" },
        { id: "gear", label: "Gear" },
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
      attackSkills,
      spellSkills,
      utilitySkills,
      features,
      weapons: gear.filter(g => g.kind === "weapon"),
      otherGear: gear.filter(g => g.kind !== "weapon"),
      gearSlots,
      accessories,
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

  static async _onRollEvadeCheck(event) {
    return this.document.rollEvadeCheck(rollModifiers(event));
  }

  static async _onRollSkill(event, target) {
    const row = target.closest("[data-item-id]");
    const boostId = row.querySelector("select[data-boost]")?.value || null;
    return this.document.rollSkill(row.dataset.itemId, { ...rollModifiers(event), boostId });
  }

  static async _onRollAttackGear(event, target) {
    return this.document.rollAttackViaGear(target.closest("[data-item-id]").dataset.itemId, rollModifiers(event));
  }

  static async _onUseItem(event, target) {
    return this.document.useItem(target.closest("[data-item-id]").dataset.itemId);
  }

  static async _onAdjustRank(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const delta = Number(target.dataset.delta ?? 1);
    const rank = Math.clamp(item.system.rank + delta, 0, 20);
    return item.update({ "system.rank": rank });
  }

  static async _onToggleEquip(event, target) {
    return this.document.equipGear(target.closest("[data-item-id]").dataset.itemId);
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
    const skillType = target.dataset.skillType;
    const system = {};
    if (type === "skill") {
      system.skillType = skillType ?? "utility";
      system.attribute = target.dataset.attribute ?? "str";
      if (skillType === "attack" || skillType === "spell") system.checkType = "evade";
      else if (skillType === "feature") system.checkType = "passive";
    }
    const created = await this.document.createEmbeddedDocuments("Item", [{
      name: `New ${target.dataset.label ?? type}`,
      type,
      system
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

  static async _onRest(event, target) {
    return this.document.rest(target.dataset.restType);
  }
}
