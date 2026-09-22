# Spec — Encounter System (`crawler-d20`)

Design spec for making Foundry's native **Combat / encounter** machinery speak Dungeon Crawler
Carl. This is a design document, not an implementation — no code has changed. It targets the same
stack as the rest of the system (Foundry v13 min, v14 verified; ES modules; `TypeDataModel`;
ApplicationV2). See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the code layout it builds on.

## Motivation

The DCC-flavored combat rules already live in the **data and roll layers**, but the **encounter
layer** — Foundry's Combat document and its Combat Tracker sidebar — is almost entirely stock. The
only customizations today are:

- `module/crawler.mjs:20` — `CONFIG.Combat.initiative = { formula: "1d20 + @dex" }`
- Cooldowns keyed to `game.combat.round` (`module/documents.mjs:230–238`)

Everything else about an encounter — how it starts, how turns are ordered, what each combatant's
tracker row shows — is Foundry's default, which knows nothing about Surprise rounds, Health Bar
slots, or Crawlers-vs-Mobs sides. This spec closes that gap in three prioritized pieces:

1. **Surprise round** — a round-0 ambush phase driven by the existing Surprise stat.
2. **Health Bars in the tracker** — slot pips (filled / temp / multi-bar boss) as the combatant
   resource, replacing the default numeric HP bar.
3. **Group initiative** — Crawlers-vs-Mobs side initiative instead of per-token d20.

Guiding constraint: **reuse the existing data model and roll flows; add only encounter wiring.**
Evade, Surprise, Health Bar slots, Damage Resistance, and cooldowns are all already implemented —
the work is surfacing and sequencing them, not re-deriving them.

## What already exists (do not rebuild)

| Concept | Where it lives | Notes |
|---------|----------------|-------|
| **Evade** (`10 + dex.mod + …`) | `models.mjs:94` (crawler), `models.mjs:203` (mob); reactive flow in `rolls.mjs` + `documents.mjs:281` + `evade-card.hbs` | Attacker rolls; defender chooses Evade-or-take-hit. Replaces static AC. |
| **Surprise** (`10 + int.mod + …`) | `models.mjs:95` / `models.mjs:204`; boostable via Utility skills (`buffScope: "surprise"`) | Modeled as a stat and a boostable check — **no round mechanic yet.** |
| **Health Bar slots** | crawler `hp.filledSlots`/`tempSlots` (max 10, `models.mjs:29`); mob `hp.maxSlots`/`filledSlots`/`slotValue` (`models.mjs:173`) | Boss slots from `bossSeverity` Table 50 (`models.mjs:208–210`). Damage/heal applied in whole slots (`documents.mjs:311–370`). |
| **Initiative** | `crawler.mjs:20` | Stock Foundry initiative with a custom formula. |
| **Cooldowns** | `documents.mjs:230–238` | Round-keyed; already read `game.combat.round`. |

## Extension seams

Foundry exposes the encounter layer through config slots the system does **not** currently
override. Each new piece plugs into one:

| Seam | Purpose | Used by |
|------|---------|---------|
| `CONFIG.Combat.documentClass` | Subclass `Combat` — owns round/turn advancement, `startCombat`, `rollInitiative`, `nextTurn`. | Surprise round, group initiative |
| `CONFIG.Combatant.documentClass` | Subclass `Combatant` — per-token combat state, `getInitiativeRoll`, resource resolution. | Group initiative, Health Bar resource |
| `CONFIG.ui.combat` | Subclass the `CombatTracker` application — the sidebar UI. | Health Bar pips |
| Combatant flags under `SYSTEM_ID` | Per-combatant scratch state (surprised?, side, bar index). Mirrors the existing `cooldownUntil` flag pattern. | All three |

New files (proposed), to keep `crawler.mjs` a thin wiring layer as it is today:

- `module/combat/combat.mjs` — `CrawlerCombat extends Combat`
- `module/combat/combatant.mjs` — `CrawlerCombatant extends Combatant`
- `module/combat/tracker.mjs` — `CrawlerCombatTracker extends CombatTracker`
- `templates/combat/tracker.hbs` — tracker part template (Health Bar pips)

Registered in the `init` hook next to the existing `CONFIG.Combat.initiative` line, and their
templates added to the `preload([...])` list.

---

## 1. Surprise round

The one genuinely new mechanic; everything else is integration.

### Rule (book-aligned)

An encounter may open with a **Surprise phase** before round 1. Each combatant (or side — see the
group-initiative interaction below) makes a Surprise **check** against an opposing threshold.
Losers are **surprised**: on their first turn they act at a penalty or are skipped. Surprise is
already `10 + int.mod` plus bonuses (`models.mjs:95`), and Utility skills can boost a Surprise
check (`buffScope: "surprise"`), so the check itself reuses `CrawlerActor.rollSurprise`
(`documents.mjs:261`).

### Flow

```
CrawlerCombat.startCombat()
  ├─ if surprise enabled for this encounter (combat flag / dialog toggle):
  │    ├─ enter "round 0" (the surprise phase)
  │    ├─ each combatant: rollSurprise() vs threshold
  │    │     threshold = opposing side's best Surprise value (group)
  │    │                 or a GM-set DC (solo)
  │    ├─ set combatant flag  surprised: true|false
  │    └─ post one summary chat card (who is surprised)
  └─ advance to round 1
```

On turn start (`CrawlerCombat.nextTurn` / a `combatTurn` hook), if the active combatant is
`surprised` **and** it is round 1, apply the chosen penalty and clear the flag so it only bites
once.

### Design decisions to lock before build

- **Penalty model.** Pick one: (a) **skip** the surprised combatant's first turn entirely;
  (b) **flat-footed** — they may act but forgo their Evade reaction until their first turn ends;
  (c) attackers get **Advantage** against surprised targets on round 1. The system already has a
  4+-size-gap Advantage/Disadvantage concept (`config.mjs:135`), so (b)/(c) reuse familiar
  machinery. **Recommendation: (b) flat-footed** — it leans on the existing Evade reaction rather
  than adding a turn-skip special case.
- **Who checks.** Solo vs group changes the threshold. If group initiative (§3) ships together,
  make Surprise a **per-side** contest (best-vs-best or side-average); otherwise per-combatant vs a
  GM DC.
- **Opt-in.** Surprise should be a per-encounter toggle (a `Combat` flag), defaulting to a small
  "Ambush?" checkbox in the combat-create/begin path — not every fight starts surprised.

### Data / state

- `Combat` flag `surpriseEnabled: boolean`.
- Combatant flag `surprised: boolean` (set during phase, consumed on first turn).
- No new persistent schema fields — Surprise value is already derived on the actor.

---

## 2. Health Bars in the tracker

Replace the default numeric HP bar in each combatant row with DCC **slot pips**.

### Rule

- **Crawlers** always have **10** Health Bar slots (`documents.mjs:330`, max 10 at `models.mjs:29`),
  plus `tempSlots` that absorb first.
- **Mobs** have `maxSlots` = `Level` (capped 10) or, for a boss, the `bossSeverity` row + Floor
  (`models.mjs:208–210`).
- **Bosses** conceptually carry **multiple Health Bars** — the fiction's "Boss has three health
  bars." The data models a single `maxSlots` pool; the tracker can *present* it as N bars of 10 (or
  render the raw slot count) without a schema change. Decide presentation vs. data below.

### Tracker rendering

`CrawlerCombatTracker` overrides the resource portion of each combatant row to render pips:

```
● ● ● ● ● ○ ○ ○ ○ ○      (filled / empty)
● ● ● ● ● ○ ○ ○ ○ ○ ▣ ▣  (+ temp slots as a distinct glyph)
```

Source values come straight off the token actor's `system.hp` — `filledSlots`, `tempSlots`, and
`maxSlots` (crawler max is the constant 10). The player sheet already renders this exact pip idea
(`crawler-sheet.mjs:210–211`), so the tracker partial can share the filled/temp logic.

### Design decisions to lock before build

- **Multi-bar bosses: present or model?**
  - **Present (recommended, no schema change):** keep one `maxSlots` pool; the tracker draws it as
    `ceil(maxSlots / 10)` rows of 10 pips. Damage still flows through the existing single-pool
    `applyDamage`. Simplest, and matches how damage is already applied.
  - **Model:** add a `bars` array to `MobData.hp` so each bar can have its own effects/phase
    triggers. More faithful to "clearing a bar triggers an enrage," but a real data-model change and
    a rewrite of `applyDamage`. Defer unless per-bar phase triggers are actually wanted.
- **GM vs player visibility.** Mob Health Bars are often shown to players as coarse bars, not exact
  numbers. Consider a "show pips but not counts to non-owners" mode; Foundry's token resource-bar
  display settings partly cover this already via `primaryTokenAttribute: "hp"`.
- **Interaction.** Optional: clicking a pip in the tracker sets `filledSlots` (GM quick-adjust),
  reusing `CrawlerActor.applyDamage`/heal so clamping and temp-slot rules stay in one place.

### Data / state

- No schema change under the **Present** option. Only a new tracker template + resource resolver.
- The **Model** option would add `MobData.hp.bars` and is explicitly out of scope for v1.

---

## 3. Group initiative

Replace per-token d20 initiative with **side initiative**: Crawlers roll once, Mobs roll once,
higher side goes first and all its members act before the other side.

### Rule

- Two sides: **Crawlers** (actor type `crawler`) and **Mobs** (actor type `mob`). Side is derivable
  from `combatant.actor.type`, so no manual tagging is needed for the common case; allow a GM
  override flag for edge cases (a charmed mob fighting alongside crawlers).
- Each side makes **one** initiative roll. Options: highest member's `dex` mod, side leader, or a
  flat `1d20 + bestDexMod`. **Recommendation:** `1d20 + max(dex.mod across the side)` — one roll,
  cinematic, and reuses the existing `@dex` roll data.
- Within a side, order by descending `dex.mod` (stable, deterministic), or let the controlling
  player choose order (popcorn) as a later enhancement.

### Flow

```
CrawlerCombat.rollAll() / rollInitiative(ids)
  ├─ group combatants by side (actor.type, or override flag)
  ├─ one 1d20 + bestDexMod roll per side
  ├─ assign every combatant on a side the same side-initiative score
  │    tie-break within side by dex.mod (store as a decimal fraction, like the
  │    existing decimals:0 initiative — use a small epsilon so members keep a
  │    stable intra-side order without colliding across sides)
  └─ post one initiative card per side
```

`CrawlerCombatant.getInitiativeRoll` returns the shared side score; `CrawlerCombat` overrides the
group-roll entry points so the sidebar "roll all / roll NPCs" buttons produce side rolls instead of
per-token rolls.

### Design decisions to lock before build

- **Toggle vs. default.** Group initiative should be selectable per encounter (a `Combat` flag),
  falling back to the current `1d20 + @dex` per-token formula when off — don't remove the existing
  behavior, gate it.
- **Side definition.** `actor.type` is the zero-config default; the GM override flag on a combatant
  handles the exceptions. Confirm this is acceptable vs. an explicit faction field.
- **Interaction with Surprise (§1).** If both ship, the Surprise phase becomes a **side contest**
  (Crawlers' best Surprise vs Mobs' best), and a surprised **side** loses its round-1 reaction.
  This is the cleanest combined story and is the recommended pairing.

### Data / state

- `Combat` flag `groupInitiative: boolean`.
- Combatant flag `sideOverride: "crawler" | "mob" | null`.
- Reuse the initiative-score field Foundry already stores; encode intra-side order in the decimal
  places (the current config uses `decimals: 0`, so there's headroom).

---

## Rollout / phasing

Each piece is independently shippable and independently reversible (all gated behind a per-encounter
flag). Suggested order — lowest risk first:

1. **Health Bars in tracker** (§2, Present option). Pure UI over existing data; no rules change, no
   schema change. Good first slice, immediately visible.
2. **Group initiative** (§3). Contained to the Combat/Combatant subclasses; falls back to today's
   formula when off.
3. **Surprise round** (§1). Depends on the round-lifecycle overrides introduced in step 2 and reads
   best from the side model, so it lands last.

## Open questions for the author

- **Surprise penalty:** flat-footed (recommended), skip-turn, or attacker-Advantage?
- **Multi-bar bosses:** present-only (recommended for v1) or model `hp.bars`?
- **Side definition:** `actor.type` + override flag (recommended) or an explicit faction field?
- **Initiative style:** one roll per side off best DEX (recommended), or side leader / average?
- Should any of these be **world settings** (the system currently has *none* — see
  ARCHITECTURE.md "no world settings"), or stay as **per-encounter `Combat` flags**? Per-encounter
  flags preserve the "no world/shared state" property and are the recommendation.

## Non-goals (v1)

- Real-time / countdown-timer flavor from the fiction (dungeon countdowns). Interesting, but a
  separate feature from turn-based encounters.
- Per-bar boss phase triggers (enrage on bar clear) — requires the `hp.bars` data model; deferred.
- Automated targeting/line-of-sight. Out of scope; the existing manual-target → Evade flow stands.
