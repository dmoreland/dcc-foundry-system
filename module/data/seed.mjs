/**
 * Creates the sample content from the rules doc as world documents.
 * Run once from a macro or the console: game.crawler.seedWorld()
 * (Compendium packs need a binary LevelDB build, so this is the portable route.)
 */

const MOBS = [
  { name: "Corridor Crab", level: 1, hp: 15, evade: 12, damageResistance: 1, gold: "1d6",
    attacks: [{ name: "Pincer", attack: 3, damage: "1d6" }],
    traits: "<p><strong>Shell.</strong> The first hit it takes each fight deals half damage.</p>" },
  { name: "Grubby Goblin Tout", level: 2, hp: 20, evade: 13, damageResistance: 0, gold: "3d6",
    attacks: [{ name: "Sales Pitch", attack: 4, damage: "1d6+2" }],
    traits: "<p><strong>Hard Sell.</strong> Would rather sell you something mid-fight than actually fight.</p>" },
  { name: "Mimic Vending Machine", level: 3, hp: 40, evade: 11, damageResistance: 2, gold: "4d6",
    attacks: [{ name: "Bite", attack: 5, damage: "2d6" }],
    traits: "<p><strong>Swallow.</strong> On a critical hit it swallows a Crawler. Athletics DC 15 to escape.</p>" },
  { name: "Sponsored Brawler", level: 4, hp: 55, evade: 15, damageResistance: 1, gold: "6d6",
    attacks: [{ name: "Haymaker", attack: 6, damage: "2d8" }],
    traits: "<p><strong>Fan Base.</strong> Deals +2 damage while anyone is watching. Someone is always watching.</p>" },
  { name: "Screaming Hallway Choir", level: 5, hp: 30, evade: 14, damageResistance: 0, gold: "0",
    attacks: [{ name: "Discordant Wail", attack: 0, damage: "0" }],
    traits: "<p><strong>Aura.</strong> Resilience DC 14 each round or Shaken. Ignore them and they follow you.</p>" },
  { name: "The Producer's Darling", level: 6, hp: 180, evade: 17, damageResistance: 3, gold: "10d10", elite: true,
    attacks: [
      { name: "Slam", attack: 8, damage: "3d8" },
      { name: "Backhand", attack: 8, damage: "1d8" }
    ],
    traits: "<p><strong>Boss.</strong> Two actions per round. Heals 20 whenever the party spends Fan Points. Compliments you as it kills you.</p>" }
];

const GEAR = [
  { name: "Fists", kind: "weapon", slot: "hands", damage: "1d4", attribute: "str", skill: "Brawl" },
  { name: "Kitchen Knife", kind: "weapon", slot: "hands", damage: "1d6", attribute: "dex", skill: "Blades" },
  { name: "Fire Axe", kind: "weapon", slot: "hands", damage: "1d8", attribute: "str", skill: "Heavy Weapons" },
  { name: "Scavenged Maul", kind: "weapon", slot: "hands", damage: "1d12", attribute: "str", skill: "Heavy Weapons" },
  { name: "Hunting Bow", kind: "weapon", slot: "hands", damage: "1d8", attribute: "dex", skill: "Ranged" },
  { name: "Salvaged Plating", kind: "armour", slot: "torso", armour: 2 },
  { name: "Healing Potion", kind: "consumable", slot: "none", damage: "3d8", attribute: "none", quantity: 1 },
  { name: "Smoke Bomb", kind: "consumable", slot: "none", damage: "0", attribute: "none", quantity: 1 }
];

export async function seedWorld() {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can seed the world.");

  const existingMobs = new Set(game.actors.filter(a => a.type === "mob").map(a => a.name));
  const mobs = MOBS.filter(m => !existingMobs.has(m.name)).map(m => ({
    name: m.name,
    type: "mob",
    system: {
      level: m.level,
      hp: { value: m.hp, max: m.hp },
      evade: m.evade,
      damageResistance: m.damageResistance,
      attacks: m.attacks,
      elite: !!m.elite,
      traits: m.traits
    }
  }));
  if (mobs.length) await Actor.createDocuments(mobs);

  const existingGear = new Set(game.items.filter(i => i.type === "gear").map(i => i.name));
  const gear = GEAR.filter(g => !existingGear.has(g.name)).map(g => ({
    name: g.name,
    type: "gear",
    system: {
      kind: g.kind,
      slot: g.slot ?? "none",
      damage: g.damage ?? "",
      attribute: g.attribute ?? "none",
      skill: g.skill ?? "",
      armour: g.armour ?? 0,
      quantity: g.quantity ?? 1
    }
  }));
  if (gear.length) await Item.createDocuments(gear);

  ui.notifications.info(`Seeded ${mobs.length} mobs and ${gear.length} pieces of gear.`);
}
