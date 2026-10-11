# End-to-end tests

These tests run Sogrom's Table Tools in a real Foundry, with one browser joined as the GM and another as a player. They
click the real buttons: the Roll buttons on a request card, dnd5e's roll window, the Divine Intervention
number picker, the Hero Card chooser and the request window. Then they check what each user sees.

Dice are forced, so each rule is tested exactly: natural 1s and 20s, ranges, ties and winners. Foundry turns
`CONFIG.Dice.randomUniform()` into a face with `ceil((1 - u) * faces)`, and `forceDice` feeds back the `u`
for each result wanted.

The harness is not shipped: the release archive in `.github/workflows/main.yml` lists its contents.

## Setting up

1. Copy `config.example.mjs` to `config.mjs` and set the paths. `FOUNDRY_ROOT` is Foundry's Node build, the
   folder holding `main.mjs`.
2. Link the repo into Foundry's modules folder, so the tests run the working copy. From an administrator
   prompt, or with Developer Mode on:

   ```
   mklink /J "%LOCALAPPDATA%\FoundryVTT\Data\modules\sogrom-table-tools" "H:\Code\FoundryModules\Sogroms-Table-Tools"
   ```

3. `npm install`, then `npx playwright install chromium` if Playwright has no browser yet.
4. `npm run build:packs`, so the module has its compendium packs, and again after the YAML in `src/packs/`
   changes.

Close any Foundry you have running first: only one Foundry can use the data folder at a time.

## Running

```
npm run test:e2e                 # every test
npm run test:e2e -- divine       # only tests whose name contains "divine"
HEADED=1 npm run test:e2e        # watch the browsers
```

### Compatibility runs

The same tests can run with another module that changes dnd5e's rolls or chat cards enabled, each in a world of its
own, `stt-compat-rsr` or `stt-compat-midi`:

```
STT_COMPAT=rsr npm run test:e2e                    # RSReforged
STT_COMPAT=midi STT_CANVAS=1 npm run test:e2e      # Midi-QOL, with DAE, socketlib and lib-wrapper
STT_COMPAT=rsr npm run test:e2e -- compat          # only the compatibility checks
```

Install the modules into `Data/modules` first: RSReforged 6.x, or Midi-QOL and DAE from their `dnd6` branches with
socketlib and lib-wrapper. Midi-QOL places a token for every activity used, so it needs the canvas, which
`STT_CANVAS=1` turns on. The Midi world loads Midi's "full auto" sample settings. RSReforged swaps the meaning of
Shift on a Roll button, which `clickRoll` follows.

Many tests are written against dnd5e's own roll windows and cards, which these modules skip or replace, so a failure
in a compatibility run needs reading: `tests-compat.mjs` holds the checks that are meant to pass with either. Without
`STT_COMPAT`, they run in the plain world as a baseline.

Foundry is started on port 30099 with the `stt-e2e` world, which is created on the first run. Every run
deletes the world's actors, chat, combats and scenes, then recreates the fixtures in `lib/world.mjs`:

- **Player**, a player user;
- **Aria**, the player's character, holding the Hero Cards and a Dagger;
- **Borin**, another of the player's characters, with no cards;
- **Goblin**, an NPC with a token on the active scene.

Every ability is 10 and nothing is proficient, so a check's total is exactly the die forced for it.

A failed test saves a screenshot from each browser as `fail-NN-gm.png` and `fail-NN-player.png`, and prints
the end of both consoles.

## What is tested

- `tests.mjs`: roll requests. This covers the GM's buttons, the request window's fields, carrying values
  between modes and its validation, and every mode's Roll button. It also covers the hidden summary and
  hidden DC, deleting a roll to reroll (which only the GM may do), rolls that don't count because their
  author doesn't own the actor, double clicks, the cards played from a request card, and attaching rolls to
  the request card.
- `tests-popup.mjs`: the roll request pop-ups for players and for the GM: who gets one, rolling from it,
  when it closes, redrawing when the GM shows the result, staying closed once closed, and getting it back
  after a reload.
- `tests-bonus.mjs`: adding another feature's die to a roll, or subtracting it, from the chat right-click menu,
  including through the GM when the roll isn't yours. Only the die's own roller can spend it, the GM refuses
  forged requests, and a die can't be spent twice.
- `tests-features.mjs`: Fighter's Indomitable from dnd5e's compendiums under both sets of rules: rerolling a
  failed save, the 2024 Fighter-level bonus, and when it is offered.
- `tests-cards.mjs`: Hero Cards on rolls already in chat, and from the sheet. This covers who can play
  them, and Inspiration, Luck, Advantage, Indomitable and Relentless, including when each is offered.
  It also covers spent uses, death saves, the card window's art, Advantage on the next roll, the "no cards
  left" warning and shift-click. Played cards are shown only to those who can see the roll, and a note's art
  and name are never run as HTML.

- `tests-natural-saves.mjs`: natural 1s and 20s on saves against a spell's damage. A natural 20 takes none, and a
  natural 1 takes the damage's maximum past resistance or immunity, whether it comes before the damage or after it,
  with nothing more rolled. With the setting off, damage is left to dnd5e. The canvas is
  off in the harness, so the damage tray is asked about each token rather than listing them itself.

- `tests-natural-initiative.mjs`: natural 1s and 20s on initiative. A natural 20 goes first in the initiative order
  and a natural 1 last, for the GM and the player, whatever the totals around them. An initiative typed over one has
  no natural, and with the setting off totals alone decide the order.

- `tests-natural-outcomes.mjs`: natural 1s and 20s that decide a roll. On a request card, and on a check or save dnd5e
  rolls against a DC itself, a natural 20 passes and a natural 1 fails whatever the DC. In a Roll-Off a natural 20 beats
  a higher total and a natural 1 loses to a lower one. With each setting off, totals alone decide.

- `tests-death-saves.mjs`: death save requests at the start of a dying creature's turn: who is asked, the pop-ups,
  once a round, stable creatures, and removing a request when the creature is healed.
- `tests-world-scripts.mjs`: the four settings menus, each holding its own settings, the GM's welcome card, and the five Gameplay
  Enhancements, each checked off and then on: the Bloodied tint, faded unprepared spells, rarity tints on item rows,
  labels on compact chat card buttons, and the one-tab activity layout.

The rules themselves also have unit tests in `../test`, which `npm test` runs without Foundry.

## Screenshots

`screenshots.mjs` uses the same harness to take the screenshots in `docs/images` for the user guides, with forced
dice so every run takes the same pictures. `npm run docs:screenshots` takes them all, and
`npm run docs:screenshots -- divine` only those whose name contains "divine".

## Memory

`leak-check.mjs` uses the same harness to see whether a browser's memory grows as roll requests come and go. Each
request is made from the window, rolled by all three actors, shown, and cleared from chat; each browser's heap, DOM
nodes and event listeners are measured three times, with garbage collected first. `npm run test:leaks` makes 40
requests between measurements, and `npm run test:leaks -- 100` makes 100. It fails if listeners, attached nodes or
open windows grow by one or more a request. The heap grows by a few KB a request with plain chat messages too, so its
figure is only for comparing runs.
