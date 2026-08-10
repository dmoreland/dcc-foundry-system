# CRAWL — World Dungeon d20 for Foundry VTT

An unofficial Foundry system implementing the CRAWL homebrew rules: `d20 + attribute + skill rank`, Fan Points, Producer Pressure, and a Collapse Clock.

Built for **Foundry v13 minimum, v14 verified**. Uses TypeDataModel schemas and ApplicationV2 sheets — no `template.json`, which entered deprecation in v14.

## Install

1. Unzip into your Foundry data directory: `Data/systems/crawler-d20/`
   (Find it via **Configuration → User Data Path**.)
2. Restart Foundry.
3. Create a world and pick **CRAWL — World Dungeon d20** as the game system.

To install from a URL instead, host the folder somewhere and point Foundry's manifest field at `system.json` after updating the `url`, `manifest` and `download` fields in it.

## First session setup

1. Open the console (F12) or a macro and run `game.crawler.seedWorld()` — this creates the six sample mobs and the starter gear as world documents. Compendium packs need a binary LevelDB build, so this is the portable route.
2. Create a **Crawler** actor. On the Skills tab, hit **Add standard skills** to drop in all 22 skills at Rank 0.
3. The **Show Runner** panel opens automatically for the GM. If you close it, reopen with `game.crawler.openShowRunner()` — worth binding to a macro on your hotbar.

## What works

**Sheet automation**
- Attributes start at 1 with a separate bonus field for race, class and elixir boosts. Everything derives from the totals.
- HP, Mana, Defense, Luck Dice and inventory slots recalculate live. Equipped armour items feed Defense automatically; slot usage turns amber when you're overloaded.
- Click any attribute to roll it. Click a skill name to roll `d20 + attribute + rank + floor bonus`.
- Rank steppers on each skill row, plus a **Floor** column for the temporary bonuses that expire at the next safe room.

**Rolling**
- Every check posts a card showing the raw d20, the modifier and the total.
- **Target a token before attacking** and the card automatically checks the result against that token's Defense — no DC prompt needed.
- Nat 20 flags a crit; nat 1 flags a fumble and tells the crowd they loved it.
- Attack cards carry **Damage** and **Critical damage** buttons. Crit damage adds maximum weapon damage on top of the rolled dice, then auto-rolls the d6 Highlight Reel.
- Every card has **Spend Luck Die** (rolls 1d6, decrements the pool, posts the revised total) and a GM-only **+1 Fan** button.

**The Show Runner panel**
- Shared Fan Points, Producer Pressure and an 8-segment Collapse Clock, synced to every connected client through world settings.
- Spending Fan Points from the menu automatically hands the GM 1 Producer Pressure and announces the sponsored segment in chat. That feedback loop is the whole point of the ruleset, so it's enforced rather than tracked on paper.
- Ticking the clock to two-from-full posts a countdown warning; hitting full posts the 3d10-per-round collapse announcement.
- **Descend** increments the floor, resets the clock and pressure, and announces the new standard DC (10 + floor).

**Other**
- Initiative is `1d20 + @dex` out of the box.
- **Safe room** button: full heal, mana restore, Luck Dice refresh, death saves cleared, floor bonuses wiped.
- **Death save** button: rolls `d20 + CON` vs 12, tracks successes and failures, and resolves at three of either.
- Mob sheet with one-click attack, damage and gold-drop rolls.

## Deliberate omissions

- **Fan Points are GM-controlled.** Players see the panel read-only. Letting players spend would need a socket relay, since only GMs can write world settings. Straightforward to add if your table wants it.
- **No Active Effects wiring.** Status effects (Bleeding, Burning, Shaken) are Ability items you track by hand. v14's Active Effects V2 is still landing, so I left this alone rather than build against a moving target.
- **Plain textareas, not ProseMirror**, for biography and descriptions. Reliable across versions; swapping in the rich editor is a small change once you've confirmed which core version you're on.
- **No compendium packs** — see the seed function above.

## If it doesn't load

I couldn't run this against a live Foundry instance, so treat v0.1.0 as a first draft. The most likely failure points, in order:

1. **Sheet registration** — if `DocumentSheetConfig` has moved again, `module/helpers/compat.mjs` is the single place to fix it.
2. **`documentTypes` in `system.json`** — if your build still expects `template.json`, the actor types won't appear in the create dialog.
3. **Chat card buttons** — v13 renamed `renderChatMessage` to `renderChatMessageHTML`; both are wired with a double-bind guard, but a third rename would need a line in `compat.mjs`.

Open the console, grab the error, and it'll be a quick fix in one of those three files.

## Roadmap

- Loot box roller: a d20 table per rarity, posting results as a claimable chat card.
- Achievement tracking with automatic box awards.
- Socket relay so players can spend Fan Points themselves.
- Active Effects for the status list once v14's implementation settles.
- Compendium packs built with the Foundry CLI, replacing `seedWorld()`.
