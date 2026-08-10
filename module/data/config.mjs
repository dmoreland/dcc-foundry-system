export const CRAWLER = {};

CRAWLER.attributes = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  cha: "Charisma",
  luc: "Luck"
};

/** Attributes that can back a skill. */
CRAWLER.skillAttributes = ["str", "dex", "con", "int", "cha"];

/** The default skill list from the rules doc, created on demand per actor. */
CRAWLER.defaultSkills = [
  ["Brawl", "str"], ["Athletics", "str"], ["Heavy Weapons", "str"], ["Intimidate", "str"],
  ["Blades", "dex"], ["Ranged", "dex"], ["Acrobatics", "dex"], ["Stealth", "dex"], ["Sleight of Hand", "dex"],
  ["Endurance", "con"], ["Resilience", "con"],
  ["Spellcraft", "int"], ["Tinker", "int"], ["Alchemy", "int"], ["Perception", "int"], ["Medicine", "int"], ["Lore", "int"],
  ["Persuade", "cha"], ["Perform", "cha"], ["Deceive", "cha"], ["Command", "cha"], ["Haggle", "cha"]
];

CRAWLER.gearKinds = {
  weapon: "Weapon",
  armour: "Armour",
  consumable: "Consumable",
  misc: "Misc"
};

CRAWLER.abilityKinds = {
  class: "Class Ability",
  race: "Racial Trait",
  status: "Status Effect",
  curse: "Curse"
};
