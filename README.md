# CRAWL — World Dungeon d20 for Foundry VTT

A lightweight, unofficial Foundry system for a homebrew `d20 + attribute + skill rank`
dungeon crawler. Deliberately minimal — a dice roller and character/monster sheets to tide a
table over until the official VTT ships. No meta/economy layer.

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

1. (Optional) In a macro or the console, run `game.crawler.seedWorld()` to create the sample
   mobs and starter gear as world documents.
2. Create a **Crawler** actor. On the Skills tab, hit **Add standard skills** to drop in all 22
   skills at Rank 0.

## What it does

**Character sheet**
- Attributes start at 1 with a separate bonus field for race/class/elixir boosts; everything
  derives from the totals.
- HP, Mana and Defense recalculate live. Equipped armour feeds Defense automatically.
- Click any attribute to roll it. Click a skill name to roll `d20 + attribute + rank + bonus`.
- Rank steppers on each skill row, plus a **Floor** column for a temporary situational bonus.
- Gear (weapons / armour / consumables) and Abilities tabs, plus a plain notes/biography tab.

**Rolling**
- Every check posts a card showing the raw d20, the modifier and the total.
- **Target a token before attacking** and the card checks the result against that token's
  Defense automatically — no DC prompt.
- Nat 20 flags a crit; nat 1 flags a fumble.
- Attack cards carry **Damage** and **Critical damage** buttons. Crit damage adds maximum
  weapon damage on top of the rolled dice.

**Applying damage**
- Every damage roll posts a card with **Damage / ½ Damage / ×2 / Heal** buttons.
- Select one or more tokens on the canvas, then click a button to apply it to the tokens you
  own. Temporary HP (Crawlers) is spent before real HP; healing is capped at max HP. A chat
  notice summarises the before/after HP for each token.

**Mob sheet**
- Level, HP, Defense, Attack and Damage, with one-click Attack and Damage rolls. The damage
  roll posts the same apply-to-selected card.

**Other**
- Initiative is `1d20 + @dex`.

## Notes

- **Plain textareas, not ProseMirror**, for biography and descriptions — reliable across
  versions.
- **No compendium packs** — use `game.crawler.seedWorld()` for the sample content.

## Compatibility

Version-churn-prone core APIs are funnelled through `module/helpers/compat.mjs`. If the system
fails to load after a Foundry update, that file (sheet registration, template rendering, the
chat-render hook) and `documentTypes` in `system.json` are the first places to look.
