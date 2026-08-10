import { CRAWLER } from "./data/config.mjs";
import * as Dice from "./helpers/rolls.mjs";

export class CrawlerActor extends Actor {

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
    const attrLabel = CRAWLER.attributes[skill.system.attribute];
    return Dice.rollCheck({
      actor: this,
      label: `${skill.name} (${attrLabel})`,
      mod: this.skillModifier(skill),
      dc
    });
  }

  /** Attack with a gear item. Uses a targeted token's Defense as the DC if one is picked. */
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
      dc: Dice.targetDefense(),
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

    const delta = Math.floor(Number(amount) * Number(multiplier));
    const before = hp.value;
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
