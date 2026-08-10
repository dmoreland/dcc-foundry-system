# Architecture — CRAWL (`crawler-d20`)

Developer orientation for the code layout. For install and play instructions, see [README.md](README.md).

## Overview

`crawler-d20` is a **Foundry VTT game system** implementing the homebrew CRAWL ruleset:
`d20 + attribute + skill rank`, plus the show-business meters (Fan Points, Producer
Pressure, Collapse Clock).

It targets **Foundry v13 minimum, v14 verified** and commits to the modern API stack:

- **ES modules only** — one entrypoint, `module/crawler.mjs`, declared in `system.json`.
- **`TypeDataModel` schemas** for actor/item data — there is **no `template.json`**
  (deprecated in v14). Data shapes live in `module/data/models.mjs`.
- **ApplicationV2 + Handlebars** sheets and apps, not the legacy `FormApplication`/`ActorSheet`.

Because those namespaces have moved between core versions, every churn-prone API call is
funneled through a single seam, `module/helpers/compat.mjs`, and resolved at call time.

## Boot sequence

```
system.json
  └─ esmodules: ["module/crawler.mjs"]
       └─ Hooks.once("init")            ← wires the whole system
            ├─ CONFIG.CRAWLER = CRAWLER          (config.mjs)
            ├─ CONFIG.Actor/Item.documentClass   (documents.mjs)
            ├─ CONFIG.Actor/Item.dataModels      (models.mjs)
            ├─ CONFIG.Combat.initiative = "1d20 + @dex"
            ├─ game.crawler = { … seedWorld, openShowRunner, dice }
            ├─ registerSettings()               (world-scoped meters)
            ├─ registerHandlebarsHelpers()
            ├─ unregisterCoreSheet + registerSheet ×3   (via compat.mjs)
            └─ preload([...hbs templates])
       └─ Hooks.once("ready")
            └─ GM only: game.crawler.openShowRunner()
       └─ onChatCardRender(...)          ← binds chat-card button clicks
```

`init` does all registration; `ready` opens the GM control panel; chat-card handlers are
bound once at module scope. See [module/crawler.mjs](module/crawler.mjs).

## Module map

| Path | Responsibility |
|------|----------------|
| `module/crawler.mjs` | Entrypoint. `init`/`ready` hooks, settings, Handlebars helpers, sheet registration, `game.crawler` API, chat-card button dispatch. |
| `module/data/config.mjs` | The `CRAWLER` constant — pure data: attributes, default skill list, gear/ability kinds, difficulty DCs, Highlight Reel table, Fan spend menu, Producer moves. |
| `module/data/models.mjs` | `TypeDataModel` schemas: `CrawlerData`, `MobData`, `SkillData`, `GearData`, `AbilityData`. Derived-data + `getRollData`. |
| `module/data/seed.mjs` | `seedWorld()` — creates sample mobs + gear as world documents (stand-in for compendium packs). |
| `module/documents.mjs` | `CrawlerActor` (roll + workflow methods) and `CrawlerItem` (roll-data merge). |
| `module/helpers/compat.mjs` | **Version-abstraction seam.** `SYSTEM_ID`, AppV2/sheet class refs, `render`/`preload`/`enrich`, sheet (un)registration, `onChatCardRender`. |
| `module/helpers/rolls.mjs` | Dice engine: `rollCheck`, `rollDamage`, `rollHighlightReel`, `spendLuck`, `awardFans`, `targetDefense`. |
| `module/sheets/crawler-sheet.mjs` | Player-character sheet (`CrawlerSheet`). |
| `module/sheets/other-sheets.mjs` | `MobSheet` and `CrawlerItemSheet`. |
| `module/apps/showrunner.mjs` | `ShowRunner` — GM control panel for the shared meters. |
| `templates/` | Handlebars: `actor/`, `item/`, `apps/`, `chat/`. |
| `css/crawler.css` | Styling. |
| `lang/en.json` | Localization strings. |

## Data model

Actor and item data shapes are `TypeDataModel` subclasses in
[module/data/models.mjs](module/data/models.mjs), keyed to the types declared under
`documentTypes` in `system.json`.

- **Actors:** `crawler` (player) and `mob`.
- **Items:** `skill`, `gear`, `ability`.

**Derived data.** `CrawlerData.prepareDerivedData()` is where the sheet's live numbers come
from. Each attribute folds `value + bonus → total`, then:

- `hp.max   = 20 + con.total*10 + 5*level + hp.bonus`
- `mana.max = int.total*5 + (caster ? 5*level : 0) + mana.bonus`
- `luck.max = max(0, luc.total + luck.bonus)`
- `slots.max = 10 + int.total`
- `defense.value = 10 + dex.total + equippedArmour + defense.bonus`
- `slots.used` sums carried gear (`slots × quantity`); `slots.overloaded` when it exceeds max.

Equipped `gear` items feed Defense and slot usage, so Defense is not stored input — it is
recomputed from items each prepare pass.

**Roll data.** `CrawlerData.getRollData()` exposes `@str`, `@dex`, …, `@level`, `@defense`;
`CrawlerActor.getRollData()` additionally builds `@skills.<slug>` (rank + floor bonus) so
formulas can reference skills by name.

## State & sync

State lives in **two distinct places** — this is the key mental model:

1. **Per-actor data** — everything on a character/mob, stored on the document via its
   `TypeDataModel`. Normal Foundry ownership rules apply.
2. **Shared table meters** — Fan Points, Producer Pressure, Collapse Clock (`clock`),
   current `floor`, and `clockMax`. These are **world settings** (`scope: "world"`),
   registered in `registerSettings()`. World settings sync to every client automatically,
   so the meters stay consistent **without any socket code**.

The tradeoff: only a GM can write world settings, so the Show Runner meters are
**GM-controlled**; players see them read-only. Each tracked setting has
`onChange: () => ShowRunner.refresh()`, which re-renders every open `ShowRunner` instance on
every client when a value changes. (A socket relay to let players spend Fan Points is a
noted roadmap item — see README.)

## Rolling & chat cards

The dice engine is [module/helpers/rolls.mjs](module/helpers/rolls.mjs). Chat cards are the
central interaction surface — a roll posts a card, and the card's buttons drive follow-up
actions.

**Resolution flow:**

```
CrawlerActor.rollAttribute/rollSkill/rollAttack   (documents.mjs)
     └─ Dice.rollCheck({ actor, label, mod, dc, itemId, showDamage })
          ├─ Roll "1d20 + @mod"; detect crit (nat 20) / fumble (nat 1)
          ├─ dc ?? Dice.targetDefense()  ← DC from the targeted token's Defense
          ├─ render chat/check-card.hbs
          └─ ChatMessage.create({ flags["crawler-d20"]: { actorId, tokenId, itemId, total, crit, fumble } })
```

**Button dispatch.** `onChatCardRender` (bound in `crawler.mjs`) reads
`flags["crawler-d20"]`, strips GM-only buttons (`[data-crawl-gm]`) for players, and wires
`[data-crawl-action]` clicks. It re-resolves the actor from the flags — **token first, then
world actor** — and dispatches:

- `luck` → `Dice.spendLuck` (rolls 1d6, decrements the pool, posts revised total)
- `fans` → `Dice.awardFans` (GM-only; writes the `fanPoints` world setting)
- `damage` / `crit` → `Dice.rollDamage` (crit adds **maximum** weapon damage on top of the
  rolled dice, then auto-rolls `rollHighlightReel`)

`targetDefense()` reads `game.user.targets.first()` and handles both scalar (`mob`) and
object (`crawler`) Defense shapes.

## Sheets

All sheets follow the ApplicationV2 pattern via `HandlebarsMixin(BaseSheetV2)`, where the
base classes come from `compat.mjs`:

- **`CrawlerSheet`** (`ActorSheetV2`) — tabbed player sheet. Rolls, item CRUD, and rank
  steppers are declared in the static `actions` map (button `data-action` → static handler,
  invoked with `this` bound to the sheet). Embedded-item fields can't ride the parent
  document form, so `_onRender` attaches `change` listeners on `[data-item-id][data-field]`
  inputs and writes each item directly.
- **`MobSheet`** (`ActorSheetV2`) — one-click attack / damage / gold rolls.
- **`CrawlerItemSheet`** (`ItemSheetV2`) — one sheet for all three item types, branching on
  `isSkill`/`isGear`/`isAbility` in context.

> **Gotcha:** ApplicationV2 requires each Handlebars **part** template to render exactly
> **one** root element. Every part `.hbs` therefore wraps its content in a single root
> (`<div class="crawl-sheet-body">` for the document sheets). Adding a second sibling at the
> top level of a part throws *"Template part 'main' must render a single HTML element."*

`ShowRunner` ([module/apps/showrunner.mjs](module/apps/showrunner.mjs)) is a plain
`ApplicationV2` (not a document sheet) using the same `actions`-map + `_prepareContext`
convention; its handlers read/write the world-setting meters.

## Compatibility layer

[module/helpers/compat.mjs](module/helpers/compat.mjs) is the single place to fix core-version
namespace churn. It re-exports the AppV2 base classes and wraps `renderTemplate`,
`loadTemplates`, `TextEditor.enrichHTML`, and `DocumentSheetConfig.(un)registerSheet` behind
functions that resolve the current namespace at call time.

If the system fails to load after a Foundry update, the three most likely culprits (in order)
all route through here or `system.json`:

1. **Sheet registration** — if `DocumentSheetConfig` moved, fix `registerSheet` /
   `unregisterCoreSheet`.
2. **`documentTypes`** — if the build still expects `template.json`, actor/item types won't
   appear in the create dialog. (Config lives in `system.json`, not compat.)
3. **Chat-card render hook** — `onChatCardRender` double-binds `renderChatMessage` **and**
   `renderChatMessageHTML` with a `dataset.crawlerBound` guard; a third rename needs one line
   here.

## Extension points

- **New item/actor type** — add a `TypeDataModel` in `models.mjs`, register it under
  `system.json` `documentTypes` and `CONFIG.*.dataModels` in `crawler.mjs`, and register a
  sheet for it.
- **New Fan spend / Producer move** — append to `CRAWLER.fanSpends` / `CRAWLER.producerMoves`
  in `config.mjs`; the Show Runner renders them from config.
- **New skill in the standard list** — add to `CRAWLER.defaultSkills`.
- **Active Effects** — currently unwired (status effects are `ability` items tracked by hand);
  hook into the data-prep pipeline in `models.mjs`.
- **Player-spendable Fan Points** — needs a socket relay, since only GMs can write world
  settings; add alongside `ShowRunner` handlers.
- **Compendium packs** — replace `seedWorld()` once packs are built with the Foundry CLI.

## Housekeeping

There is a stray empty folder literally named `{module` at the system root. It is a leftover
from a `mkdir "{module/{data,...},templates/...}"` brace-expansion command run in a shell that
doesn't expand braces (e.g. `cmd`/PowerShell), so the literal string became a directory name.
It contains nothing and is **safe to delete** — it is not referenced anywhere. (Left in place;
not part of this doc change.)
