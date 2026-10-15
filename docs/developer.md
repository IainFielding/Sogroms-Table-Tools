# Sogrom's Table Tools: Developer Guide

This guide is for macro authors, module developers and contributors. It documents the module's public API, the data it
stores on documents, its settings and socket messages, and how the code and tests are laid out.

What the module does from the table's side is in the [player guide](player.md) and the [GM Guide](gm.md). How to
contribute (sign-off, commit messages, pull requests) is in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Contents

- [At a glance](#at-a-glance)
- [The API](#the-api)
  - [`requestRolls(preset)`](#requestrollspreset)
  - [`createRequest(request)`](#createrequestrequest)
  - [The request object](#the-request-object)
  - [Validation](#validation)
  - [Examples](#examples)
- [Data stored on documents](#data-stored-on-documents)
- [Settings](#settings)
- [Socket messages](#socket-messages)
- [How the Hero Cards are found](#how-the-hero-cards-are-found)
- [Hooks and integration points](#hooks-and-integration-points)
- [Code layout](#code-layout)
- [Development](#development)

## At a glance

| | |
|---|---|
| Module ID | `sogrom-table-tools` |
| Requires | Foundry VTT v14, D&D 5e 6.x (verified on 6.0.6) |
| API | `game.modules.get("sogrom-table-tools").api`, set during `init` |
| Flag scope | `sogrom-table-tools` |
| Socket | `module.sogrom-table-tools` |
| Language file | `lang/en.json`, every key under `STT` |

## The API

```js
const api = game.modules.get("sogrom-table-tools").api;
// { requestRolls, createRequest }
```

The API object is assigned in the `init` hook, so it is available from `setup` onwards, and in any macro.

Only these two functions are public. The modules in `scripts/` export other helpers, which the tests import directly,
but those are internal and may change in any release.

### `requestRolls(preset)`

Opens the **Request Rolls** window, as the tankard button in the chat controls does. If the window is already
open, it is brought to the front, keeping what the GM has filled in.

| | |
|---|---|
| `preset` | Optional. `{ mode?, actors?, group? }`: the kind of request to start on (a key of the modes table below), and who rolls, either as `actors` (actor UUIDs) or as `group`, a quick pick: `"party"`, `"combat"`, `"hostile"`, `"selected"`, `"scene"`, or `"group.<actor ID>"` for another group actor. Anything left out keeps what the window would start with. On a window already open, it changes the mode and who rolls, keeping the rest. |
| Returns | The `RollRequestConfig` application (an `ApplicationV2`), or `undefined` for a non-GM user. |
| Who | GM only. For anyone else it does nothing. |

```js
game.modules.get("sogrom-table-tools").api.requestRolls();
game.modules.get("sogrom-table-tools").api.requestRolls({ mode: "standard", group: "party" });
```

### `createRequest(request)`

Posts a roll request to chat without the window.

| | |
|---|---|
| Parameters | `request`: a [request object](#the-request-object). Anything the window always fills in may be left out. |
| Returns | `Promise<ChatMessage5e>`: the request's chat message. |
| Throws | `Error`, with a translated message, if the user isn't a GM or the request can't be rolled. Nothing is posted. |

It fills in the defaults, [validates](#validation) the request, drops any rolls (`parts`) beyond the number its mode
uses, and creates a chat message spoken by "Sogrom's Table Tools" with the request in `flags["sogrom-table-tools"].request`. Only a
message authored by a GM is drawn as a request card, so a player can't forge one by writing the flag themselves.

### The request object

```ts
interface RollRequest {
  mode: "standard" | "team" | "challenge" | "rolloff" | "versus" | "divine";
  parts: RequestPart[];      // the rolls: see the table below for how many
  actors: string[];          // actor UUIDs of everyone in the request, each once
  sides?: [string[], string[]]; // contests only: actor UUIDs on each side
  successes?: number;        // "challenge" only: successes needed, 1–3 (default 2)
  scoring?: "average" | "half" | "leader" | "weakest"; // "team" only: how it's scored (default: the "teamScoring" setting)
  range?: number;            // "divine" only: how many numbers its one actor picks, 1–50 (default 16)
  showDC?: boolean;          // show the DC to players (default: the "showDCDefault" setting)
  rollMode?: "public" | "gm" | "blind"; // "gm" is a private GM roll, "blind" a blind one (default "public")
}

interface RequestPart {
  type: "skill" | "check" | "save" | "tool" | "death" | "d20" | "d6" | "d8" | "d10" | "d12" | "d100";
  key?: string | null;       // the skill, ability or tool ID; omitted or null for a plain die
  dc: number | null;         // null for no DC
  alternatives?: { type: string, key?: string | null, dc?: number | null }[]; // other rolls the actor may make instead
}
```

**Modes**

| `mode` | Window label | `parts` used | `sides` | Notes |
|---|---|---|---|---|
| `standard` | Standard Roll | 1 | | Each actor rolls once against the DC. While `naturalChecks` is on, a natural 20 on a `skill`, `check`, `tool` or `d20` roll meets any DC and a natural 1 meets none, here and wherever a roll is judged against a DC below. `naturalSaveOutcomes` does the same for a `save` roll. Allows `alternatives`, and a `death` part with none. |
| `team` | Team Challenge | 1 | | Scored by `scoring`. `average`: everyone's totals averaged, rounded down, against the DC; each natural 1 removes the highest roll, each natural 20 the lowest. `half`: succeeds if at least half meet the DC. `leader`: the roll with the highest modifier (total less the kept d20), +1 per other success, −1 per other failure, against the DC. `weakest`: the lowest modifier, +1 per other success. All but `average` need a `dc`. Allows `alternatives`. |
| `challenge` | Skill Challenge | 3 | | Three rolls in turn, each with its own DC; `successes` of them needed. Allows `alternatives`. |
| `rolloff` | Roll-Off | 2 (one per side) | Required, exactly one actor each | Higher total wins. While `naturalRollOff` is on and both rolls are d20 rolls, a natural 20 first beats anything but another natural 20, and a natural 1 loses to anything but another natural 1. An actor no player owns rolls as a private GM roll until the GM shows it. |
| `versus` | Team vs Team | 2 (one per side) | Required, at least one actor each | Each side pooled like a Team Challenge, its average rounded down to one decimal place; higher average wins. An actor no player owns rolls as a private GM roll until the GM shows it. |
| `divine` | Divine Intervention | 1, which must be `d100` | | Exactly one actor. It picks `range` numbers in a row from 1 to 100, then must roll one of them. `dc` is ignored. |

**Part types and keys**

| `type` | `key` | Rolled with |
|---|---|---|
| `skill` | A key of `CONFIG.DND5E.skills`, e.g. `"ath"`, `"ste"`, `"prc"` | `actor.rollSkill` |
| `check` | A key of `CONFIG.DND5E.abilities`, e.g. `"str"` | `actor.rollAbilityCheck` |
| `save` | A key of `CONFIG.DND5E.abilities`, e.g. `"dex"` | `actor.rollSavingThrow` |
| `tool` | A key of `CONFIG.DND5E.tools`, e.g. `"thief"` | `actor.rollToolCheck` |
| `death` | none | `actor.rollDeathSave`, so dnd5e records the success or failure on the actor. Only in a `standard` request, with no `alternatives`; give it `dc: 10` for the card to show pass or fail. |
| `d20` | none | dnd5e's d20 test, so advantage, the roll window and the cards apply |
| `d6` `d8` `d10` `d12` `d100` | none | A plain roll |

The window offers each mode only some dice (Team vs Team offers only `d20`, for example), but `createRequest` accepts
any of them in any mode except `divine`.

**Alternatives.** In `standard`, `team` and `challenge`, a part may list up to three `alternatives`, so an actor
chooses between up to four rolls. The roll message records which was made in `requestRoll.choice`.

In `standard` and `challenge`, an alternative may give a `dc` of its own: a number, or `null` for none. An
alternative with no `dc` key shares the part's `dc`, as every alternative used to, so older requests and macros
score as they did. In `team`, whose rolls are averaged against one DC, an alternative can't give a `dc`.

**Defaults.** `withDefaults` fills in a missing or `null` value for `rollMode` (`"public"`), `showDC` (the
`showDCDefault` setting), `successes` (`2`, for `challenge`), `scoring` (the `teamScoring` setting, for `team`) and
`range` (`16`, for `divine`). Nothing else is filled in. A `team` request with no `scoring` on it, such as one posted
before there was a choice, is averaged.

### Validation

`createRequest` throws an `Error` with one of these messages (from `lang/en.json`, so they follow the user's
language), and posts nothing:

| Problem | Message |
|---|---|
| The user isn't a GM | Only a GM can post a roll request. |
| `mode` isn't one of the six | Unknown kind of roll request: {mode}. |
| `actors` isn't an array of unique, non-empty strings | A roll request's actors must be a list of actor UUIDs, each named once. |
| `actors` is empty | A roll request needs at least one actor to roll. |
| `rollMode` isn't `"public"`, `"gm"` or `"blind"` | Unknown roll visibility: {rollMode}. Use "public", "gm" or "blind". |
| A contest's `sides` aren't two non-empty arrays | Each side of a contest needs at least one actor. |
| A `rolloff` side has more than one actor | Each side of a Roll-Off needs exactly one actor. |
| Someone on a side isn't in `actors` | Everyone on a side of a contest must also be in the request's actors. |
| Fewer `parts` than the mode uses | A roll request is missing a roll. |
| `alternatives` in a mode without choices, more than three of them, or not objects | Only a Standard Roll, Team Challenge or Skill Challenge can offer a choice of rolls, and at most 4 to choose from, given as a list of alternatives. |
| An alternative with a `dc` in a `team` request | A Team Challenge's rolls are averaged against one DC, so its alternatives can't have DCs of their own. |
| A `team` request's `scoring` isn't one of the four | Unknown way to score a Team Challenge: {scoring}. Use one of: {scorings}. |
| A `team` request scored by `half`, `leader` or `weakest` with no `dc` | A Team Challenge scored by its successes needs a DC. |
| A `death` roll outside a `standard` request, or with alternatives, or as one | A death save can only be asked for in a Standard Roll, with no other rolls to choose from. |
| An unknown `type` | Unknown kind of roll: {type}. |
| A `key` that dnd5e doesn't know | Unknown {type} for a roll: {key}. Use one of: {keys}. |
| A `dc`, on a part or an alternative, that's neither a number nor `null` | A DC must be a number, or null for none: {dc}. |
| `successes` not an integer from 1 to 3 | A skill challenge needs from 1 to 3 successes, not {successes}. |
| `range` not an integer from 1 to 50 | Divine Intervention needs from 1 to 50 numbers to pick, not {range}. |
| A `divine` part that isn't `d100` | Divine Intervention's roll is a d100, not {type}. |
| A `divine` request with more than one actor | Divine Intervention needs exactly one actor. |

Actor UUIDs are checked for shape only: `createRequest` doesn't check that each actor exists.

### Examples

Each example assumes:

```js
const { createRequest } = game.modules.get("sogrom-table-tools").api;
const uuid = name => game.actors.getName(name).uuid;
const party = game.actors.filter(a => a.hasPlayerOwner && (a.type === "character")).map(a => a.uuid);
```

**Standard Roll, a DC 15 Athletics check, with the DC shown:**

```js
await createRequest({
  mode: "standard",
  parts: [{ type: "skill", key: "ath", dc: 15 }],
  actors: party,
  showDC: true
});
```

**Standard Roll with a choice, Persuasion or Deception, sharing DC 14, as a private GM roll:**

```js
await createRequest({
  mode: "standard",
  parts: [{ type: "skill", key: "per", dc: 14, alternatives: [{ type: "skill", key: "dec" }] }],
  actors: party,
  rollMode: "gm"
});
```

**Standard Roll with a choice, each at its own DC: a DC 10 Dexterity save or a DC 15 Strength save:**

```js
await createRequest({
  mode: "standard",
  parts: [{ type: "save", key: "dex", dc: 10, alternatives: [{ type: "save", key: "str", dc: 15 }] }],
  actors: party
});
```

**A plain d20 with no DC:**

```js
await createRequest({ mode: "standard", parts: [{ type: "d20", dc: null }], actors: party });
```

**A death save, for a character at 0 hit points:**

```js
await createRequest({ mode: "standard", parts: [{ type: "death", dc: 10 }], actors: [uuid("Aria")], showDC: true });
```

**Team Challenge, a DC 13 Stealth check:**

```js
await createRequest({ mode: "team", parts: [{ type: "skill", key: "ste", dc: 13 }], actors: party });
```

**Team Challenge led by the best climber, Athletics or Acrobatics, DC 15:**

```js
await createRequest({
  mode: "team",
  scoring: "leader",
  parts: [{ type: "skill", key: "ath", dc: 15, alternatives: [{ type: "skill", key: "acr" }] }],
  actors: party
});
```

**Skill Challenge, all three needed:**

```js
await createRequest({
  mode: "challenge",
  successes: 3,
  parts: [
    { type: "skill", key: "ath", dc: 12 },
    { type: "skill", key: "sur", dc: 14 },
    { type: "save", key: "con", dc: 13 }
  ],
  actors: party
});
```

**Roll-Off, a player character's d100 against a monster's Athletics check:**

```js
const aria = uuid("Aria");
const ogre = uuid("Ogre");
await createRequest({
  mode: "rolloff",
  parts: [{ type: "d100", dc: null }, { type: "skill", key: "ath", dc: null }],
  sides: [[aria], [ogre]],
  actors: [aria, ogre]
});
```

**Team vs Team, the party's Strength checks against the goblins':**

```js
const goblins = canvas.tokens.placeables.filter(t => t.actor?.name === "Goblin").map(t => t.actor.uuid);
await createRequest({
  mode: "versus",
  parts: [{ type: "check", key: "str", dc: null }, { type: "check", key: "str", dc: null }],
  sides: [party, goblins],
  actors: [...party, ...goblins]
});
```

**Divine Intervention, ten numbers each:**

```js
await createRequest({ mode: "divine", range: 10, parts: [{ type: "d100", dc: null }], actors: [uuid("Aria")] });
```

**Handling a refusal:**

```js
try {
  await createRequest({ mode: "standard", parts: [{ type: "skill", key: "athletics", dc: 12 }], actors: party });
} catch ( err ) {
  ui.notifications.error(err.message); // "Unknown skill for a roll: athletics. Use one of: acr, ani, arc, …"
}
```

## Data stored on documents

Everything Sogrom's Table Tools stores is in flags under `sogrom-table-tools`. Results are never stored on a request: the card works
them out from its roll messages each time it draws.

### On a request message

| Flag | Type | Written by | Meaning |
|---|---|---|---|
| `request` | `RollRequest` | `createRequest`, or the window | The request, with defaults filled in. Only honoured on a GM's message. Changing the DC from the card rewrites `request.parts[n].dc`, or an alternative's `dc`. |
| `revealed` | `boolean` | The GM's **Show to players** button | Whether players see the results and summary. Unset means hidden. A death save request is posted with it set, as is a public `standard` request with `showDC`, whose result players can work out for themselves. |
| `deathSave` | `{ actor: string, combat: string, round: number }` | `death-saves.mjs` | Marks a death save request posted at the start of a turn: the actor's UUID, and the combat and round it was posted for, so a turn started again posts no second request. |

### On a Divine Intervention note

| Flag | Type | Written by | Meaning |
|---|---|---|---|
| `divineSetup` | `string` | `hero-cards.mjs`, on the player's client | The UUID of the actor who played the Divine Intervention card from their sheet. The note is whispered to the GMs, whose Foundry adds a button that opens the request window set to Divine Intervention for that actor. A player could write the flag on a message of their own, but all it can do is preset the GM's window. |

### On a welcome card

| Flag | Type | Written by | Meaning |
|---|---|---|---|
| `welcome` | `"welcome" \| "whatsNew"` | `welcome.mjs` | Which card the message is. Nothing in the module reads it; it marks the card for macros and the tests. |

### On a roll made for a request

| Flag | Type | Meaning |
|---|---|---|
| `requestRoll.request` | `string` | The request message's ID. |
| `requestRoll.actor` | `string` | The UUID of the actor rolled for. |
| `requestRoll.part` | `number` | Index into `request.parts`. In a contest this is the side. |
| `requestRoll.choice` | `number` | Which of the part's rolls was made: `0` for its own, `1` onwards for an alternative. |
| `requestRoll.range` | `{ start: number, end: number }` | Divine Intervention only: the numbers picked. |

The flag is written by whoever rolls, so the card trusts none of it. A roll only counts if its author is a GM or an
owner of `actor`, its `part` exists, its actor is on that side in a contest, and, for Divine Intervention, its range is
exactly `request.range` numbers within 1 to 100. If an actor has more than one roll for the same part, the earliest
counts. The DC is never put on the roll itself, so dnd5e doesn't show players success or failure; the card scores each
roll against the request's DC.

### On any roll a card, die or feature changed

| Flag | Type | Meaning |
|---|---|---|
| `log` | `LogEntry[]` | One entry per change, oldest first, drawn as notes under the roll. |

```ts
interface LogEntry {
  text: string;   // e.g. "Lucky: rerolled the d20 (4 → 13): 4 → 13"
  card: string;   // the card's or feature's name
  by: string;     // the name of the actor who played it
  img?: string;   // a Hero Card's art. A new entry with `img` is shown on screen to everyone who can see the roll.
  icon?: string;  // Font Awesome classes, for entries without art: bonus dice and the Fighter's Indomitable
}
```

Older entries are plain strings, and are still drawn.

The roll's `rolls` are rewritten in place in the same update, so the message keeps its place in chat and dnd5e works
out hit, miss and save results again.

### On a bonus die that has been spent

| Flag | Type | Meaning |
|---|---|---|
| `bonusUsed` | `{ target: string, sign: 1 \| -1 }` | The roll it was added to (`1`) or subtracted from (`-1`), described for its note. A message with this flag can't be spent again. |

### On an actor

| Flag | Type | Meaning |
|---|---|---|
| `advantage` | `true` | The Advantage card was played from the sheet. The next d20 test gets advantage, and the flag is cleared once that roll is confirmed. |
| `stable` | `boolean` | Set in the same update as a death save that stabilizes the actor, while `deathSavePrompt` is on, since dnd5e clears the successes and leaves nothing else to show it. Set to `false` when the actor is healed or takes a death save failure. While `true`, no death save is asked for. |

### On a combatant

| Flag | Type | Meaning |
|---|---|---|
| `natural` | `20 \| 1 \| 0` | The natural 20 or 1 its initiative roll shows, or `0` for neither. Set in the same update as its initiative, and again when a card or a bonus changes the roll. While `naturalInitiative` is on, a `20` sorts it first in the initiative order and a `1` last. |

## Settings

All are world settings, read with `game.settings.get("sogrom-table-tools", key)`. None is listed in **Configure
Settings** itself: they're grouped into four menus there (`heroCards`, `diceRolling`, `rollRequests` and `worldScripts`), registered
in `settings-menus.mjs`. A setting is added to a menu through its class's `SETTINGS`.

| Key | Type | Default | Purpose |
|---|---|---|---|
| `lockNaturals` | Boolean | `true` | No card can be played on a natural 1 or 20. |
| `markNaturals` | Boolean | `true` | Ring natural 1s and 20s in chat and on request cards. |
| `naturalChecks` | Boolean | `true` | A natural 20 on a check made against a DC always succeeds, and a natural 1 always fails. Changing it redraws the chat log. |
| `naturalSaveOutcomes` | Boolean | `true` | A natural 20 on a saving throw made against a DC always succeeds, and a natural 1 always fails. Death saves are left to dnd5e. Changing it redraws the chat log. |
| `naturalSaves` | Boolean | `true` | A natural 20 on a save against an activity's damage takes none, and a natural 1 takes its maximum, ignoring resistances and immunities. |
| `naturalRollOff` | Boolean | `true` | In a Roll-Off between two d20 rolls, a natural 20 wins outright and a natural 1 loses, unless both rolled the same natural. Changing it redraws every Roll-Off card. |
| `naturalInitiative` | Boolean | `true` | A natural 20 on initiative goes first in the initiative order, and a natural 1 last. Changing it sorts every combat again. |
| `showPlayedCards` | Boolean | `true` | Show played cards' art on screen. |
| `defaultDC` | Number or `null` | `null` | The DC each roll starts with in the request window; `null` for none. |
| `showDCDefault` | Boolean | `false` | Whether **Show DC to Players** starts ticked, and the default for `createRequest`'s `showDC`. |
| `teamScoring` | String | `"average"` | How a Team Challenge is scored when the request window opens, and the default for `createRequest`'s `scoring`: `"average"`, `"half"`, `"leader"` or `"weakest"`. |
| `attachRolls` | Boolean | `true` | Draw requested rolls on the request card and hide their own messages. Changing it redraws every request and roll. |
| `popupPlayers` | Boolean | `false` | Open a pop-up for each player in a request. |
| `popupGM` | Boolean | `false` | Open a pop-up for the GM, for actors no player owns. |
| `deathSavePrompt` | Boolean | `false` | Post a death save request at the start of a dying creature's turn in combat. |
| `bloodiedTint` | Boolean | `false` | Add a red token tint and ring background to D&D 5e's Bloodied effect as it's created. |
| `fadeUnprepared` | Boolean | `false` | Fade unprepared, preparable spells of level 1 or higher on actor sheets. |
| `rarityColours` | Boolean | `false` | Tint item rows on actor sheets by rarity. |
| `oneTabActivities` | Boolean | `false` | Lay an activity sheet's tabs side by side, through the `stt-one-tab-activities` body class. |
| `welcomeCards` | Boolean | `true` | Whisper the GMs the welcome card on a world's first run, and a what's new card after a feature release. |
| `welcomeVersion` | String | `""` | Not in any menu: the last release a welcome or what's new card announced. A card is due when `WHATS_NEW` in `welcome.mjs` has a later entry. Add an entry there for each feature release; a patch adds none. |
| `chatButtonLabels` | Boolean | `false` | Show icon buttons' labels on compact chat cards, through the `stt-chat-button-labels` body class. |

## Socket messages

The manifest sets `"socket": true`, and the module listens on `module.sogrom-table-tools` from `ready`. Bonus dice use
it: a player can add a die to a roll they can see but can't update, such as a monster's, and the active GM's client
makes the change.

| `action` | Sent by | To | Payload | Effect |
|---|---|---|---|---|
| `applyBonus` | The player spending the die | The active GM only | `{ source, target, sign }`: the bonus and target message IDs, and `1` or `-1` | The GM's client checks the request again as the sender, whose ID Foundry's server supplies, then applies it. With no GM online, nothing is sent and the player is warned. |
| `bonusNotApplied` | The active GM | The sender only | `{ reason: "invalid" \| "error" }` | Warns the player that the GM refused it or couldn't apply it. The die isn't spent. Ignored unless a GM sent it. |

## How the Hero Cards are found

An item is a Hero Cards feature if any of these is true:

- its `system.identifier` is `hero-cards`;
- its `_stats.compendiumSource` ends with the compendium item's ID, `xFVsPIjSASjXaqUO`;
- its name is exactly `Hero Cards`.

Each card is an activity on that item, with one use recovered on a long rest. The cards that change a roll are
recognised by activity ID, falling back to the activity's name, case-insensitively:

| Card | Activity IDs | Name | Rolls it can be played on |
|---|---|---|---|
| Inspiration | `iE0w9Rp70zne6zuJ`, `na7uWxkaPiGn00ZK`, `l1s90u72J3Q34HFN` | `inspiration - 1d6` / `1d8` / `1d10` | attack, damage, check, save |
| Lucky | `uPqHABvpmYZr0ASg` | `lucky` | attack, damage, check, save, initiative, divine |
| Advantage | `OkUWoFMxuyT5TxX7` | `advantage` | attack, check, save, initiative, divine |
| Indomitable | `aE8dyIQUgvXfcu3M` | `indomitable` | save (a known failure) |
| Relentless | `28kjjOyF9Suf3hkq` | `relentless` | initiative (in combat round 1) |

The art for every card, including those played only from the sheet, is in `assets/images`, mapped by activity name in
`CARD_ART` in `scripts/hero-cards.mjs`. An activity with no mapped art uses its own icon.

A roll's kind comes from its chat message: dnd5e's `attack`, `damage`, `check` (or `initiative`) and `save` (not
death saves) message types; a Divine Intervention d100 from a request; and a plain d20 made for a request, which is
treated as a check.

## Hooks and integration points

Sogrom's Table Tools fires no hooks of its own. It listens to these:

| Hook | Script | Why |
|---|---|---|
| `init` | Every script with a setting, and `settings-menus.mjs` | Register settings and their menus, and set the API. `natural-initiative.mjs` also wraps `Combat#_sortCombatants` and `Combatant#getInitiativeRoll` here, as Foundry sorts each combat's turns before `setup`. `welcome.mjs` adds one click listener to the document for the welcome card's buttons, since the chat log draws earlier sessions' cards before `ready`. |
| `setup` | `hero-cards.mjs`, `natural-saves.mjs`, `natural-outcomes.mjs` | Wrap `Item#use`, the damage tray's target options (see below), and `D20Roll#isSuccess` and `D20Roll#isFailure`, so dnd5e judges a roll that carries its DC by its natural 1 or 20 where a setting says so. |
| `ready` | `bonus-rolls.mjs`, `roll-request-popup.mjs`, `natural-saves.mjs`, `welcome.mjs`, `chat-button-labels.mjs`, `one-tab-activities.mjs` | Start listening on the socket, open pop-ups for recent requests, watch RSReforged's Apply buttons, post a welcome or what's new card that is due, and apply the two layout settings. |
| `dnd5e.renderChatMessage` | `hero-cards.mjs`, `roll-requests.mjs`, `bonus-rolls.mjs`, `class-features.mjs` | Add card buttons, natural 1/20 rings, notes, request cards, and the Indomitable button. |
| `createChatMessage`, `updateChatMessage`, `deleteChatMessage` | `hero-cards.mjs`, `roll-requests.mjs`, `roll-request-popup.mjs` | Show played cards, redraw request cards, and open or close pop-ups. |
| `diceSoNiceRollComplete` | `roll-requests.mjs`, `roll-request-popup.mjs` | Redraw a request card and its pop-up once a roll's 3D dice have landed. |
| `dnd5e.preCalculateDamage` | `natural-saves.mjs` | Raise each damage to its maximum for a target the damage tray marked for it. |
| `preDeleteChatMessage` | `roll-requests.mjs` | Stop players deleting a roll made for a request. |
| `getChatMessageContextOptions` | `bonus-rolls.mjs`, `class-features.mjs` | Add **Add to a roll…**, **Subtract from a roll…** and **Use Indomitable** to the right-click menu. |
| `renderChatInput` | `roll-requests.mjs` | Add the GM's tankard button to the chat controls. |
| `preUpdateCombatant` | `natural-initiative.mjs` | Add the `natural` flag to an update that changes a combatant's initiative. |
| `renderCombatTracker` | `natural-initiative.mjs` | Colour the initiative of a combatant a natural 1 or 20 has moved. |
| `combatTurnChange` | `death-saves.mjs` | On the active GM's client, post a death save request for the creature whose turn started, while `deathSavePrompt` is on. |
| `dnd5e.rollDeathSave` | `death-saves.mjs` | Add the `stable` flag to the updates of a save that stabilizes the actor. |
| `preUpdateActor`, `updateActor` | `death-saves.mjs` | Clear the `stable` flag when the actor is healed or takes a failure, and remove its unrolled death save requests when it is healed. |
| `preCreateActiveEffect` | `bloodied-tint.mjs` | Add the tint to a Bloodied effect, while `bloodiedTint` is on. |
| `renderBaseActorSheet` | `fade-unprepared.mjs`, `rarity-colours.mjs` | Fade unprepared spells, and tint items by rarity, while their settings are on. |
| `getSceneControlButtons` | `roll-requests.mjs` | Add **Request Rolls** to the token controls. |
| `dnd5e.postUseActivity` | `hero-cards.mjs` | Note an Advantage card played from the sheet. |
| `dnd5e.preRollD20TestV2`, `dnd5e.postD20TestRollConfiguration` | `hero-cards.mjs` | Apply, then clear, that pending advantage. |

**`Item#use` is wrapped.** dnd5e has no hook before its list of an item's activities, so Sogrom's Table Tools wraps
`CONFIG.Item.documentClass.prototype.use` at `setup`. For a Hero Cards item it opens the card window instead.
Shift-click, or any other item, goes to the original. With libWrapper active, the wrapper is registered through it as
a `WRAPPER`, so it runs before a module that takes the method over, as Midi-QOL does. Without libWrapper, the method
is replaced directly, and a module that wraps `Item#use` itself sees the module's wrapper as the original.

**The damage tray's target options are wrapped.** dnd5e's `damage-application` element keeps each target's options
private, so Sogrom's Table Tools replaces its `getTargetOptions` at `setup`, giving each target its starting options the first time
the tray asks for them. A natural 20 gets a multiplier of `0`. A natural 1 gets a multiplier of `1`, its resistances and
immunities in `ignore.resistance` and `ignore.immunity`, and `{ "sogrom-table-tools": { maximize: true } }`, which the
`dnd5e.preCalculateDamage` hook reads to put each damage at its maximum, from the message's rolls evaluated with
`maximize`. Changes the GM makes in the tray afterwards are left alone.

**Rolls are changed in place.** A card, a bonus die or Indomitable rebuilds the message's `rolls` and updates the
message, rather than posting a new one. A module that caches a roll message's totals should listen to
`updateChatMessage`.

**Dice So Nice.** Dice rolled by a card or by Indomitable are shown with the speaker's dice appearance, so they look
like the roll they change.

**Carolingian UI.** Foundry loads a module's stylesheets into the `modules` cascade layer, and Carolingian UI adds its
own outside any layer, where each of its rules beats every layered rule whatever the selectors. So
`styles/compat-carolingian-ui.css` is listed in the manifest with `"layer": null`, which loads it outside the layers
too, and uses `revert-layer` to hand the request card, the played card and the card windows back to the module's own
rules. A new themed element inside `.stt-request` or a `.stt-card-dialog` window is covered without a change there; a
new themed element anywhere else needs adding to it. `placeSummaryButton()` in `hero-cards.mjs` puts a roll's card
button in the rows that Carolingian UI's compact cards draw, found through `globalThis.dnd5eCompactCards`, the registry
those cards share with Flash Token Bar 5e. `labelsSuperseded()` in `chat-button-labels.mjs` keeps **Chat Button
Labels** off while Carolingian UI is active. The `revert-layer` rules also override a user's own custom CSS on those
elements, apart from the theme's `--cc-*` variables, which `all` doesn't cover: the GM guide's **Other modules**
section says how to restyle them.

## Code layout

```
module.json           Manifest. The module ID, packs, and the dnd5e spell lists it registers.
scripts/
  hero-cards.mjs            The cards: finding them, the card window, playing them on rolls, played-card art,
                            natural 1/20 rings, and helpers shared by the others (MODULE_ID, localize, reportError).
  roll-requests.mjs         Roll requests: the API, validation, results, and drawing the request card.
  roll-request-config.mjs   The Request Rolls window (ApplicationV2).
  roll-request-popup.mjs    The roll request pop-ups.
  death-saves.mjs           Death save requests at the start of a dying creature's turn.
  bonus-rolls.mjs           Adding another feature's die to a roll, and the socket messages for it.
  class-features.mjs        Fighter's Indomitable.
  natural-saves.mjs         Natural 1s and 20s on saves against an activity's damage.
  natural-initiative.mjs    Natural 1s and 20s on initiative: first and last in the initiative order.
  natural-outcomes.mjs      Natural 1s and 20s that decide a roll made against a DC, for the rolls dnd5e judges.
  bloodied-tint.mjs         Gameplay Enhancements: the red tint on D&D 5e's Bloodied effect.
  fade-unprepared.mjs       Gameplay Enhancements: fading unprepared spells on actor sheets.
  rarity-colours.mjs        Gameplay Enhancements: tinting item rows on actor sheets by rarity.
  chat-button-labels.mjs    Gameplay Enhancements: labels on compact chat cards' icon buttons.
  one-tab-activities.mjs    Gameplay Enhancements: an activity sheet's tabs side by side.
  settings-menus.mjs        The settings menus (ApplicationV2).
  welcome.mjs               The welcome and what's new cards whispered to the GMs.
templates/roll-request.hbs  The request window's form.
templates/settings-menu.hbs A settings menu's form.
templates/welcome.hbs       The welcome and what's new cards.
styles/                     fonts.css (Cinzel and Spectral, shipped in assets/fonts), hero-cards.css, roll-requests.css,
                            world-scripts.css, settings-menus.css, welcome.css, and compat-carolingian-ui.css, loaded
                            outside the cascade layers.
lang/en.json                Every string the module shows.
assets/                     Card art, campaign art, fonts, and the module's image on Foundry's setup screen.
src/packs/                  Compendium sources, as YAML. Built into packs/ (not committed).
test/                       Unit tests (Vitest), with Foundry shims in test/helpers.
test-e2e/                   End-to-end tests, the screenshot script and the memory check, driving a real Foundry with
                            Playwright.
tools/                      Pack build/extract and manifest validation.
docs/                       The player, GM and developer guides, the art sources, and the screenshots in images/.
```

## Development

### Setting up

```sh
npm install        # dev tooling only; nothing here ships in the module archive
npm run check      # manifest validation, lint and unit tests, as CI runs them
```

Link the repository into Foundry's `Data/modules` folder as `sogrom-table-tools`, then build the compendiums. See
[CONTRIBUTING.md](../CONTRIBUTING.md#getting-set-up) for the commands.

### Compendium packs

The packs are committed as YAML in `src/packs/`, one file per document, and built into the LevelDB folders in
`packs/` that Foundry reads. Close Foundry before either command.

```sh
npm run build:packs     # YAML → packs/, after cloning or pulling
npm run extract:packs   # packs/ → YAML, after editing the packs in Foundry; then commit src/packs/
```

### Tests

| Command | What it runs |
|---|---|
| `npm test` | Unit tests of the rules (`test/`), with Foundry shimmed. No Foundry needed. |
| `npm run test:e2e` | End-to-end tests (`test-e2e/`) in a real Foundry, with a GM and a player in two browsers and the dice forced. |
| `npm run test:e2e -- divine` | Only the end-to-end tests whose name contains "divine". |
| `npm run lint` | ESLint, with no warnings allowed. |

The end-to-end harness needs a local Foundry install: copy `test-e2e/config.example.mjs` to `test-e2e/config.mjs`
and set the paths. [test-e2e/README.md](../test-e2e/README.md) explains the setup, the test world and its fixtures, and
what each file tests. Add tests for new features, and run both suites before opening a pull request.

### Screenshots

The images in `docs/images/` are taken from a real Foundry by `test-e2e/screenshots.mjs`, with the same harness and
fixtures as the end-to-end tests, and forced dice, so every run takes the same pictures. Take them again after
changing anything they show:

```sh
npm run docs:screenshots            # every screenshot
npm run docs:screenshots -- divine  # only those whose name contains "divine"
```

They are saved as WebP at twice the screen's resolution. Add a `shot()` to the script for any new screenshot the
guides use.

### Releasing

Publishing a GitHub release, tagged `v1.2.3` or `1.2.3`, runs `.github/workflows/main.yml`. It fills in the version
and URLs in `module.json`,
runs `npm run check`, builds the packs, and attaches `module.json` and `module.zip` to the release. The archive holds
only what the module needs at runtime, as listed in the workflow's `zip` step; the README, the guides in docs/, the
screenshots and the dev tooling aren't in it. Record user-facing changes in [CHANGELOG.md](../CHANGELOG.md).
