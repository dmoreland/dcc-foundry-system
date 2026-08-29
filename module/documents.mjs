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

  /** Post a skill's name and description to chat with no roll — used for Passive skills. */
  async postSkillInfo(skillId) {
    const skill = this.items.get(skillId);
    if (!skill) return;
    return Dice.postInfo({ actor: this, label: skill.name, flavor: skill.system.description, relativeTo: skill });
  }

  /**
   * Roll a Skill — the single entry point for Attack Skills, Spells, and Utility Skills alike.
   * Branches on the skill's own `skillType`/`checkType`: Features and Passive skills post their
   * description instead of rolling; Spells check/deduct Mana; anything with checkType "evade"
   * (a weapon Attack Skill or an attack Spell) resolves through the reactive-Evade attack flow;
   * everything else is a plain Opposed/Unopposed check. `boostId` is another Utility Skill (the
   * Aiming pattern) manually selected to buff this roll.
   */
  async rollSkill(skillId, { advantage = false, disadvantage = false, boostId = null } = {}) {
    const skill = this.items.get(skillId);
    if (!skill) return;

    if (skill.system.skillType === "feature" || skill.system.checkType === "passive") {
      return this.postSkillInfo(skillId);
    }
    if (this.isOnCooldown(skill)) return ui.notifications.warn(`${skill.name} is still on cooldown.`);

    const manaCost = skill.system.skillType === "spell" ? (skill.system.manaCost ?? 0) : 0;
    const mana = this.system.mana;
    if (manaCost && mana && manaCost > mana.value) {
      return ui.notifications.warn(`Not enough Mana to cast ${skill.name} (needs ${manaCost}, has ${mana.value}).`);
    }

    const attrKey = skill.system.attribute;
    const attrMod = (attrKey && attrKey !== "none") ? (this.system.attributes?.[attrKey]?.mod ?? 0) : 0;
    const rank = skill.system.rank + skill.system.floorBonus;
    const injuryPenalty = this.system.injuryPenalty ?? 0;
    // Untrained Skill use (Rank 0) rolls with Disadvantage by default.
    let forceDisadvantage = skill.system.rank === 0;

    let mod = attrMod + rank + injuryPenalty;
    let extraDamage = "";
    const boost = boostId ? this.items.get(boostId) : null;
    if (boost) {
      if (boost.system.buffToHitBonus) mod += boost.system.rank + boost.system.floorBonus;
      if (boost.system.buffRequiresDisadvantage) forceDisadvantage = true;
      extraDamage = boost.system.buffDamage || "";
    }

    if (manaCost) await this.update({ "system.mana.value": mana.value - manaCost });
    await this.useCooldown(skill);

    // Healing never rolls — it's a flat number of Health Bar slots, no attribute or DR involved.
    if (skill.system.healing) {
      return Dice.postHealCard({
        actor: this,
        label: `${skill.system.skillType === "spell" ? "Cast" : "Use"} — ${skill.name}`,
        healSlots: skill.system.healSlots,
        flavor: skill.system.description,
        relativeTo: skill
      });
    }
    // Same idea for Mana restoration — a flat amount or a full restore, never a roll.
    if (skill.system.manaRestore) {
      return Dice.postManaCard({
        actor: this,
        label: `${skill.system.skillType === "spell" ? "Cast" : "Use"} — ${skill.name}`,
        amount: skill.system.manaRestoreAmount,
        full: skill.system.manaRestoreFull,
        flavor: skill.system.description,
        relativeTo: skill
      });
    }

    const isAttack = skill.system.checkType === "evade";
    const attrLabel = CRAWLER.attributes[attrKey];
    const label = isAttack
      ? `${skill.system.skillType === "spell" ? "Cast" : "Attack"} — ${skill.name}`
      : (attrLabel ? `${skill.name} (${attrLabel})` : skill.name);

    if (isAttack) {
      const target = game.user.targets.first();
      const size = Dice.targetSizeModifier(this, target);
      return Dice.resolveAttack({
        actor: this,
        label,
        mod,
        advantage: advantage || size.advantage,
        disadvantage: disadvantage || forceDisadvantage || size.disadvantage,
        itemId: skill.id,
        rank,
        bonusDamage: size.bonusDamage,
        extraDamage,
        target,
        flavor: skill.system.description,
        relativeTo: skill
      });
    }

    return Dice.rollCheck({
      actor: this,
      label,
      mod,
      advantage,
      disadvantage: disadvantage || forceDisadvantage,
      flavor: skill.system.description,
      relativeTo: skill
    });
  }

  /** Attack via a weapon Gear item's linked Skill (looked up by name) — same convenience button
   *  the Gear tab has always had, just delegating to the merged Skill roll now. */
  async rollAttackViaGear(itemId, options = {}) {
    const gearItem = this.items.get(itemId);
    if (!gearItem) return;
    const skill = this.items.find(i => i.type === "skill" && i.name === gearItem.system.skill);
    if (!skill) return ui.notifications.warn(`No Skill named "${gearItem.system.skill}" found for ${gearItem.name}.`);
    return this.rollSkill(skill.id, options);
  }

  /** Use a consumable: decrements quantity, then heals a flat number of slots if it has the
   *  Healing trait, rolls its Use formula, or (if neither) just posts its description to chat. */
  async useItem(itemId) {
    const item = this.items.get(itemId);
    if (!item || item.type !== "gear") return;
    if (item.system.quantity <= 0) return ui.notifications.warn(`No ${item.name} left.`);

    await item.update({ "system.quantity": item.system.quantity - 1 });

    // Healing never rolls — it's a flat number of Health Bar slots, no attribute or DR involved.
    if (item.system.healing) {
      return Dice.postHealCard({
        actor: this,
        label: `Use — ${item.name}`,
        healSlots: item.system.healSlots,
        flavor: item.system.description,
        relativeTo: item
      });
    }
    // Same idea for Mana restoration — a flat amount or a full restore, never a roll.
    if (item.system.manaRestore) {
      return Dice.postManaCard({
        actor: this,
        label: `Use — ${item.name}`,
        amount: item.system.manaRestoreAmount,
        full: item.system.manaRestoreFull,
        flavor: item.system.description,
        relativeTo: item
      });
    }

    const formula = item.system.useDamage;
    if (!formula) {
      return Dice.postInfo({ actor: this, label: `Use — ${item.name}`, flavor: item.system.description, relativeTo: item });
    }

    const attrKey = item.system.useAttribute;
    const attrMod = (attrKey && attrKey !== "none") ? (this.system.attributes?.[attrKey]?.mod ?? 0) : 0;
    const roll = await new Roll(`${formula} + @attr`, { attr: attrMod }).evaluate();
    return Dice.postDamageCard({ actor: this, label: `Use — ${item.name}`, roll, crit: false });
  }

  /** Whether a Skill is still on Cooldown. Only enforced while combat is active. */
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

  /** Roll Evade on demand, outside the reactive attack flow — e.g. clicking it on your own
   *  sheet to check your odds. Posts a plain check card with no target/hit resolution; the
   *  real defensive roll happens via rollEvade(flags) below, triggered from a pending attack. */
  async rollEvadeCheck({ advantage = false, disadvantage = false } = {}) {
    const dexMod = this.system.attributes?.dex?.mod ?? 0;
    const mod = dexMod + (this.system.evade?.bonus ?? 0) + (this.system.injuryPenalty ?? 0);
    return Dice.rollCheck({ actor: this, label: "Evade", mod, advantage, disadvantage });
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
      itemId: flags.itemId, mobAttackIndex: flags.mobAttackIndex, rank: flags.rank, bonusDamage: flags.bonusDamage,
      extraDamage: flags.extraDamage
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

  /**
   * Heal a flat number of Health Bar slots directly — no roll, no attribute, no Damage
   * Resistance. Per the book, healing (unlike damage) is never a calculation: a Spell or item
   * just states how many slots (or what percentage) it restores. `full` heals to max (e.g. a
   * Long Rest) instead of adding a flat number of slots.
   * @returns {{name: string, before: number, after: number, maxSlots: number}|null}
   */
  async healSlots(slots, { full = false } = {}) {
    const hp = this.system.hp;
    if (!hp || (!full && !slots)) return null;
    const maxSlots = this.type === "crawler" ? 10 : (hp.maxSlots ?? 10);
    const before = hp.filledSlots;
    const after = full ? maxSlots : Math.clamp(before + Math.abs(Math.floor(slots)), 0, maxSlots);
    if (after === before) return { name: this.name, before, after, maxSlots };
    await this.update({ "system.hp.filledSlots": after });
    await this._syncDefeatedStatus(before, after);
    return { name: this.name, before, after, maxSlots };
  }

  /**
   * Restore Mana directly — no roll. `full` restores to max (e.g. a Standard Mana Potion);
   * otherwise `amount` is added flat (e.g. a Good Mana Refill Potion's 15 Mana), capped at max.
   * @returns {{name: string, before: number, after: number, max: number}|null}
   */
  async restoreMana(amount, { full = false } = {}) {
    const mana = this.system.mana;
    if (!mana) return null;
    const before = mana.value;
    const after = full ? mana.max : Math.clamp(before + Math.abs(Math.floor(amount)), 0, mana.max);
    if (after === before) return { name: this.name, before, after, max: mana.max };
    await this.update({ "system.mana.value": after });
    return { name: this.name, before, after, max: mana.max };
  }

  /**
   * Passive recovery over time (p. 94-95): a Short Rest (2 hours) heals 5 slots and half of
   * max Mana (rounded down); a Long Rest (8 hours) or a Full Day's Rest (30 hours) both fully
   * restore HP and Mana, and a Full Day's Rest also clears Injuries (the book requires a full
   * day to recover from those); "taking a break" is the passive trickle for every full hour
   * spent outside combat with no formal rest — 1 slot and 5 Mana, no roll either way.
   */
  async rest(type) {
    const mana = this.system.mana;
    let healResult, manaResult, injuriesCleared = 0;

    if (type === "short") {
      healResult = await this.healSlots(5);
      manaResult = await this.restoreMana(Math.floor((mana?.max ?? 0) / 2));
    } else if (type === "long" || type === "fullday") {
      healResult = await this.healSlots(0, { full: true });
      manaResult = await this.restoreMana(0, { full: true });
      if (type === "fullday") {
        const injuries = this.effects.filter(e => e.name.endsWith("Injury"));
        injuriesCleared = injuries.length;
        if (injuriesCleared) await this.deleteEmbeddedDocuments("ActiveEffect", injuries.map(e => e.id));
      }
    } else if (type === "break") {
      healResult = await this.healSlots(1);
      manaResult = await this.restoreMana(5);
    } else {
      return;
    }

    return Dice.postRestCard({ actor: this, type, healResult, manaResult, injuriesCleared });
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
    const roll = await new Roll(formula, this.getRollData()).evaluate();
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
    if (item.type === "gear") return this.rollAttackViaGear(itemId);
  }
}

export class CrawlerItem extends Item {
  getRollData() {
    const data = { ...(this.actor?.getRollData() ?? {}) };
    data.item = { ...this.system };
    return data;
  }
}
