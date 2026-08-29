# Architecture — CRAWL (`crawler-d20`)

Developer orientation for the code layout. For install and play instructions, see [README.md](README.md).

## Overview

`crawler-d20` is a **Foundry VTT game system** implementing a lightweight homebrew d20 ruleset:
`d20 + attribute + skill rank`, weapon attacks/damage, and applying damage/healing to tokens.
It is deliberately minimal — no shared economy or meta layer.

It targets **Foundry v13 minimum, v14 verified** and commits to the modern API stack:

- **ES modules only** — one entrypoint, `module/crawler.mjs`, declared in `system.json`.
- **`TypeDataModel` schemas** for actor/item data — there is **no `template.json`**
  (deprecated in v14). Data shapes live in `module/data/models.mjs`.
- **ApplicationV2 + Handlebars** sheets, not the legacy `FormApplication`/`ActorSheet`.

Version-churn-prone core APIs are funneled through one seam, `module/helpers/compat.mjs`,
resolved at call time.

## Boot sequence

```
system.json
  └─ esmodules: ["module/crawler.mjs"]
       └─ Hooks.once("init")            ← wires the whole system
            ├─ CONFIG.CRAWLER = CRAWLER           (config.mjs)
            ├─ CONFIG.Actor/Item.documentClass    (documents.mjs)
            ├─ CONFIG.Actor/Item.dataModels       (models.mjs)
            ├─ CONFIG.Combat.initiative = "1d20 + @dex"
            ├─ game.crawler = { CrawlerActor, CrawlerItem, dice, seedWorld }
            ├─ registerHandlebarsHelpers()
            ├─ unregisterCoreSheet + registerSheet ×3   (via compat.mjs)
            └─ preload([...hbs templates])
       └─ onChatCardRender(...)          ← binds chat-card button clicks
```

All registration happens in `init`; there is no `ready` hook and no world settings.
See [module/crawler.mjs](module/crawler.mjs).

## Module map

| Path | Responsibility |
|------|----------------|
| `module/crawler.mjs` | Entrypoint. `init` hook, Handlebars helpers, sheet registration, `game.crawler` API, chat-card button dispatch. |
| `module/data/config.mjs` | The `CRAWLER` constant — pure data: attributes, default skill list, gear/ability kinds. |
| `module/data/models.mjs` | `TypeDataModel` schemas: `CrawlerData`, `MobData`, `SkillData`, `GearData`, `AbilityData`. Derived-data + `getRollData`. |
| `module/data/seed.mjs` | `seedWorld()` — creates sample mobs + gear as world documents. |
| `module/documents.mjs` | `CrawlerActor` (roll methods, `applyDamage`, `seedSkills`) and `CrawlerItem`. |
| `module/helpers/compat.mjs` | **Version-abstraction seam.** `SYSTEM_ID`, AppV2/sheet class refs, `render`/`preload`/`enrich`, sheet (un)registration, `onChatCardRender`. |
| `module/helpers/rolls.mjs` | Dice engine: `rollCheck`, `rollDamage`, `postDamageCard`, `applyToSelected`, `targetDefense`. |
| `module/sheets/crawler-sheet.mjs` | Player-character sheet (`CrawlerSheet`). |
| `module/sheets/other-sheets.mjs` | `MobSheet` and `CrawlerItemSheet`. |
| `templates/` | Handlebars: `actor/`, `item/`, `chat/` (`check-card`, `damage-card`). |
| `css/crawler.css` | Styling. |
| `lang/en.json` | Localization strings. |

## Data model

Actor and item data shapes are `TypeDataModel` subclasses in
[module/data/models.mjs](module/data/models.mjs), keyed to the types declared under
`documentTypes` in `system.json`.

- **Actors:** `crawler` (player) and `mob`.
- **Items:** `skill`, `gear`, `ability`.

**Derived data.** `CrawlerData.prepareDerivedData()` computes the sheet's live numbers. Each
attribute folds `value + bonus → total`, then:

- `hp.max   = 20 + con.total*10 + 5*level + hp.bonus`
- `mana.max = int.total*5 + (caster ? 5*level : 0) + mana.bonus`
- `defense.value = 10 + dex.total + equippedArmour + defense.bonus`

Equipped `gear` feeds Defense, so Defense is recomputed from items each prepare pass rather
than stored. `hp`/`mana` current values are clamped to their maxes.

`MobData.prepareDerivedData()` mirrors the book's Mob Stat Block (pp. 270–272): stat scores
fold to mods, then `evade.value = 10 + dex.mod + floor`, `surprise.value = 10 + int.mod +
floor`, `damageResistance.value = floor` (each gated by an `auto` flag + a manual `bonus`),
`hp.maxSlots` from Level or the `bossTier` row of Table 50 (`CRAWLER.bossSeverity`), and
`hp.slotValue` defaults to `con.mod`.

**Roll data.** `CrawlerData.getRollData()` exposes `@str`, `@dex`, …, `@level`, `@defense`;
`CrawlerActor.getRollData()` additionally builds `@skills.<slug>` (rank + floor bonus) so
formulas can reference skills by name.

There is **no world/shared state** — everything lives on the actor documents.

## Rolling, chat cards & applying damage

The dice engine is [module/helpers/rolls.mjs](module/helpers/rolls.mjs). Chat cards are the
central interaction surface.

**Check flow:**

```
CrawlerActor.rollAttribute/rollSkill/rollAttack   (documents.mjs)
     └─ Dice.rollCheck({ actor, label, mod, dc, itemId, showDamage })
          ├─ Roll "1d20 + @mod"; detect crit (nat 20) / fumble (nat 1)
          ├─ dc ?? Dice.targetDefense()  ← DC from the targeted token's Defense
          ├─ render chat/check-card.hbs
          └─ ChatMessage.create({ flags["crawler-d20"]: { actorId, tokenId, itemId, total, crit, fumble } })
```

**Damage flow:**

```
check-card [Damage]/[Critical damage]  ── or ──  MobSheet [Damage]
     └─ Dice.rollDamage(...) / Dice.postDamageCard(...)
          └─ render chat/damage-card.hbs
             flags["crawler-d20"]: { actorId, damage }
             buttons: data-crawl-action="applyDamage", data-amount, data-multiplier
```

**Button dispatch.** `onChatCardRender` (bound in `crawler.mjs`) wires `[data-crawl-action]`
clicks:
- `applyDamage` → `Dice.applyToSelected(amount, multiplier)`. **Acts on the selected
  token(s), not the card's source actor.** Multipliers: `1` full, `0.5` half, `2` double,
  `-1` heal. Only tokens the user owns are affected; temporary HP absorbs damage first.
- `damage` / `crit` → resolve the source actor from flags (token first, then world actor) and
  call `Dice.rollDamage` (crit adds maximum weapon damage on top of the rolled dice).

`targetDefense()` reads `game.user.targets.first()` and handles both scalar (`mob`) and object
(`crawler`) Defense shapes. HP changes are applied by `CrawlerActor.applyDamage()`, which is
shared by both actor types.

## Sheets

All sheets use the ApplicationV2 pattern via `HandlebarsMixin(BaseSheetV2)`, with base classes
from `compat.mjs`:

- **`CrawlerSheet`** (`ActorSheetV2`) — tabbed player sheet. Rolls, item CRUD and rank steppers
  are declared in the static `actions` map. Embedded-item fields can't ride the parent document
  form, so `_onRender` attaches `change` listeners on `[data-item-id][data-field]` inputs.
- **`MobSheet`** (`ActorSheetV2`) — one-click attack / damage rolls.
- **`CrawlerItemSheet`** (`ItemSheetV2`) — one sheet for all three item types, branching on
  `isSkill`/`isGear`/`isAbility`.

> **Gotcha:** ApplicationV2 requires each Handlebars **part** template to render exactly
> **one** root element. Every part `.hbs` therefore wraps its content in a single root
> (`<div class="crawl-sheet-body">` for the document sheets). Adding a second sibling at the
> top level of a part throws *"Template part 'main' must render a single HTML element."*

## Compatibility layer

[module/helpers/compat.mjs](module/helpers/compat.mjs) is the single place to fix core-version
namespace churn. It wraps `renderTemplate`, `loadTemplates`, `TextEditor.enrichHTML`, and
`DocumentSheetConfig.(un)registerSheet`, resolving the current namespace at call time.

If the system fails to load after a Foundry update, the likely culprits route through here or
`system.json`:

1. **Sheet registration** — `registerSheet` / `unregisterCoreSheet`.
2. **`documentTypes`** — if the build still expects `template.json`, actor/item types won't
   appear in the create dialog. (Config lives in `system.json`.)
3. **Chat-card render hook** — `onChatCardRender` double-binds `renderChatMessage` **and**
   `renderChatMessageHTML` with a `dataset.crawlerBound` guard.

## Extension points

- **New item/actor type** — add a `TypeDataModel` in `models.mjs`, register it under
  `system.json` `documentTypes` and `CONFIG.*.dataModels` in `crawler.mjs`, and register a
  sheet.
- **New skill in the standard list** — add to `CRAWLER.defaultSkills` in `config.mjs`.
- **New apply-card button** — add a `<button data-crawl-action="applyDamage" data-multiplier="…">`
  to `templates/chat/damage-card.hbs`; the existing dispatch handles it.
- **Compendium packs** — replace `seedWorld()` once packs are built with the Foundry CLI.

## Housekeeping

There is a stray empty folder literally named `{module` at the system root — a leftover from a
brace-expansion `mkdir` run in a shell that doesn't expand braces. It is empty and unreferenced;
**safe to delete**.
