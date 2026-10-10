# Changelog

All notable changes to Sogrom's Table Tools.

## 1.0.1

### Dice rolling

- **Natural 1s and 20s on initiative.** A creature whose initiative roll shows a natural 20 goes first in the
  initiative order, above any higher total, and one whose roll shows a natural 1 goes last. Each keeps the initiative
  it rolled, shown in gold or red in the combat tracker. On by default; turn it off with **Natural 1s and 20s on
  initiative**, under **Dice Rolling**.
- **Natural 1s and 20s on checks.** A natural 20 on an ability check, skill check or tool check made against a DC
  always succeeds, and a natural 1 always fails, whatever the total: on request cards, where a plain d20 is judged the
  same way, and on any check D&D 5e rolls against a DC. On by default; turn it off with **Natural 1s and 20s on
  checks**, under **Dice Rolling**.
- **Natural 1s and 20s in a Roll-Off.** In a Roll-Off between two d20 rolls, a natural 20 wins outright, against any
  total but another natural 20, and a natural 1 loses to anything but another natural 1. The card says when a natural
  decided it. On by default; turn it off with **Natural 1s and 20s in a Roll-Off**, under **Dice Rolling**.
- **Natural 1s and 20s on all saves.** A natural 20 on a saving throw made against a DC always succeeds, and a natural
  1 always fails, whatever the total: saves against spells and features, concentration saves, and saves on request
  cards. Death saves keep D&D 5e's own rules. On by default; turn it off with **Natural 1s and 20s on all saves**, under
  **Dice Rolling**.

### Fixes

- **A natural 20 in chat no longer halves the frame rate.** Its gold ring is now still, and its glow breathes without
  the browser redrawing it on every frame.

## 1.0.0

The first stable release, for Foundry VTT v14 and the D&D 5e system 6.x, tested on 6.0.6. It changes nothing in how
the module plays since 0.1.3.

### Installing

- **Listed in Foundry's package browser.** Search for **Sogrom's Table Tools** under **Add-on Modules → Install
  Module**, without pasting a manifest URL.
- **A picture on the setup screen.** The module shows the Hero Card window as its image in Foundry's list of modules,
  with links to its readme, changelog and issues.

### Welcome card

- **What's new in 1.0.0.** GMs updating from an earlier release are whispered a short note of what's been added.

### For macro and module authors

- **The API is stable.** `requestRolls` and `createRequest`, and the request object they take, will keep working
  across 1.x releases. The [developer guide](docs/developer.md) documents them; the scripts' other exports stay
  internal.

## 0.1.3

### Roll requests

- **Blind GM Roll.** A third **Roll Visibility**, beside Public and Private GM Roll: only the GM sees the results,
  for a roll such as Perception, Insight or Stealth whose result the player shouldn't know.
- **A public roll with its DC shown starts shown.** In a Standard Roll with **Show DC to Players** ticked, players
  see who passed straight away, as they could already work it out. The GM can still hide it.
- **Team vs Team tells close averages apart.** Each team's average is rounded down to one decimal place rather than
  to a whole number, so 12.6 beats 12.3 instead of tying.
- **Picking who prays keeps who rolls.** Choosing Divine Intervention's one character no longer unticks everyone
  else in the other kinds of roll.
- **The Standard Roll summary counts only rolls made against a DC.** Where only some of a choice of rolls have a DC,
  a roll made without one is no longer counted as a failure in "X of Y succeeded".

### Hero Cards

- **Plain buttons on rolls.** The **Hero Card** and **Use Indomitable** buttons on a roll in chat and on a request
  card are styled as D&D 5e's own buttons are, in its light and dark themes, without their purple and teal borders.

## 0.1.2

### Licence

- **Now under the MIT License.** The code and the module's own content can be reused, changed and shared. The card
  art, made from licensed stock images, and the fonts keep their own terms, set out in LICENSE.

### Welcome card

- **A welcome card for GMs.** The first time the module runs in a world, the GMs are whispered a card saying where
  things are, with a button for each group of settings. Its **Hero Cards** link drags straight onto a character, and
  its tankard opens the request window. After an update that adds features, they get a short note of
  what's new instead. The **Welcome and What's New Cards** setting, under Gameplay Enhancements, turns them off.

### Roll requests

- **Team vs Team keeps the NPCs' rolls hidden.** As in a Roll-Off, each NPC's roll is a private GM roll, so players
  see "?" for the NPCs, and no winner, until the GM clicks **Show NPC rolls** on the card.
- **DCs start blank.** The request window no longer fills in DC 15, nor the last request's DCs: the GM sets a DC only
  if they want one, or sets it later from the card. A new **DC by default** setting, under Roll Requests, sets the
  DC each roll starts with instead.
- **Who rolls is in order of name.** The request window lists the selected tokens, the player characters, the group
  members and combatants, and the scene's other tokens each in order of name, rather than in the order the world
  happened to hold them in.

## 0.1.1

### Roll requests

- **Results wait for Dice So Nice.** A roll shows as rolling on the request card and pop-up until its 3D dice land,
  so the total, the pass or fail and the summary no longer give the result away while the dice are still moving.

## 0.0.7

### Roll requests

- **Divine Intervention asks one character.** The request window picks who rolls with radio buttons, without the
  quick picks or **Select All**, and a request through the API for more than one actor is refused.
- **Divine Intervention's card ends on the verdict.** Its footer says only whether the gods answer or remain silent,
  without counting how many of one answered.

## 0.0.6

For Foundry VTT v14 and the D&D 5e system 6.x.

### Hero Cards

- **Divine Intervention, played from the sheet, tells the GM.** The GM is whispered a note with a **Set Up Divine
  Intervention** button, which opens the request window set to Divine Intervention with that character the one to
  roll.
- **The card window lines up.** Every card's art starts at the same height, whether its name takes one line or two.

### Roll requests

- **Four ways to score a Team Challenge.** Choose **Scoring** in the request window: the average of the rolls, as
  before; **Half must succeed**, the Player's Handbook group check; **Leader, helped by the rest**, where the highest
  modifier's roll counts, +1 for each other success and −1 for each failure; or **Weakest link**, where the lowest
  modifier's roll counts, +1 for each other success. The card marks what each roll did for the team, and its summary
  shows the working. A new setting, **Team Challenge scoring by default**, picks where the window starts, and macros
  can pass `scoring`.
- **Quick picks in Who Rolls.** One click ticks your party, everyone in the combat, just its hostile combatants, the
  selected tokens, or everyone on the scene, and a second click unticks them. Each of your other group actors gets a
  pick too. In Team vs Team, each side has its own, and the NPCs' side starts with the hostile combatants when a combat
  is running. `requestRolls({ mode, group })` opens the window with a group ticked.

### Works with other modules

- **RSReforged.** On the cards its quick rolls draw, Hero Cards can be played on attacks used from the sheet, natural
  1s and 20s are ringed, card notes show, and a feature's die can be added to a roll from the right-click menu.
  Damage applied with its Apply buttons follows **Natural 1s and 20s on saves against damage**.
- **Midi-QOL, partly supported.** The Hero Cards feature opens the card chooser from the sheet again, instead of
  Midi's list of activities. Damage Midi applies itself follows **Natural 1s and 20s on saves against damage**, and a
  feature's die on a Midi card can be added to a roll from the right-click menu. Natural 1s and 20s are ringed on the
  saves Midi lists on its card, and a card played on a roll in chat doesn't roll its own die again through Midi's
  workflow. A card played after Midi has resolved a roll doesn't change the hits, saves or damage Midi
  has already applied: see Other modules in the GM guide.

### Settings

- **World Altering Scripts are now Gameplay Enhancements**, in Configure Settings and in the guides. The settings
  themselves are unchanged, and worlds keep what they had turned on.
- **Clearer hint for Chat Button Labels**, saying what it fixes.

### Documentation

- **A new README** introduces the module, with links to the guides.
- **The guides have moved into `docs/`**: the player guide (the old README), the GM guide and the developer guide.
- **Screenshots retaken** for the settings, the card window and the request window.

### Smaller download

- **Unused font weights removed**: Spectral's light and medium weights, which nothing used, about 150 KB.

## 0.0.5: First release

For Foundry VTT v14 and the D&D 5e system 6.x.

### Hero Cards

- **Twelve one-use cards** on the **Hero Cards** feature, each back after a long rest: Advantage, Lucky, Inspiration
  (1d6, 1d8 and 1d10), Indomitable, Relentless, Divine Intervention, Charger, Reaction Surge, Extra Strike and Mind's
  Eye.
- **Played on a roll already in chat** from the button under it, or **from the character sheet**. Each card is offered
  only on rolls it can change, and the roll is rewritten in place with a note of what the card did.
- **Played cards are shown on screen** to everyone who can see the roll, up to three side by side.
- **Natural 1s and 20s** lock the cards by default, and nothing ever rerolls a natural 1.

### Roll requests

- **The GM asks the table for rolls** from the tankard button in the chat controls: a Standard Roll, Skill Challenge,
  Team Challenge, Roll-Off, Team vs Team or Divine Intervention, each answered from a card in chat.
- **A roll can offer a choice**, each with its own DC, and the GM can change a DC after asking.
- **Results stay hidden** from players until the GM shows them, rolls are attached to the request card, and the GM can
  let someone roll again.
- **Pop-up windows** for players and the GM, and **death saves** asked for at the start of a dying creature's turn.
- **Macros** can open the request window or post a request through the module's API.

### Rolls in chat

- **Natural 1s and 20s are ringed** in red and gold.
- **Natural 1s and 20s on saves against damage**: a natural 20 takes none, and a natural 1 takes the most the damage
  could do.
- **Another feature's die**, such as Bardic Inspiration, can be added to or subtracted from a roll from the chat
  right-click menu.
- **Fighter's Indomitable** is offered on a failed save, under both the 2014 and 2024 rules.

### Gameplay Enhancements

- **Five optional enhancements**, each off until the GM turns it on: Bloodied Token Tint, Fade Unprepared Spells, Item
  Rarity Colours, Chat Button Labels and One-Tab Activities.

### Settings

- **Grouped into four menus** in Configure Settings: Hero Cards, Dice Rolling, Roll Requests and Gameplay Enhancements.
