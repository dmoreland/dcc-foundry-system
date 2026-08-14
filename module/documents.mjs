import { CRAWLER } from "./data/config.mjs";
import * as Dice from "./helpers/rolls.mjs";

export class CrawlerActor extends Actor {

  static HOTLIST_MAX = 10;

  /** Merge system roll data so formulas can use @str, @level and friends. */
  getRollData() {
    const data = { ...super.getRollData() };
    Object.assign(data, this.system.getRollData?.() ?? {});
    if (this.type === "crawler") {
      data.skills = {};
      for (const item of this.items) {
        if (item.type !== "skill") continue;
        const slug = item.name.slugify({ replacement: "_", strict: true });
        data.skills[slug] = item.system.rank + item.system.floorBonus;
      }
    }
    return data;
  }

  /** Total modifier for a skill item: attribute + rank + any temporary floor bonus. */
  skillModifier(skill) {
    const attr = this.system.attributes?.[skill.system.attribute];
    return (attr?.total ?? 0) + skill.system.rank + skill.system.floorBonus;
  }

  async rollAttribute(key, { dc = null } = {}) {
    const attr = this.system.attributes?.[key];
    if (!attr) return;
    return Dice.rollCheck({
      actor: this,
      label: `${CRAWLER.attributes[key]} Check`,
      mod: attr.total,
      dc
    });
  }

  async rollSkill(skillId, { dc = null } = {}) {
    const skill = this.items.get(skillId);
    if (!skill) return;
    if (skill.system.checkType === "passive") {
      return ui.notifications.warn(`${skill.name} is a passive skill and can't be rolled.`);
    }
    const attrLabel = CRAWLER.attributes[skill.system.attribute];
    return Dice.rollCheck({
      actor: this,
      label: `${skill.name} (${attrLabel})`,
      mod: this.skillModifier(skill),
      dc
    });
  }

  /** Attack with a gear item. Uses a targeted token's Evade as the DC if one is picked. */
  async rollAttack(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    const attrKey = item.system.attribute;
    const attrMod = this.system.attributes?.[attrKey]?.total ?? 0;
    const skill = this.items.find(i => i.type === "skill" && i.name === item.system.skill);
    const rank = skill ? skill.system.rank + skill.system.floorBonus : 0;

    return Dice.rollCheck({
      actor: this,
      label: `Attack — ${item.name}`,
      mod: attrMod + rank,
      dc: Dice.targetEvade(),
      itemId: item.id,
      showDamage: true
    });
  }

  /** Cast a spell ability. Checks and deducts Mana before rolling; blocks the cast if short. */
  async castAbility(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    const manaCost = item.system.manaCost ?? 0;
    const mana = this.system.mana;
    if (mana && manaCost > mana.value) {
      return ui.notifications.warn(`Not enough Mana to cast ${item.name} (needs ${manaCost}, has ${mana.value}).`);
    }

    const attrKey = item.system.attribute;
    const attrMod = this.system.attributes?.[attrKey]?.total ?? 0;
    const skill = this.items.find(i => i.type === "skill" && i.name === item.system.skill);
    const rank = skill ? skill.system.rank + skill.system.floorBonus : 0;

    if (manaCost) await this.update({ "system.mana.value": mana.value - manaCost });

    return Dice.rollCheck({
      actor: this,
      label: `Cast — ${item.name}`,
      mod: attrMod + rank,
      dc: Dice.targetEvade(),
      itemId: item.id,
      showDamage: true
    });
  }

  /**
   * Apply a signed HP change. A positive `amount` damages (temporary HP soaks first,
   * for Crawlers); a negative amount heals. `multiplier` scales the amount (0.5 for half,
   * 2 for double, -1 to turn damage into healing). Works for both crawler and mob actors.
   * @returns {{name: string, before: number, after: number, delta: number}|null}
   */
  async applyDamage(amount, { multiplier = 1 } = {}) {
    const hp = this.system.hp;
    if (!hp) return null;

    let delta = Math.floor(Number(amount) * Number(multiplier));
    const before = hp.value;

    // Damage Resistance reduces incoming damage (never healing) before anything else.
    if (delta > 0) {
      const dr = this.system.damageResistance;
      const drValue = typeof dr === "object" ? (dr?.value ?? 0) : (dr ?? 0);
      delta = Math.max(0, delta - drValue);
    }
    if (!delta) return { name: this.name, before, after: before, delta: 0 };

    const updates = {};
    let remaining = delta;

    // Temporary HP (Crawlers only) absorbs damage before real HP.
    if (delta > 0 && typeof hp.temp === "number" && hp.temp > 0) {
      const absorbed = Math.min(hp.temp, remaining);
      updates["system.hp.temp"] = hp.temp - absorbed;
      remaining -= absorbed;
    }

    const after = Math.clamp(before - remaining, 0, hp.max);
    updates["system.hp.value"] = after;
    await this.update(updates);
    return { name: this.name, before, after, delta };
  }

  /** Roll one of a mob's attacks (index into system.attacks) against the targeted token's Evade. */
  async rollMobAttack(index) {
    const atk = this.system.attacks?.[index];
    if (!atk) return;
    return Dice.rollCheck({
      actor: this,
      label: `Attack — ${atk.name}`,
      mod: atk.attack,
      dc: Dice.targetEvade()
    });
  }

  /** Roll damage for one of a mob's attacks. */
  async rollMobDamage(index) {
    const atk = this.system.attacks?.[index];
    if (!atk) return;
    const roll = await new Roll(atk.damage || "1d6").evaluate();
    return Dice.postDamageCard({ actor: this, label: `Damage — ${atk.name}`, roll });
  }

  /** Add a blank attack entry to a mob. */
  async addAttack() {
    const attacks = [...(this.system.attacks ?? []), { name: "Attack", attack: 3, damage: "1d6" }];
    return this.update({ "system.attacks": attacks });
  }

  /** Remove an attack entry from a mob by index. */
  async removeAttack(index) {
    const attacks = (this.system.attacks ?? []).filter((_, i) => i !== index);
    return this.update({ "system.attacks": attacks });
  }

  /**
   * Toggle a gear item's equipped state, enforcing one-item-per-slot exclusivity
   * (equipping into an occupied head/torso/arms/hands/legs/feet slot bumps the current
   * occupant) and a 10-item cap on the accessory slot. Items with slot "none" just toggle.
   */
  async equipGear(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    const slot = item.system.slot;
    const equipping = !item.system.equipped;

    if (equipping && slot && slot !== "none") {
      const occupants = this.items.filter(i =>
        i.type === "gear" && i.id !== itemId && i.system.slot === slot && i.system.equipped);

      if (slot === "accessory") {
        if (occupants.length >= 10) {
          return ui.notifications.warn("All 10 accessory slots are full.");
        }
      } else if (occupants.length) {
        await this.updateEmbeddedDocuments("Item", occupants.map(o => ({ _id: o.id, "system.equipped": false })));
      }
    }

    return item.update({ "system.equipped": equipping });
  }

  /** Pin an item to the Hotlist, up to CrawlerActor.HOTLIST_MAX entries. */
  async addToHotlist(itemId) {
    const hotlist = this.system.hotlist ?? [];
    if (hotlist.includes(itemId)) return;
    if (hotlist.length >= CrawlerActor.HOTLIST_MAX) {
      return ui.notifications.warn(`The Hotlist is full (max ${CrawlerActor.HOTLIST_MAX}).`);
    }
    return this.update({ "system.hotlist": [...hotlist, itemId] });
  }

  /** Unpin an item from the Hotlist. */
  async removeFromHotlist(itemId) {
    const hotlist = this.system.hotlist ?? [];
    return this.update({ "system.hotlist": hotlist.filter(id => id !== itemId) });
  }

  /** Roll a Hotlist entry, dispatching to the right roll method for its item type. */
  async rollHotlistEntry(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    if (item.type === "skill") return this.rollSkill(itemId);
    if (item.type === "gear") return this.rollAttack(itemId);
    if (item.type === "ability") return this.castAbility(itemId);
  }

  /** Populate the standard skill list from the rules. Skips anything already present. */
  async seedSkills() {
    const existing = new Set(this.items.filter(i => i.type === "skill").map(i => i.name));
    const toCreate = CRAWLER.defaultSkills
      .filter(([name]) => !existing.has(name))
      .map(([name, attribute]) => ({ name, type: "skill", system: { attribute, rank: 0 } }));
    if (!toCreate.length) return ui.notifications.info("All standard skills are already on this sheet.");
    await this.createEmbeddedDocuments("Item", toCreate);
    ui.notifications.info(`Added ${toCreate.length} skills.`);
  }
}

export class CrawlerItem extends Item {
  getRollData() {
    const data = { ...(this.actor?.getRollData() ?? {}) };
    data.item = { ...this.system };
    return data;
  }
}
