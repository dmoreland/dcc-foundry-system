# tools/

Local development helpers. **Not part of the shipped system** — the release zip
only contains `system.json module css lang templates LICENSE README.md`.

## `extract-skills.mjs`

Parses a plain-text dump of Chapter 4 (Skills, Spells, & Gear) of the *Dungeon
Crawler Carl RPG* rulebook — which **you supply from your own copy of the book** —
into a self-contained browser script that builds four world compendium packs of
Skill items.

```sh
pdftotext rules.pdf rules.txt      # you provide rules.pdf; needs poppler
node tools/extract-skills.mjs      # writes tools/dist/create-dcc-skills.js
```

Then, in Foundry as the GM (world open), paste `tools/dist/create-dcc-skills.js`
into the dev console, or save it as a **Script** macro and run it. It creates
`DCC — Attack Skills` / `Spells` / `Utility Skills` / `Passive Skills & Damage
Effects` in the world's compendium sidebar. Re-running only adds what's missing.

Extracts mechanical fields (attribute, dice, damage type, range, blast, mana,
AI favor, cooldown, check type, healing/mana-restore) at Rank 1, plus a
best-effort HTML description built from the entry's flavour quote, effect prose,
and Rank 5/10/15 upgrade lines. The two-column PDF text is messy — skim
`tools/dist/skills-review.csv` and fix outliers on your own copies.

`rules.pdf`, `rules.txt`, and `tools/dist/` are git-ignored. Nothing
rulebook-derived is committed or distributed.
