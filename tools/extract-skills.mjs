/**
 * LOCAL dev tool — not part of the shipped system, and its output is git-ignored.
 *
 * Parses Chapter 4 (Skills, Spells, & Gear) of a plain-text dump of the *Dungeon
 * Crawler Carl RPG* rulebook that YOU supply from your own copy, and emits a
 * self-contained browser script:
 *
 *     tools/dist/create-dcc-skills.js
 *
 * Paste that into the Foundry dev console (F12) as the GM, or save it as a
 * "Script" macro and run it. It builds four WORLD compendium packs
 * (dcc-skills-attacks / -spells / -utilities / -passives) in the active world.
 * Re-running only adds skills that aren't already there.
 *
 *     pdftotext rules.pdf rules.txt      # produce the input (poppler)
 *     node tools/extract-skills.mjs      # regenerate tools/dist/create-dcc-skills.js
 *
 * Fields: name, governing attribute, to-hit / damage dice, damage type, range,
 * mana cost, AI favor, cooldown, healing / mana-restore flags, and the opposed /
 * unopposed / passive check type — all emitted at Rank 1. `description` is a
 * best-effort HTML build from the entry's flavour quote, effect prose, and the
 * Rank 5/10/15 upgrade lines. The two-column PDF text is messy, so eyeball the
 * result (tools/dist/skills-review.csv lists the mechanical fields).
 *
 * This output is for a LOCAL world built from your own copy of the book. It is
 * git-ignored (`rules.pdf` / `rules.txt` / `tools/dist/`) and never shipped.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "rules.txt");
const DIST = path.join(root, "tools", "dist");

if ( !existsSync(SRC) ) {
  console.error(`Missing ${SRC}. Run:  pdftotext rules.pdf rules.txt`);
  process.exit(1);
}

// --- slice out the skill content -------------------------------------------------

const raw = readFileSync(SRC, "utf8").split(/\r?\n/);

const findLine = re => {
  const i = raw.findIndex(l => re.test(l));
  if ( i < 0 ) throw new Error(`marker not found: ${re}`);
  return i;
};

// "ll" / "ee" ligatures drop out of the pdftotext dump: "Skills" -> "Ski s" etc.
const iAttacks = findLine(/^A ack Ski s$/);
const iUtil = raw.findIndex((l, n) => n > iAttacks && /^Utility Ski s$/.test(l));
const iSpells = raw.findIndex((l, n) => n > iUtil && /^LIST OF SPELLS$/.test(l));
const iEnd = raw.findIndex((l, n) => n > iSpells && /^LOOTING MOBS$/.test(l));

const regions = [
  { region: "attacks", lines: raw.slice(iAttacks + 1, iUtil) },
  { region: "utilities", lines: raw.slice(iUtil + 1, iSpells) },
  { region: "spells", lines: raw.slice(iSpells + 1, iEnd) }
];

// --- line cleaning -------------------------------------------------------------

const JUNK = [
  /^\s*$/,
  /^\d{1,3}$/,
  /^Copyright Renegade Game Studios/,
  /^CHAPTER 4: SKILLS, SPELLS, & GEAR$/,
  /^--?[A-Z]/,                       // pull-quote attributions: "--Carl"
  /^"[^"]*"?\s*$/                    // stray flavor pull-quotes on their own line
];
const isJunk = l => JUNK.some(re => re.test(l));

// Section sub-titles we must never treat as a skill entry.
const DENY = new Set([
  "ANIMAL CRAWLER & PET STRIKE SKILLS", "BASHING WEAPON SKILLS EDGED WEAPON SKILLS",
  "HAND TO HAND COMBAT SKILLS", "HAND TO HAND DAMAGE EFFECT SKILLS",
  "RANGED WEAPON SKILLS", "REACH WEAPON SKILLS", "EXPLOSIVES SKILLS", "SMOKE",
  "SPELLS IN YOUR HOTLIST", "CREATING YOUR OWN SPELLS", "LIST OF SPELLS",
  "ANIMAL CRAWLER & PET", "STRIKE SKILLS"
]);

// --- classifiers -------------------------------------------------------------

const ATTRS = { STR: "str", DEX: "dex", CON: "con", INT: "int", CHA: "cha",
  STRENGTH: "str", DEXTERITY: "dex", CONSTITUTION: "con", INTELLIGENCE: "int", CHARISMA: "cha" };

const DMG_TYPES = ["acid", "bludgeoning", "electric", "fire", "force", "holy", "ice",
  "necrotic", "piercing", "poison", "psychic", "slashing", "sonic"];

const SMALL = new Set(["of", "the", "and", "or", "in", "on", "to", "a", "vs", "for"]);
const titleCase = s => s.toLowerCase().replace(/[a-z0-9']+/g, (w, i) =>
  (i > 0 && SMALL.has(w)) ? w : w[0].toUpperCase() + w.slice(1));

const CAPS_RUN = /^((?:[A-Z0-9][A-Z0-9'&().\/-]*)(?:[ ,&]+[A-Z0-9][A-Z0-9'&().\/-]*)*)/;

const TYPE_LINE = /^(?:"[^"]*"\s*)?(Melee Attack\b|Ranged Attack\b|Passive\b|Attack,|Heal\b|Interrupt\b|Strength\b|Dexterity\b|Constitution\b|Intelligence\b|Charisma\b)/;
const isTypeLine = l => TYPE_LINE.test(l) || /\bDamage Effect,\s*Passive\b/.test(l);

const looksLikeHeader = l => {
  const m = l.match(CAPS_RUN);
  if ( !m ) return null;
  let caps = m[1].trim().replace(/[ ,&]+$/, "");
  // "PUGILISM Philistines..." / "NOGGIN NOCKER It's..." -> the caps run picks up
  // the leading capital of the following lowercase word; drop a trailing lone letter.
  caps = caps.replace(/\s+[A-Z]$/, "");
  if ( caps.length < 3 ) return null;
  if ( !/[A-Z]/.test(caps) ) return null;
  return caps;
};

const normRange = r => r.replace(/\s+/g, " ").replace(/(\d+)\s*ft\b/i, "$1 feet").trim();

// The pdftotext dump loses some glyphs: "�" stands in for x / en-dash / etc,
// and "|" for a sentence-initial "I". Best-effort repair for prose only.
const deglitch = t => t
  .replace(/(\d)\s*�\s*(\d)/g, "$1–$2")   // 1�4  -> 1–4
  .replace(/\s*�\s*/g, " × ")               // Rank �5 -> Rank ×5
  .replace(/(^|\s)\|(\s)/g, "$1I$2")
  .replace(/\s+/g, " ").trim();

const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Best-effort HTML description: flavour quote + effect prose + upgrade list. */
function buildDescription({ header, body, typeLine, preUpgrade, text }) {
  const paras = [];

  const quote = (header.match(/"([^"]+)"/) || (body[0] || "").match(/"([^"]+)"/)
    || (body[1] || "").match(/"([^"]+)"/) || [])[1];
  if ( quote ) paras.push(`<p><em>${esc(deglitch(quote))}</em></p>`);

  const prose = preUpgrade
    .replace(/s*"[^"]*"s*/g, " ")                                        // inline flavour quotes
    .replace(/^\s*(?:(?:Melee|Ranged) Attack\b,?\s*)?(?:(?:STR|DEX|CON|INT|CHA|Strength|Dexterity|Constitution|Intelligence|Charisma)\b,?\s*)?(?:[A-Za-z' ]+? Damage Effect\b,?\s*)?(?:(?:Passive|Interrupt|Attack|Heal|Area of Effect|Mind Control|Acid|Bludgeoning|Electric|Fire|Force|Holy|Ice|Necrotic|Piercing|Poison|Psychic|Slashing|Sonic)\b,?\s*)*(?:Favored:\s*[A-Za-z&\x27 ]+(?=[A-Z][a-z]|Mana|Range|$))?/, "")
    .replace(/^\s*(?:Strength|Dexterity|Constitution|Intelligence|Charisma|STR|DEX|CON|INT|CHA)\b,?\s*(?:Favored:\s*[A-Za-z&\x27 ]+(?=[A-Z][a-z]{2}|Mana|Range|$))?/, "")
    .replace(/\b(?:Mana Cost|AI Favor|Cost):\s*\d+(?:\s*\([^)]*\))?/gi, "  ")
    .replace(/\bRange:\s*(?:Self(?: only)?|Melee|Touch(?: range)?|[\d\/xX\u00d7\s]+(?:feet|ft)(?:\s*(?:Blast|Burst|Cone|Line)\s*(?:radius)?)?)/gi, "  ")
    .replace(/\bCooldown:\s*(?:Once per [A-Za-z]+|[^.]*?\d+\s*hours?|[^.]*?round|[^.]*?scene)\.?/gi, "  ")
    .replace(/\bDuration:\s*[^.]*?(?:\.|(?=\b(?:Limitations|Cooldown|You|Make|Place|Choose|Target|When|On|Your)\b))/gi, "  ")
    .replace(/\bBase Damage:\s*[0-9dD]+(?:\s*\+\s*[0-9dD]+)*(?:\s*\+\s*(?:STR|DEX|CON|INT|CHA))?\s*(?:Acid|Bludgeoning|Electric|Fire|Force|Holy|Ice|Necrotic|Piercing|Poison|Psychic|Slashing|Sonic)?(?:,\s*\d+\s*ft\s*(?:Blast|Burst)\s*(?:radius)?)?/gi, "  ")
    .replace(/\bLimitations:\s*/gi, "  ");                  // paragraph-break marker

  for ( const c of prose.split(/\s{2,}/) ) {
    const p = deglitch(c);
    if ( p.length > 1 ) paras.push(`<p>${esc(p)}</p>`);
  }

  const up = text.split(/\bUPGRADES\b/i)[1];
  if ( up && !/^\s*None\b/i.test(up) ) {
    const items = [];
    const re = /Rank\s+(\d+):\s*([^]*?)(?=\s*Rank\s+\d+:|$)/g;
    let m;
    while ( (m = re.exec(up)) ) {
      const t = deglitch(m[2]).replace(/\s*(?:CHAPTER 4.*|Copyright Renegade.*)$/i, "").trim();
      if ( t ) items.push(`<li><strong>Rank ${m[1]}:</strong> ${esc(t)}</li>`);
    }
    if ( items.length ) paras.push(`<p><strong>Upgrades</strong></p><ul>${items.join("")}</ul>`);
  }

  return paras.join("\n");
}

// --- parse ------------------------------------------------------------------

const skills = [];

for ( const { region, lines } of regions ) {
  const clean = lines.filter(l => !isJunk(l));
  for ( let i = 0; i < clean.length; i++ ) {
    const line = clean[i];
    const caps = looksLikeHeader(line);
    if ( !caps ) continue;

    // Need a following type line to confirm this is a real entry header.
    const next = clean[i + 1];
    if ( !next || !isTypeLine(next) ) continue;

    let rawName = caps;
    if ( DENY.has(rawName) ) continue;
    if ( /\bSKILLS\b/.test(rawName) ) continue;

    // strip parenthetical aliases: "ASTRAL PAW (ASTRAL HAND...)" -> "ASTRAL PAW"
    rawName = rawName.replace(/\s*\(.*$/, "").trim();
    const name = titleCase(rawName);

    // gather body until the next confirmed header
    const body = [];
    let j = i + 1;
    for ( ; j < clean.length; j++ ) {
      const bl = clean[j];
      const bc = looksLikeHeader(bl);
      if ( bc && !DENY.has(bc) && !/\bSKILLS\b/.test(bc)
           && clean[j + 1] && isTypeLine(clean[j + 1]) ) break;
      body.push(bl);
    }
    i = j - 1;

    const typeLine = body[0] || "";
    const text = body.join(" ").replace(/\s+/g, " ");
    const preUpgrade = text.split(/\bUPGRADES\b/)[0];

    skills.push(parseEntry({ region, name, header: line, body, typeLine, text, preUpgrade }));
  }
}

function parseEntry({ region, name, header, body, typeLine, text, preUpgrade }) {
  const s = {
    skillType: "utility", kind: "class", attribute: "none", damageAttribute: "same",
    rank: 1, floorBonus: 0, checkType: "unopposed", attackType: "melee",
    damage: "", damageType: "", range: "", blast: 0, manaCost: 0, aiFavor: 0, cooldown: 0,
    rankDamageDie: false, rankDamageDieFormula: "", cost: 0,
    buffScope: "none", buffSkillName: "", buffRequiresDisadvantage: false,
    buffToHitBonus: false, buffDamage: "",
    healing: false, healSlots: 0,
    manaRestore: false, manaRestoreAmount: 0, manaRestoreFull: false,
    description: ""
  };

  const passive = /\bPassive\b/.test(typeLine) || /\bDamage Effect,\s*Passive\b/.test(typeLine);
  const isRanged = /Ranged Attack/i.test(typeLine);
  const opposed = /\b[A-Z]{3}-Opposed\b/.test(text) || /\bOpposed Skill Check\b/.test(text);

  // governing attribute (to-hit / check)
  const toHit = typeLine.match(/\b(STR|DEX|CON|INT|CHA)\b/)
    || typeLine.match(/\b(Strength|Dexterity|Constitution|Intelligence|Charisma)\b/);
  if ( toHit ) s.attribute = ATTRS[toHit[1].toUpperCase()];

  // Base Damage: "1d8 + STR Piercing" / "1d12 + INT Fire, 10ft Blast radius" / "1d8 Piercing"
  // The `damage` field is DICE ONLY — the system adds the Stat Mod itself from the
  // `damageAttribute` dropdown ("same" = use the to-hit attribute, "none" = no mod).
  const dmg = preUpgrade.match(/Base Damage:\s*([^]*?)(?:\.|UPGRADES|$)/i);
  let dmgStat = null;   // resolved into s.damageAttribute after the region block
  if ( dmg ) {
    const chunk = dmg[1];
    const dice = chunk.match(/\d+d\d+(?:\s*\+\s*\d+d\d+)*|\d+(?!d)/);
    const stat = chunk.match(/\+\s*(STR|DEX|CON|INT|CHA)\b/);
    const dt = chunk.match(new RegExp(`\\b(${DMG_TYPES.join("|")})\\b`, "i"));
    if ( dice ) s.damage = dice[0].replace(/\s+/g, "");
    dmgStat = stat ? ATTRS[stat[1].toUpperCase()] : "none";
    if ( dt ) s.damageType = dt[1].toLowerCase();
  }

  // range
  const rng = text.match(/Range:\s*(Self(?: only)?|Melee|Touch(?: range)?|\d+(?:\/\d+)?\s*(?:feet|ft)|[\dx× ]+feet)/i);
  if ( rng ) s.range = normRange(rng[1]);
  const rangedByFeet = /\d\s*feet/i.test(s.range);
  const burstOrSelf = /Burst radius|\bAura\b|Self/i.test(s.range) || /Burst radius/i.test(text);

  // area of effect: "10ft Blast radius" / "5ft Burst radius" (base entry only, not upgrades)
  const blast = preUpgrade.match(/(\d+)\s*(?:ft|feet)\s*(?:Blast|Burst)\s*radius/i);
  if ( blast ) s.blast = Number(blast[1]);

  const mana = text.match(/Mana Cost:\s*(\d+)/i);
  if ( mana ) s.manaCost = Number(mana[1]);

  const ai = text.match(/AI Favor:\s*(\d+)/i);
  if ( ai ) s.aiFavor = Number(ai[1]);

  const cd = text.match(/Cooldown:\s*([^]*?)(?:\.|Base Damage|UPGRADES|Range:|Limitations:|$)/i);
  if ( cd ) {
    const hrs = cd[1].match(/(\d+)\s*hours?/i);
    if ( hrs ) s.cooldown = Number(hrs[1]);
  }

  // healing (only for non-attacks: attack riders like Drain Life don't count)
  const isAttackEntry = region === "attacks" || (region === "spells" && !!s.damage && !passive) || !!s.damage;
  if ( !isAttackEntry && /\bHeal\b/.test(typeLine) || (!s.damage && /\b(heal|regain|mend)s?\b[^.]*Health Bar slot/i.test(text)) ) {
    if ( !s.damage ) {
      s.healing = true;
      const n = text.match(/(?:heals?|regains?)\s+(?:up to\s+)?(\d+)\s+Health Bar slot/i)
        || text.match(/Heal\s+(\d+)\s+Health Bar slot/i);
      if ( n ) s.healSlots = Math.min(Number(n[1]), 10);
    }
  }

  // mana restore (rare)
  if ( !s.damage ) {
    const mr = text.match(/(?:restores?|regain)\s+(\d+)\s+Mana/i);
    if ( mr ) { s.manaRestore = true; s.manaRestoreAmount = Number(mr[1]); }
    if ( /restore[^.]*Mana to full|full Mana|maximum Mana/i.test(text) ) { s.manaRestore = true; s.manaRestoreFull = true; }
  }

  // skill type + pack + check type
  const attackTagged = /^(?:"[^"]*"\s*)?Attack\b/.test(typeLine) || /\bAttack,/.test(typeLine);
  let pack;
  if ( region === "attacks" ) {
    if ( /\bDamage Effect,\s*Passive\b/.test(typeLine) ) {
      s.skillType = "utility"; s.checkType = "passive"; s.attribute = s.attribute || "none";
      pack = "passives";
    } else {
      s.skillType = "attack"; s.checkType = "evade";
      s.attackType = isRanged ? "ranged" : "melee";
      if ( s.attribute === "none" ) s.attribute = isRanged ? "dex" : "str";
      pack = "attacks";
    }
  } else if ( region === "spells" ) {
    s.skillType = "spell";
    if ( s.attribute === "none" ) s.attribute = "int";           // spell default
    if ( attackTagged || s.damage ) {
      s.checkType = opposed ? "opposed" : "evade";
      s.attackType = (rangedByFeet && !burstOrSelf) ? "ranged" : "melee";
    } else if ( opposed ) {
      s.checkType = "opposed";
    } else {
      s.checkType = "passive";
    }
    pack = "spells";
  } else { // utilities
    s.skillType = "utility";
    if ( passive ) { s.checkType = "passive"; pack = "passives"; }
    else { s.checkType = opposed ? "opposed" : "unopposed"; pack = "utilities"; }
  }

  // damage attribute: express which Stat Mod feeds damage via the dropdown, not the
  // dice string. "same" => use s.attribute; a specific stat => that; "none" => no mod.
  if ( dmgStat === "none" ) s.damageAttribute = "none";
  else if ( dmgStat ) s.damageAttribute = (dmgStat === s.attribute) ? "same" : dmgStat;

  s.description = buildDescription({ header, body, typeLine, preUpgrade, text });

  return { pack, name, system: s };
}

// --- emit browser script -----------------------------------------------------

const PACK_META = {
  attacks: { name: "dcc-skills-attacks", label: "DCC — Attack Skills", img: "icons/svg/sword.svg" },
  spells: { name: "dcc-skills-spells", label: "DCC — Spells", img: "icons/svg/explosion.svg" },
  utilities: { name: "dcc-skills-utilities", label: "DCC — Utility Skills", img: "icons/svg/book.svg" },
  passives: { name: "dcc-skills-passives", label: "DCC — Passive Skills & Damage Effects", img: "icons/svg/aura.svg" }
};

const DATA = { "dcc-skills-attacks": [], "dcc-skills-spells": [], "dcc-skills-utilities": [], "dcc-skills-passives": [] };
const review = [["pack", "name", "skillType", "checkType", "attribute", "dmgAttr", "attackType",
  "damage", "damageType", "range", "mana", "aiFavor", "cooldown", "heal", "healSlots"]];

const seen = new Set();
for ( const { pack, name, system } of skills.sort((a, b) => a.name.localeCompare(b.name)) ) {
  const meta = PACK_META[pack];
  const key = `${meta.name}/${name}`;
  if ( seen.has(key) ) continue;
  seen.add(key);
  DATA[meta.name].push({ name, type: "skill", img: meta.img, system });
  review.push([meta.name, name, system.skillType, system.checkType, system.attribute, system.damageAttribute,
    system.attackType, system.damage, system.damageType, system.range, system.manaCost, system.aiFavor,
    system.cooldown, system.healing, system.healSlots]);
}

const PACKS_JS = JSON.stringify(
  Object.fromEntries(Object.values(PACK_META).map(m => [m.name, m.label])), null, 2);

const script = `/* create-dcc-skills.js  —  GENERATED, do not edit by hand.
 *
 * Built locally from your own copy of the Dungeon Crawler Carl RPG rulebook by
 * tools/extract-skills.mjs. NOT distributed with the crawler-d20 system.
 *
 * HOW TO RUN (as GM, with the target world open):
 *   • paste this whole file into the browser dev console (F12 -> Console), or
 *   • create a macro of type "Script", paste it in, save, and execute it.
 *
 * It creates/updates four WORLD compendium packs and is idempotent — re-running
 * only adds skills that aren't already in the pack. Delete a pack from the
 * Compendium sidebar if you want a clean rebuild.
 *
 * Mechanical fields plus a best-effort HTML description (flavour quote, effect
 * prose, and the Rank 5/10/15 upgrade lines). Everything is at Rank 1.
 */
(async () => {
  if ( !game.user.isGM ) return ui.notifications.warn("Run create-dcc-skills as the GM.");

  const PACKS = ${PACKS_JS};
  const DATA = ${JSON.stringify(DATA, null, 2)};

  const CC = foundry?.documents?.collections?.CompendiumCollection ?? CompendiumCollection;
  let added = 0;

  for ( const [name, label] of Object.entries(PACKS) ) {
    const id = \`world.\${name}\`;
    let pack = game.packs.get(id);
    if ( !pack ) pack = await CC.createCompendium({ type: "Item", label, name, package: "world" });
    const index = await pack.getIndex();
    const have = new Set(index.map(e => e.name));
    const docs = (DATA[name] ?? []).filter(d => !have.has(d.name));
    if ( docs.length ) await Item.createDocuments(docs, { pack: id });
    added += docs.length;
    console.log(\`\${label}: +\${docs.length} added (\${have.size + docs.length} total)\`);
  }

  ui.notifications.info(\`DCC skill compendiums updated — \${added} skill(s) added.\`);
})();
`;

mkdirSync(DIST, { recursive: true });
writeFileSync(path.join(DIST, "create-dcc-skills.js"), script);
writeFileSync(path.join(DIST, "skills-review.csv"),
  review.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");

const counts = Object.fromEntries(Object.entries(DATA).map(([k, v]) => [k, v.length]));
console.log("wrote tools/dist/create-dcc-skills.js —", counts, "total", seen.size);
console.log("review table -> tools/dist/skills-review.csv");
