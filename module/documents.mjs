import { CRAWLER } from "./data/config.mjs";
import { SYSTEM_ID } from "./helpers/compat.mjs";
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

  /** Total modifier for a skill item: attribute mod + rank + floor bonus + injury penalty. */
  skillModifier(skill) {
    const attr = this.system.attributes?.[skill.system.attribute];
    const injuryPenalty = this.system.injuryPenalty ?? 0;
    return (attr?.mod ?? 0) + skill.system.rank + skill.system.floorBonus + injuryPenalty;
  }

  async rollAttribute(key, { dc = null, advantage = false, disadvantage = false } = {}) {
    const attr = this.system.attributes?.[key];
    if (!attr) return;
    const injuryPenalty = this.system.injuryPenalty ?? 0;
    return Dice.rollCheck({
      actor: this,
      label: `${CRAWLER.attributes[key]} Check`,
      mod: attr.mod + injuryPenalty,
      dc, advantage, disadvantage
    });
  }

  async rollSkill(skillId, { dc = null, advantage = false, disadvantage = false } = {}) {
    const skill = this.items.get(skillId);
    if (!skill) return;
    if (skill.system.checkType === "passive") {
      return ui.notifications.warn(`${skill.name} is a passive skill and can't be rolled.`);
    }
    // Untrained Skill use (Rank 0) rolls with Disadvantage by default.
    const untrained = skill.system.rank === 0;
    const attrLabel = CRAWLER.attributes[skill.system.attribute];
    return Dice.rollCheck({
      actor: this,
      label: `${skill.name} (${attrLabel})`,
      mod: this.skillModifier(skill),
      dc,
      advantage,
      disadvantage: disadvantage || untrained
    });
  }

  /** Attack with a gear item. Resolves against a Crawler target's reactive Evade, or a Mob's passive Evade. */
  async rollAttack(itemId, { advantage = false, disadvantage = false } = {}) {
    const item = this.items.get(itemId);
    if (!item) return;
    if (this.isOnCooldown(item)) return ui.notifications.warn(`${item.name} is still on cooldown.`);

    const attrKey = item.system.attribute;
    const attrMod = this.system.attributes?.[attrKey]?.mod ?? 0;
    const skill = this.items.find(i => i.type === "skill" && i.name === item.system.skill);
    const rank = skill ? skill.system.rank + skill.system.floorBonus : 0;
    const injuryPenalty = this.system.injuryPenalty ?? 0;

    const target = game.user.targets.first();
    const size = Dice.targetSizeModifier(this, target);

    await this.useCooldown(item);

    return Dice.resolveAttack({
      actor: this,
      label: `Attack — ${item.name}`,
      mod: attrMod + rank + injuryPenalty,
      advantage: advantage || size.advantage,
      disadvantage: disadvantage || size.disadvantage,
      itemId: item.id,
      rank,
      bonusDamage: size.bonusDamage,
      target
    });
  }

  /** Cast a spell ability. Checks and deducts Mana before rolling; blocks the cast if short or on cooldown. */
  async castAbility(itemId, { advantage = false, disadvantage = false } = {}) {
    const item = this.items.get(itemId);
    if (!item) return;
    if (this.isOnCooldown(item)) return ui.notifications.warn(`${item.name} is still on cooldown.`);

    const manaCost = item.system.manaCost ?? 0;
    const mana = this.system.mana;
    if (mana && manaCost > mana.value) {
      return ui.notifications.warn(`Not enough Mana to cast ${item.name} (needs ${manaCost}, has ${mana.value}).`);
    }

    const attrKey = item.system.attribute;
    const attrMod = this.system.attributes?.[attrKey]?.mod ?? 0;
    const skill = this.items.find(i => i.type === "skill" && i.name === item.system.skill);
    const rank = skill ? skill.system.rank + skill.system.floorBonus : 0;
    const injuryPenalty = this.system.injuryPenalty ?? 0;

    const target = game.user.targets.first();
    const size = Dice.targetSizeModifier(this, target);

    if (manaCost) await this.update({ "system.mana.value": mana.value - manaCost });
    await this.useCooldown(item);

    return Dice.resolveAttack({
      actor: this,
      label: `Cast — ${item.name}`,
      mod: attrMod + rank + injuryPenalty,
      advantage: advantage || size.advantage,
      disadvantage: disadvantage || size.disadvantage,
      itemId: item.id,
      rank,
      bonusDamage: size.bonusDamage,
      target
    });
  }

  /** Whether a Gear/Ability item is still on Cooldown. Only enforced while combat is active. */
  isOnCooldown(item) {
    if (!game.combat?.started) return false;
    const until = item.getFlag(SYSTEM_ID, "cooldownUntil");
    return until !== undefined && game.combat.round < until;
  }

  /** Start an item's Cooldown timer, if it has one and combat is active. */
  async useCooldown(item) {
    if (!item.system.cooldown || !game.combat?.started) return;
    await item.setFlag(SYSTEM_ID, "cooldownUntil", game.combat.round + item.system.cooldown);
  }

  /**
   * Roll a reactive Evade check against a pending attack (posted by Dice.resolveAttack when
   * the target is a Crawler), or skip it and take the hit automatically.
   */
  async rollEvade(flags) {
    const dexMod = this.system.attributes?.dex?.mod ?? 0;
    const mod = dexMod + (this.system.evade?.bonus ?? 0) + (this.system.injuryPenalty ?? 0);
    const evadeRoll = await new Roll("1d20 + @mod", { mod }).evaluate();
    return this._resolveEvade(flags, evadeRoll);
  }

  /** Skip the reactive Evade roll — no Action spent, so the attack auto-hits unless it fumbled. */
  async skipEvade(flags) {
    return this._resolveEvade(flags, null);
  }

  async _resolveEvade(flags, evadeRoll) {
    const message = await Dice.postEvadeResult({
      defenderName: this.name,
      label: evadeRoll ? "Evade" : "Took the Hit",
      evadeRoll,
      attackTotal: flags.attackTotal, attackCrit: flags.attackCrit, attackFumble: flags.attackFumble,
      attackerActorId: flags.actorId, attackerTokenId: flags.tokenId,
      itemId: flags.itemId, mobAttackIndex: flags.mobAttackIndex, rank: flags.rank, bonusDamage: flags.bonusDamage
    });
    if (message.flags?.[SYSTEM_ID]?.doubleDamage) {
      await this.createEmbeddedDocuments("ActiveEffect", [{
        name: "Major Injury", icon: "icons/svg/blood.svg",
        changes: [{ key: "system.injuryPenalty", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -5 }]
      }]);
    }
    return message;
  }

  /**
   * Apply a signed HP change in whole Health Bar slots (partial-slot damage is lost, per
   * the rules). A positive `amount` damages (temporary slots soak first, for Crawlers); a
   * negative amount heals. `multiplier` scales the amount (0.5 half, 2 double, -1 to heal).
   * @returns {{name: string, before: number, after: number, maxSlots: number, delta: number}|null}
   */
  async applyDamage(amount, { multiplier = 1 } = {}) {
    const hp = this.system.hp;
    if (!hp) return null;

    let delta = Math.floor(Number(amount) * Number(multiplier));

    // Damage Resistance reduces incoming damage (never healing) before anything else.
    if (delta > 0) {
      const dr = this.system.damageResistance;
      const drValue = typeof dr === "object" ? (dr?.value ?? 0) : (dr ?? 0);
      delta = Math.max(0, delta - drValue);
    }

    const slotValue = hp.slotValue || 1;
    const maxSlots = this.type === "crawler" ? 10 : (hp.maxSlots ?? 10);
    const before = hp.filledSlots;
    const slotsChanged = Math.floor(Math.abs(delta) / slotValue) * Math.sign(delta);
    if (!slotsChanged) return { name: this.name, before, after: before, maxSlots, delta: 0 };

    const updates = {};
    let remainingSlots = slotsChanged;

    // Temporary slots (Crawlers only) absorb damage before real slots.
    if (slotsChanged > 0 && typeof hp.tempSlots === "number" && hp.tempSlots > 0) {
      const absorbed = Math.min(hp.tempSlots, remainingSlots);
      updates["system.hp.tempSlots"] = hp.tempSlots - absorbed;
      remainingSlots -= absorbed;
    }

    const after = Math.clamp(before - remainingSlots, 0, maxSlots);
    updates["system.hp.filledSlots"] = after;
    await this.update(updates);
    await this._syncDefeatedStatus(before, after);
    return { name: this.name, before, after, maxSlots, delta: slotsChanged };
  }

  /** Mark/clear a Dying (Crawler) or defeated (Mob) status when Health Bar slots hit/leave 0. */
  async _syncDefeatedStatus(before, after) {
    try {
      if (after === 0 && before > 0) {
        if (this.type === "mob") {
          await this.toggleStatusEffect?.("dead", { active: true });
        } else if (!this.effects.find(e => e.name === "Dying")) {
          await this.createEmbeddedDocuments("ActiveEffect", [{
            name: "Dying", icon: "icons/svg/skull.svg", statuses: ["unconscious"]
          }]);
        }
      } else if (after > 0 && before === 0) {
        const dying = this.effects.find(e => e.name === "Dying");
        if (dying) await dying.delete();
        if (this.type === "mob") await this.toggleStatusEffect?.("dead", { active: false });
      }
    } catch (err) {
      console.warn(`${SYSTEM_ID} | Could not sync defeated status for ${this.name}`, err);
    }
  }

  /** Roll one of a mob's attacks (index into system.attacks). Resolves against a Crawler
   *  target's reactive Evade, or another Mob's passive Evade. */
  async rollMobAttack(index, { advantage = false, disadvantage = false } = {}) {
    const atk = this.system.attacks?.[index];
    if (!atk) return;
    const target = game.user.targets.first();
    const size = Dice.targetSizeModifier(this, target);
    return Dice.resolveAttack({
      actor: this,
      label: `Attack — ${atk.name}`,
      mod: atk.attack,
      advantage: advantage || size.advantage,
      disadvantage: disadvantage || size.disadvantage,
      mobAttackIndex: index,
      bonusDamage: size.bonusDamage,
      target
    });
  }

  /** Roll damage for one of a mob's attacks. */
  async rollMobDamage(index, { crit = false, doubleDamage = false } = {}) {
    const atk = this.system.attacks?.[index];
    if (!atk) return;
    const baseDie = atk.damage || "1d6";
    let formula = crit ? Dice.doubleDiceCount(baseDie) : baseDie;
    if (doubleDamage) formula = `(${formula}) * 2`;
    const roll = await new Roll(formula).evaluate();
    return Dice.postDamageCard({
      actor: this, label: `${crit ? "Critical damage" : "Damage"} — ${atk.name}`, roll, crit
    });
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

  /** Apply a Minor (-2) or Major (-5) Injury to all Checks via an ActiveEffect. */
  async applyInjury(severity = "minor") {
    const value = severity === "major" ? -5 : -2;
    const name = severity === "major" ? "Major Injury" : "Minor Injury";
    return this.createEmbeddedDocuments("ActiveEffect", [{
      name, icon: "icons/svg/blood.svg",
      changes: [{ key: "system.injuryPenalty", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value }]
    }]);
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
