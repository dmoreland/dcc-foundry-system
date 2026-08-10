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
      xp: num(0, { min: 0 }),
      hp: new fields.SchemaField({
        value: num(30),
        max: num(30),
        bonus: num(0),
        temp: num(0, { min: 0 })
      }),
      mana: new fields.SchemaField({
        value: num(5),
        max: num(5),
        bonus: num(0)
      }),
      defense: new fields.SchemaField({
        bonus: num(0),
        value: num(11)
      }),
      gold: num(0, { min: 0 }),
      caster: new fields.BooleanField({ initial: false }),
      details: new fields.SchemaField({
        race: new fields.StringField({ initial: "Unmodified Human" }),
        className: new fields.StringField({ initial: "None (unlocks on Floor 3)" }),
        background: new fields.StringField({ initial: "" }),
        biography: new fields.HTMLField({ initial: "" })
      })
    };
  }

  prepareDerivedData() {
    const a = this.attributes;

    // Effective attribute values fold in any flat bonus from race, class or elixirs.
    for (const attr of Object.values(a)) attr.total = attr.value + attr.bonus;

    this.hp.max = 20 + (a.con.total * 10) + (5 * this.level) + this.hp.bonus;
    this.mana.max = (a.int.total * 5) + (this.caster ? 5 * this.level : 0) + this.mana.bonus;

    // Armour comes from equipped gear; the bonus field covers everything else.
    let armour = 0;
    for (const item of this.parent?.items ?? []) {
      if (item.type !== "gear") continue;
      if (item.system.equipped) armour += item.system.armour ?? 0;
    }
    this.defense.value = 10 + a.dex.total + armour + this.defense.bonus;

    this.hp.value = Math.min(this.hp.value, this.hp.max);
    this.mana.value = Math.min(this.mana.value, this.mana.max);
  }

  getRollData() {
    const data = { level: this.level, defense: this.defense.value };
    for (const [key, attr] of Object.entries(this.attributes)) data[key] = attr.total;
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
      hp: new fields.SchemaField({ value: num(15), max: num(15) }),
      defense: num(12),
      attack: num(3),
      damage: new fields.StringField({ initial: "1d6" }),
      elite: new fields.BooleanField({ initial: false }),
      traits: new fields.HTMLField({ initial: "" })
    };
  }

  getRollData() {
    return { level: this.level, attack: this.attack, defense: this.defense };
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
      description: new fields.HTMLField({ initial: "" })
    };
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ initial: "weapon", choices: CRAWLER.gearKinds }),
      damage: new fields.StringField({ initial: "1d6" }),
      attribute: new fields.StringField({ initial: "str" }),
      skill: new fields.StringField({ initial: "Brawl" }),
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
      cost: num(0, { min: 0 }),
      description: new fields.HTMLField({ initial: "" })
    };
  }
}
