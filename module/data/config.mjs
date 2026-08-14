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
  achievement: "Achievement",
  sponsorship: "Sponsorship",
  spell: "Spell",
  status: "Status Effect",
  curse: "Curse"
};

CRAWLER.sizes = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  huge: "Huge"
};

CRAWLER.skillCheckTypes = {
  evade: "Evade",
  unopposed: "Unopposed",
  opposed: "Opposed",
  passive: "Passive"
};

CRAWLER.gearSlots = {
  none: "None",
  head: "Head",
  torso: "Torso",
  arms: "Arms",
  hands: "Hands",
  legs: "Legs",
  feet: "Feet",
  accessory: "Accessory"
};

CRAWLER.damageTypes = {
  piercing: "Piercing",
  slashing: "Slashing",
  bludgeoning: "Bludgeoning",
  force: "Force",
  necrotic: "Necrotic",
  fire: "Fire",
  cold: "Cold",
  poison: "Poison",
  psychic: "Psychic"
};
