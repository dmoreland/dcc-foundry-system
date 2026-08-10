/**
 * Creates the sample content from the rules doc as world documents.
 * Run once from a macro or the console: game.crawler.seedWorld()
 * (Compendium packs need a binary LevelDB build, so this is the portable route.)
 */

const MOBS = [
  { name: "Corridor Crab", level: 1, hp: 15, defense: 12, attack: 3, damage: "1d6", gold: "1d6",
    traits: "<p><strong>Shell.</strong> The first hit it takes each fight deals half damage.</p>" },
  { name: "Grubby Goblin Tout", level: 2, hp: 20, defense: 13, attack: 4, damage: "1d6+2", gold: "3d6",
    traits: "<p><strong>Hard Sell.</strong> Would rather sell you something mid-fight than actually fight.</p>" },
  { name: "Mimic Vending Machine", level: 3, hp: 40, defense: 11, attack: 5, damage: "2d6", gold: "4d6",
    traits: "<p><strong>Swallow.</strong> On a critical hit it swallows a Crawler. Athletics DC 15 to escape.</p>" },
  { name: "Sponsored Brawler", level: 4, hp: 55, defense: 15, attack: 6, damage: "2d8", gold: "6d6",
    traits: "<p><strong>Fan Base.</strong> Deals +2 damage while anyone is watching. Someone is always watching.</p>" },
  { name: "Screaming Hallway Choir", level: 5, hp: 30, defense: 14, attack: 0, damage: "0", gold: "0",
    traits: "<p><strong>Aura.</strong> Resilience DC 14 each round or Shaken. Ignore them and they follow you.</p>" },
  { name: "The Producer's Darling", level: 6, hp: 180, defense: 17, attack: 8, damage: "3d8", gold: "10d10", elite: true,
    traits: "<p><strong>Boss.</strong> Two actions per round. Heals 20 whenever the party spends Fan Points. Compliments you as it kills you.</p>" }
];

const GEAR = [
  { name: "Fists", kind: "weapon", damage: "1d4", attribute: "str", skill: "Brawl", slots: 0 },
  { name: "Kitchen Knife", kind: "weapon", damage: "1d6", attribute: "dex", skill: "Blades", slots: 1 },
  { name: "Fire Axe", kind: "weapon", damage: "1d8", attribute: "str", skill: "Heavy Weapons", slots: 2 },
  { name: "Scavenged Maul", kind: "weapon", damage: "1d12", attribute: "str", skill: "Heavy Weapons", slots: 3 },
  { name: "Hunting Bow", kind: "weapon", damage: "1d8", attribute: "dex", skill: "Ranged", slots: 2 },
  { name: "Salvaged Plating", kind: "armour", armour: 2, slots: 3 },
  { name: "Healing Potion", kind: "consumable", damage: "3d8", attribute: "none", slots: 1, quantity: 1 },
  { name: "Smoke Bomb", kind: "consumable", damage: "0", attribute: "none", slots: 1, quantity: 1 }
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
      defense: m.defense,
      attack: m.attack,
      damage: m.damage,
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
