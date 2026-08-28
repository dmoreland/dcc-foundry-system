# CRAWL — World Dungeon d20 for Foundry VTT

An unofficial Foundry system for running a *Dungeon Crawler Carl RPG*-style d20 game, aligned
to the official rulebook's core mechanics: Advantage/Disadvantage, a segmented 10-slot Health
Bar, reactive Evade, and the book's Stat-score-to-modifier table. No meta/economy layer (Fan
Points, AI Favor and long-term Injury recovery are tracked as inert data for now).

Built for **Foundry v13 minimum, v14 verified**. Uses TypeDataModel schemas and ApplicationV2
sheets — no `template.json`.

## Install

**Via manifest URL (recommended)**

1. In Foundry's **Setup → Game Systems** tab, click **Install System**.
2. Paste this manifest URL:
   `https://raw.githubusercontent.com/dmoreland/dcc-foundry-system/main/system.json`
3. Click **Install**.

This requires at least one [GitHub release](https://github.com/dmoreland/dcc-foundry-system/releases)
to exist (pushing a `vX.Y.Z` tag builds one automatically via GitHub Actions).

**Manual**

1. Unzip into your Foundry data directory: `Data/systems/crawler-d20/`
   (Find it via **Configuration → User Data Path**.)
2. Restart Foundry.
3. Create a world and pick **CRAWL — World Dungeon d20** as the game system.

## First session setup

(Optional) In a macro or the console, run `game.crawler.seedWorld()` to create a handful of
sample Mobs and starter Gear as world documents. There's no sample Skill content — build a
Crawler's Skills from scratch on their sheet.

## What it does

**Actors**
- **Crawler**: the five Stats (Strength, Dexterity, Constitution, Intelligence, Charisma), a
  10-slot Health Bar, Mana, Evade, Damage Resistance, Move/Step/Size, gear slots, a Hotlist,
  and Active Effects.
- **Mob**: Level, a Health Bar (10 slots by default, or a custom slot count), flat Evade/DR,
  Move/Step/Size, and a free-form list of Attacks — GMs don't roll defense for Mobs, so their
  Evade is always a passive DC.

**One unified Skill item**
Weapons, Spells, Utility Skills, and static Features (racial traits, class abilities, curses,
achievements, sponsorships) are all the same item type, distinguished by `skillType`. A weapon
or spell *is* the Skill, not a separate thing linked to one. `Gear` is slimmed to physical
inventory only — armour, consumables, accessories, and a weapon prop that links to its Attack
Skill by name.
- **Check types**: Evade (an Attack Skill or attack Spell), Unopposed, Opposed, or Passive.
- **Rank Damage Dice** (Table 37) are opt-in per Skill, with an override formula — not applied
  to every weapon automatically, since the book gates it behind specific Upgrades.
- **Damage attribute** can differ from the to-hit attribute (e.g. a ranged weapon that hits
  with DEX but damages with STR, per the book).
- **Cross-skill boosts**: a Utility Skill (the Aiming pattern) can add its Rank to a different
  Attack/Spell's to-hit roll and/or bonus damage dice, optionally requiring Disadvantage —
  selected manually from a dropdown at roll time.
- **Healing trait**: heals a flat number of Health Bar slots. **Restores Mana trait**: a flat
  amount or a full restore. Neither rolls dice or applies Damage Resistance — the book treats
  healing/Mana recovery as a stated number, never a calculation.
- Passive Skills and Features post their description to chat instead of rolling.

**Rolling**
- Every rollable button supports **Shift = Advantage, Ctrl = Disadvantage** (`2d20kh`/`2d20kl`),
  and chat cards show a full per-die breakdown.
- **Target a token before attacking** a Mob (or leave no target) and the attack resolves
  immediately against its passive Evade. Attacking a **Crawler** instead posts a pending card —
  the defender chooses to roll Evade (an active `1d20 + DEX mod` check) or take the hit.
  Nat 20 always hits, nat 1 always misses, and a natural 1 on Evade doubles the incoming damage
  and inflicts a Major Injury.
- A 4+ size-class gap between attacker and target grants Advantage (attacking up) or
  Disadvantage plus bonus damage (attacking down), per the book's size rules.
- Damage cards show the formula, a full dice breakdown, and a preview of the current target's
  Damage Resistance.

**Applying damage / healing / Mana**
- Damage and heal cards carry **Damage / ½ / ×2 / Heal** buttons that apply to whichever
  token(s) you have selected on the canvas. Damage Resistance reduces incoming damage before
  it's converted to whole Health Bar slots (partial-slot damage is lost); temporary slots
  absorb damage first for Crawlers.
- Healing and Mana-restoration cards apply their flat value directly, with no DR or conversion
  math involved.

**Resting**
The Character tab has buttons for the book's passive-recovery rules: **Take a Break** (the
1-hour trickle: 1 Health Bar slot + 5 Mana), **Short Rest** (2 hours: 5 slots + half max Mana),
**Long Rest** (8 hours: full HP and Mana), and **Full Day's Rest** (30 hours: full HP and Mana,
plus clears all Injuries).

**Character sheet**
- Tabs (Character, Skills, Gear, Hotlist, Effects, Notes, GM Notes) sit at the top so every tab
  gets the sheet's full height to scroll in.
- The Character tab holds Vitals (Health Bar, Mana, Evade, Damage Resistance, Move/Step/Size,
  the rest buttons) and the Stat grid together.
- **Gear slots** by body part (Head/Torso/Arms/Hands/Legs/Feet, one item each) plus up to 10
  Accessories.
- **Hotlist**: pin any Skill or Gear item with the star icon for one-click access from its own
  tab, regardless of what tab it actually lives in.
- **Buffs/Debuffs** use Foundry's native Active Effects, not a custom item type.

**Other**
- Initiative is `1d20 + @dex`.

## Notes

- **Plain textareas, not ProseMirror**, for biography and descriptions — reliable across
  versions.
- **No compendium packs** — use `game.crawler.seedWorld()` for sample Mobs/Gear.
- **No migrations.** Breaking schema changes are called out in commit messages/release notes
  rather than migrated automatically; this is pre-release test data.
- **Out of scope for now**: an automated death-countdown, a formal Action-point budget, and a
  built Fan Points / AI Favor economy — those fields exist on Skills as inert data.

## Compatibility

Version-churn-prone core APIs are funnelled through `module/helpers/compat.mjs`. If the system
fails to load after a Foundry update, that file (sheet registration, template rendering, the
chat-render hook) and `documentTypes` in `system.json` are the first places to look.
