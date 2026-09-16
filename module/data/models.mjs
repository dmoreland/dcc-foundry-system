import { CRAWLER } from "./config.mjs";

const fields = foundry.data.fields;

const num = (initial = 0, opts = {}) => new fields.NumberField({
  required: true, integer: true, nullable: false, initial, ...opts
});

/* -------------------------------------------- */
/*  Actor: Crawler                              */
/* -------------------------------------------- */

export class CrawlerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attributes = {};
    for (const key of Object.keys(CRAWLER.attributes)) {
      attributes[key] = new fields.SchemaField({
        value: num(1, { min: 0 }),
        bonus: num(0)
      });
    }

    return {
      attributes: new fields.SchemaField(attributes),
      level: num(1, { min: 1 }),
      floor: num(1, { min: 1 }),
      xp: num(0, { min: 0 }),
      hp: new fields.SchemaField({
        filledSlots: num(10, { min: 0, max: 10 }),
        tempSlots: num(0, { min: 0 })
      }),
      mana: new fields.SchemaField({
        value: num(5),
        max: num(5),
        bonus: num(0)
      }),
      evade: new fields.SchemaField({
        bonus: num(0),
        value: num(11)
      }),
      damageResistance: new fields.SchemaField({
        bonus: num(0),
        value: num(0)
      }),
      move: num(20, { min: 0 }),
      step: num(10, { min: 0 }),
      size: new fields.StringField({ initial: "medium", choices: CRAWLER.sizes }),
      gold: num(0, { min: 0 }),
      injuryPenalty: num(0),
      hotlist: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      details: new fields.SchemaField({
        race: new fields.StringField({ initial: "Unmodified Human" }),
        className: new fields.StringField({ initial: "None (unlocks on Floor 3)" }),
        background: new fields.StringField({ initial: "" }),
        sponsor: new fields.StringField({ initial: "" }),
        biography: new fields.HTMLField({ initial: "" })
      }),
      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }

  prepareDerivedData() {
    const a = this.attributes;

    // Effective attribute values fold in any flat bonus from race, class or elixirs (the
    // "Enhanced" score); the modifier is what actually gets added to rolls.
    for (const attr of Object.values(a)) {
      attr.total = attr.value + attr.bonus;
      attr.mod = CRAWLER.scoreToMod(attr.total);
    }

    // Health is 10 discrete slots, each worth the crawler's CON modifier.
    this.hp.slotValue = a.con.mod;
    this.hp.max = this.hp.slotValue * 10;

    this.mana.max = a.int.total + this.mana.bonus;

    // Armour comes from equipped gear; the bonus field covers everything else.
    let armour = 0;
    for (const item of this.parent?.items ?? []) {
      if (item.type !== "gear") continue;
      if (item.system.equipped) armour += item.system.armour ?? 0;
    }
    this.evade.value = 10 + a.dex.mod + this.floor + this.evade.bonus;
    this.damageResistance.value = armour + this.damageResistance.bonus;

    this.mana.value = Math.min(this.mana.value, this.mana.max);
  }

  getRollData() {
    const data = {
      level: this.level, floor: this.floor,
      evade: this.evade.value, damageResistance: this.damageResistance.value
    };
    for (const [key, attr] of Object.entries(this.attributes)) {
      data[key] = attr.mod;
      data[`${key}Score`] = attr.total;
    }
    return data;
  }
}

/* -------------------------------------------- */
/*  Actor: Mob                                  */
/* -------------------------------------------- */

export class MobData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const attributes = {};
    for (const key of CRAWLER.skillAttributes) {
      attributes[key] = new fields.SchemaField({ value: num(1, { min: 0 }) });
    }

    // Evade / Surprise / Damage Resistance follow the book's stat + Floor formulas
    // (pp. 271). `auto` on = derive `value` each prepare; off = the GM's typed number wins.
    const derivedStat = (initial) => new fields.SchemaField({
      auto: new fields.BooleanField({ initial: true }),
      bonus: num(0),
      value: num(initial)
    });

    return {
      level: num(1, { min: 0 }),
      floor: num(1, { min: 1 }),
      type: new fields.StringField({ initial: "" }),
      size: new fields.StringField({ initial: "medium", choices: CRAWLER.sizes }),
      bossTier: new fields.StringField({ initial: "none", choices: CRAWLER.bossTiers }),
      elite: new fields.BooleanField({ initial: false }),
      attributes: new fields.SchemaField(attributes),
      hp: new fields.SchemaField({
        maxSlots: num(3, { min: 1 }),
        filledSlots: num(3, { min: 0 }),
        slotValue: num(0, { min: 0 }),
        autoSlots: new fields.BooleanField({ initial: true })
      }),
      evade: derivedStat(12),
      surprise: derivedStat(11),
      damageResistance: derivedStat(1),
      move: num(20, { min: 0 }),
      step: num(10, { min: 0 }),
      attacks: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "Attack" }),
        attack: num(3),
        damage: new fields.StringField({ initial: "1d6" }),
        damageType: new fields.StringField({ initial: "", choices: CRAWLER.damageTypes, blank: true }),
        // `required: false` so Mob actors created before these fields existed still load.
        blast: new fields.NumberField({ required: false, integer: true, nullable: false, initial: 0, min: 0 }),
        notes: new fields.StringField({ initial: "" })
      }), { initial: [{ name: "Attack", attack: 3, damage: "1d6", damageType: "", blast: 0, notes: "" }] }),
      traits: new fields.HTMLField({ initial: "" }),
      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }

  prepareDerivedData() {
    const a = this.attributes;
    for (const key of CRAWLER.skillAttributes) a[key].mod = CRAWLER.scoreToMod(a[key].value);

    const F = this.floor;
    if (this.evade.auto) this.evade.value = 10 + a.dex.mod + F + this.evade.bonus;
    if (this.surprise.auto) this.surprise.value = 10 + a.int.mod + F + this.surprise.bonus;
    if (this.damageResistance.auto) this.damageResistance.value = F + this.damageResistance.bonus;

    // Health Bar (pp. 270): ordinary Mob slots = Level (max 10); Boss slots = Table 50 (tier + F).
    const boss = CRAWLER.bossSeverity[this.bossTier];
    if (this.hp.autoSlots) {
      this.hp.maxSlots = boss ? boss.hbSlots + F : Math.clamp(this.level, 1, 10);
      this.hp.filledSlots = Math.min(this.hp.filledSlots, this.hp.maxSlots);
    }
    // Each slot holds the Mob's CON Mod; fill it in when the GM hasn't overridden it.
    if (!this.hp.slotValue) this.hp.slotValue = Math.max(1, a.con.mod);

    // A Boss gets 1 Action per crawler (Table 50); Elite is a separate "named NPC" flag.
    this.isBoss = this.bossTier !== "none";
    this.bossActionsPerCrawler = this.isBoss;
  }

  getRollData() {
    const a = this.attributes;
    return {
      level: this.level, floor: this.floor,
      attack: this.attacks[0]?.attack ?? 0,
      evade: this.evade.value, surprise: this.surprise.value,
      damageResistance: this.damageResistance.value,
      str: a.str.mod, dex: a.dex.mod, con: a.con.mod, int: a.int.mod, cha: a.cha.mod
    };
  }
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

/**
 * Skill covers everything skill-shaped: Attack Skills (weapon proficiencies), Spells, Utility
 * Skills, and static Features (racial traits, class abilities, curses, status effects).
 * `skillType` drives which fields are meaningful; the sheet/item-sheet gate visibility on it.
 *
 * For an **Attack** Skill the Skill owns the to-hit (attribute + Rank + floor bonus + check
 * type) and the Rank bonus damage dice — the main damage die lives on the *weapon* (GearData)
 * that links to this Skill. `damage` here is the Skill's **innate/fallback** damage, used only
 * when the Skill is rolled with no weapon (e.g. unarmed Brawl) — a category Skill like Heavy
 * Weapons or Throwing normally leaves it blank and lets each weapon supply the die.
 * Spells, by contrast, are their own "weapon" and keep their damage on the Skill.
 */
export class SkillData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      skillType: new fields.StringField({ initial: "utility", choices: CRAWLER.skillTypes }),
      kind: new fields.StringField({ initial: "class", choices: CRAWLER.featureKinds }),
      attribute: new fields.StringField({ initial: "str", choices: CRAWLER.skillAttributeChoices }),
      damageAttribute: new fields.StringField({ initial: "same", choices: CRAWLER.damageAttributeChoices }),
      rank: num(0, { min: 0, max: 20 }),
      floorBonus: num(0),
      checkType: new fields.StringField({ initial: "unopposed", choices: CRAWLER.skillCheckTypes }),
      attackType: new fields.StringField({ initial: "melee", choices: CRAWLER.attackTypes }),
      damage: new fields.StringField({ initial: "" }),
      damageType: new fields.StringField({ initial: "", choices: CRAWLER.damageTypes, blank: true }),
      range: new fields.StringField({ initial: "" }),
      blast: num(0, { min: 0 }),
      manaCost: num(0, { min: 0 }),
      aiFavor: num(0),
      cooldown: num(0, { min: 0 }),
      rankDamageDie: new fields.BooleanField({ initial: false }),
      rankDamageDieFormula: new fields.StringField({ initial: "" }),
      cost: num(0, { min: 0 }),
      buffScope: new fields.StringField({ initial: "none", choices: CRAWLER.buffScopes }),
      buffSkillName: new fields.StringField({ initial: "" }),
      buffRequiresDisadvantage: new fields.BooleanField({ initial: false }),
      buffToHitBonus: new fields.BooleanField({ initial: false }),
      buffDamage: new fields.StringField({ initial: "" }),
      healing: new fields.BooleanField({ initial: false }),
      healSlots: num(0, { min: 0, max: 10 }),
      manaRestore: new fields.BooleanField({ initial: false }),
      manaRestoreAmount: num(0, { min: 0 }),
      manaRestoreFull: new fields.BooleanField({ initial: false }),
      description: new fields.HTMLField({ initial: "" })
    };
  }
}

/**
 * Physical inventory: armour, consumables, accessories, and — the important case — the
 * **weapon itself**, which now owns its own base damage.
 *
 * A weapon links to an Attack Skill by name (`skill`). The Skill supplies the to-hit roll
 * (attribute + Rank), the Rank bonus damage dice, and any features/buffs; the *weapon* supplies
 * the main damage die (`damage`), its type, range and blast. This is what lets one Skill back
 * many weapons — an Axe and a Maul both use "Heavy Weapons" but roll different damage, and a
 * Rock and a Stick of Dynamite both use "Throwing" (set `throwable`) with wildly different
 * damage and blast. See SkillData for the other half of the split.
 */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ initial: "weapon", choices: CRAWLER.gearKinds }),
      slot: new fields.StringField({ initial: "none", choices: CRAWLER.gearSlots }),
      skill: new fields.StringField({ initial: "" }),
      // Weapon damage lives on the item (see class doc). `damageAttribute` "same" defers to the
      // linked Skill's to-hit attribute; override it for e.g. a bow that hits with DEX, damages
      // off STR. `throwable` opts a consumable into the attack flow (spends one on a hit-roll).
      damage: new fields.StringField({ initial: "" }),
      damageType: new fields.StringField({ initial: "", choices: CRAWLER.damageTypes, blank: true }),
      damageAttribute: new fields.StringField({ initial: "same", choices: CRAWLER.damageAttributeChoices }),
      range: new fields.StringField({ initial: "" }),
      blast: num(0, { min: 0 }),
      throwable: new fields.BooleanField({ initial: false }),
      armour: num(0),
      quantity: num(1, { min: 0 }),
      equipped: new fields.BooleanField({ initial: false }),
      uses: new fields.SchemaField({ value: num(0), max: num(0) }),
      useDamage: new fields.StringField({ initial: "" }),
      useAttribute: new fields.StringField({ initial: "none" }),
      healing: new fields.BooleanField({ initial: false }),
      healSlots: num(0, { min: 0, max: 10 }),
      manaRestore: new fields.BooleanField({ initial: false }),
      manaRestoreAmount: num(0, { min: 0 }),
      manaRestoreFull: new fields.BooleanField({ initial: false }),
      description: new fields.HTMLField({ initial: "" })
    };
  }
}
