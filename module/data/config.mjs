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

/** Skill attribute choices, including "none" for passive/cross-skill skills (e.g. Aiming)
 * that don't roll against an attribute of their own. */
CRAWLER.skillAttributeChoices = {
  none: "None",
  ...CRAWLER.skillAttributes.reduce((o, k) => { o[k] = CRAWLER.attributes[k]; return o; }, {})
};

CRAWLER.gearKinds = {
  weapon: "Weapon",
  armour: "Armour",
  consumable: "Consumable",
  misc: "Misc"
};

/** Sub-category for skillType: "feature" skills (racial traits, class features, etc). */
CRAWLER.featureKinds = {
  class: "Class Ability",
  race: "Racial Trait",
  achievement: "Achievement",
  sponsorship: "Sponsorship",
  status: "Status Effect",
  curse: "Curse"
};

/** What a Skill fundamentally is — drives which fields the sheet shows. */
CRAWLER.skillTypes = {
  attack: "Attack",
  spell: "Spell",
  utility: "Utility",
  feature: "Feature"
};

/** Melee vs Ranged, for Attack/Spell skills — also what a Utility Skill's buff scope matches against. */
CRAWLER.attackTypes = {
  melee: "Melee",
  ranged: "Ranged"
};

/** What an Attack/Spell a Utility Skill's buff can apply to. */
CRAWLER.buffScopes = {
  none: "None",
  melee: "Any Melee Attack",
  ranged: "Any Ranged Attack",
  specific: "A Specific Skill"
};

CRAWLER.sizes = {
  tiny: "Tiny",
  small: "Small",
  petite: "Petite",
  medium: "Medium",
  large: "Large",
  huge: "Huge",
  colossal: "Colossal",
  gargantuan: "Gargantuan"
};

/** Numeric size class, used for the 4+ size-gap Advantage/Disadvantage rule. */
CRAWLER.sizeValues = {
  tiny: 1,
  small: 2,
  petite: 3,
  medium: 4,
  large: 5,
  huge: 6,
  colossal: 7,
  gargantuan: 8
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
  acid: "Acid",
  bludgeoning: "Bludgeoning",
  electric: "Electric",
  fire: "Fire",
  force: "Force",
  holy: "Holy",
  ice: "Ice",
  necrotic: "Necrotic",
  piercing: "Piercing",
  poison: "Poison",
  psychic: "Psychic",
  slashing: "Slashing",
  sonic: "Sonic"
};

/**
 * Stat score -> modifier brackets. Scores are the raw "Enhanced" attribute total;
 * the modifier is what actually gets added to rolls.
 */
CRAWLER.statMods = [
  { max: 2, mod: 1 },
  { max: 5, mod: 2 },
  { max: 9, mod: 3 },
  { max: 19, mod: 4 },
  { max: 49, mod: 5 },
  { max: 99, mod: 6 },
  { max: 149, mod: 7 },
  { max: 199, mod: 8 },
  { max: 299, mod: 9 },
  { max: Infinity, mod: 10 }
];

/** Convert a raw stat score into its modifier via CRAWLER.statMods. */
CRAWLER.scoreToMod = function (score) {
  const bracket = CRAWLER.statMods.find(b => score <= b.max);
  return bracket ? bracket.mod : CRAWLER.statMods.at(-1).mod;
};

/** Rank -> bonus damage dice (Table 37: Rank Damage Dice Scaling). Not doubled on a crit. */
CRAWLER.rankDamageDice = [
  { max: 1, die: "1" },
  { max: 3, die: "1d2" },
  { max: 5, die: "1d4" },
  { max: 7, die: "1d6" },
  { max: 9, die: "1d8" },
  { max: 11, die: "1d10" },
  { max: 13, die: "1d12" },
  { max: 15, die: "1d8 + 1d6" },
  { max: 17, die: "2d8" },
  { max: 19, die: "1d10 + 1d8" },
  { max: Infinity, die: "2d10" }
];

/** Bonus damage dice formula fragment for a given Skill Rank. */
CRAWLER.rankDamageDie = function (rank) {
  if (!rank || rank < 1) return "";
  const bracket = CRAWLER.rankDamageDice.find(b => rank <= b.max);
  return bracket ? bracket.die : CRAWLER.rankDamageDice.at(-1).die;
};
