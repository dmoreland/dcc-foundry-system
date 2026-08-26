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
    return {
      level: num(1, { min: 0 }),
      floor: num(1, { min: 1 }),
      hp: new fields.SchemaField({
        maxSlots: num(3, { min: 1 }),
        filledSlots: num(3, { min: 0 }),
        slotValue: num(5, { min: 0 })
      }),
      evade: num(12),
      damageResistance: num(0),
      move: num(20, { min: 0 }),
      step: num(10, { min: 0 }),
      size: new fields.StringField({ initial: "medium", choices: CRAWLER.sizes }),
      attacks: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "Attack" }),
        attack: num(3),
        damage: new fields.StringField({ initial: "1d6" })
      }), { initial: [{ name: "Attack", attack: 3, damage: "1d6" }] }),
      elite: new fields.BooleanField({ initial: false }),
      traits: new fields.HTMLField({ initial: "" }),
      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }

  getRollData() {
    return { level: this.level, attack: this.attacks[0]?.attack ?? 0, evade: this.evade };
  }
}

/* -------------------------------------------- */
/*  Items                                       */
/* -------------------------------------------- */

export class SkillData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attribute: new fields.StringField({
        initial: "str",
        choices: CRAWLER.skillAttributes.reduce((o, k) => { o[k] = CRAWLER.attributes[k]; return o; }, {})
      }),
      rank: num(0, { min: 0, max: 5 }),
      floorBonus: num(0),
      checkType: new fields.StringField({ initial: "unopposed", choices: CRAWLER.skillCheckTypes }),
      description: new fields.HTMLField({ initial: "" })
    };
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ initial: "weapon", choices: CRAWLER.gearKinds }),
      slot: new fields.StringField({ initial: "none", choices: CRAWLER.gearSlots }),
      damage: new fields.StringField({ initial: "1d6" }),
      damageType: new fields.StringField({ initial: "", choices: CRAWLER.damageTypes, blank: true }),
      range: new fields.StringField({ initial: "5 ft" }),
      attribute: new fields.StringField({ initial: "str" }),
      skill: new fields.StringField({ initial: "Brawl" }),
      aiFavor: num(0),
      cooldown: num(0, { min: 0 }),
      armour: num(0),
      quantity: num(1, { min: 0 }),
      equipped: new fields.BooleanField({ initial: false }),
      uses: new fields.SchemaField({ value: num(0), max: num(0) }),
      description: new fields.HTMLField({ initial: "" })
    };
  }
}

export class AbilityData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ initial: "class", choices: CRAWLER.abilityKinds }),
      damage: new fields.StringField({ initial: "" }),
      damageType: new fields.StringField({ initial: "", choices: CRAWLER.damageTypes, blank: true }),
      range: new fields.StringField({ initial: "" }),
      attribute: new fields.StringField({ initial: "str" }),
      skill: new fields.StringField({ initial: "" }),
      manaCost: num(0, { min: 0 }),
      aiFavor: num(0),
      cooldown: num(0, { min: 0 }),
      cost: num(0, { min: 0 }),
      description: new fields.HTMLField({ initial: "" })
    };
  }
}
