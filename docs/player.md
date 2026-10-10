# Sogrom's Table Tools

Welcome to Sogrom's Table Tools, a module for D&D 5e on Foundry VTT that adds a little extra heroism to your adventures.

The module introduces Hero Cards: powerful one-use boons that can turn a narrow miss into a success, give fate a helpful nudge, or unlock unique abilities when the moment is right. It also makes it easier to respond to your GM's roll requests and adds a few quality-of-life improvements to rolls in chat.

This guide is written for players. If you're the GM, check out the **[GM Guide](gm.md)** for setup options and advanced features. Developers and macro writers can find technical information in the **[Developer Guide](developer.md)**.

<img src="images/card-window.webp" alt="The Hero Cards window, showing the art of every card a character still has" width="640">

## Contents

- [Getting started](#getting-started)
- [The Hero Cards](#the-hero-cards)
  - [Playing a card from your character sheet](#playing-a-card-from-your-character-sheet)
  - [Using a Card on a Roll You've Already Made](#using-a-card-on-a-roll-youve-already-made)
  - [Hero Card Reference](#hero-card-reference)
  - [Natural 1s and 20s](#natural-1s-and-20s)
- [Adding another feature's die to a roll](#adding-another-features-die-to-a-roll)
- [Fighter's Indomitable](#fighters-indomitable)
- [Answering the GM's roll requests](#answering-the-gms-roll-requests)

## Getting started

If your GM has installed and enabled Sogrom's Table Tools, you're ready to go.

To use Hero Cards, your character needs the Hero Cards feature. Your GM can add this from the Items (Sogrom's Table Tools) compendium. Once added, you'll find it on your character sheet and can begin using cards straight away.

Hero Cards refresh after a long rest, so don't be afraid to use them when they matter.

## The Hero Cards

Hero Cards are special boons available to your character. Each card can be used once before it is spent, and all spent cards return after you complete a long rest.

Whenever a Hero Card is played, everyone who can see the affected roll also sees the card appear on screen, making those dramatic moments feel even more memorable.

<img src="images/played-card.webp" alt="A played card shown large in the middle of the screen, captioned 'Aria plays Relentless'" width="260">

### Playing a card from your character sheet

Open your character sheet and click Hero Cards.

A window appears showing every card you currently have available. Simply click a card to play it.

<img src="images/card-chat-record.webp" alt="The chat record of a played card: the Hero Cards feature, with Relentless's art beside it" width="320">

If you play Advantage from your sheet, it grants advantage on your next attack roll, ability check, or saving throw.

> **Tip:** Hold Shift while clicking the Hero Cards feature if you'd rather open D&D 5e's standard usage menu.

### Using a Card on a Roll You've Already Made

Many rolls in chat, including attacks, ability checks, saving throws, damage rolls, and initiative rolls, display a Hero Card button.

<img src="images/roll-card-button.webp" alt="An Athletics check of 9 in chat, with a Hero Card button under it" width="320">

Clicking the button shows the cards that can legally affect that roll. Cards that wouldn't work for the situation won't be shown, making it easy to pick the right option.

<img src="images/card-chooser.webp" alt="The card chooser for a roll, offering Advantage, Lucky and the three Inspiration cards" width="560">

Choose a card and the roll updates directly in chat. The message keeps its place in the log while recalculating the result, including hit or miss against a target and save success or failure where applicable.

A note is added to explain exactly what changed.

<img src="images/card-played-on-roll.webp" alt="The Athletics check, now 16 and a success, with a note: Inspiration: added 1d8 (7): 9 + 7 = 16" width="320">

A few things to keep in mind:

- You can only use Hero Cards on your own rolls.
- Death saving throws can't be modified once rolled.
- If you're using a card on damage, do so before the damage is applied.

### Hero Card Reference

| Card | What it does |
|---|---|
| **Inspiration** (1d6, 1d8 or 1d10) | Add the card's die to the roll. |
| **Lucky** | Reroll the relevant dice and use the new result. |
| **Advantage** | Roll an additional d20 and keep the higher result. |
| **Indomitable** | Reroll a failed saving throw and keep the new result. |
| **Relentless** | Reroll initiative and keep the higher result. |
| **Charger** | You can double your movement this turn. |
| **Reaction Surge** | You can take a second reaction this round. |
| **Extra Strike** | You make an extra strike. |
| **Mind's Eye** | Reveal some of your character's backstory. |
| **Divine Intervention** | Your GM will ask you to name a range of consecutive numbers. See [Divine Intervention](#divine-intervention). |

The best time to use a Hero Card is when the outcome really matters. Whether you're turning failure into success, pushing for a critical moment, or making a last stand, they're meant to help create memorable stories at the table.

### Natural 1s and 20s

Natural 20s and Natural 1s are highlighted in chat so they're easy for everyone to spot.

<img src="images/naturals.webp" alt="Two Athletics checks: a natural 20 with a glowing gold ring, and a natural 1 with a red ring" width="320">

By default:

- A natural 1 is final and can't be rerolled.
- Hero Cards can't normally be used on natural 1s or natural 20s.
- Damage rolls aren't affected by these restrictions.
- On a saving throw against a spell's or feature's damage, a natural 20 takes no damage and a natural 1 takes the
  maximum: every die counts as its highest, and your resistances and immunities don't reduce it.
- On initiative, a natural 20 puts you first in the initiative order and a natural 1 puts you last, whatever your
  total.
- On an ability check, skill check or tool check against a DC, a natural 20 always succeeds and a natural 1 always
  fails, whatever your total.
- On any saving throw against a DC, a natural 20 always succeeds and a natural 1 always fails, whatever your total.
  Death saves keep their own rules.
- In a Roll-Off between two d20 rolls, a natural 20 wins outright and a natural 1 loses, whatever the totals, unless
  you both roll the same natural.

<img src="images/initiative-naturals.webp" alt="The combat tracker: Aria first with a natural 20 in gold, above Borin's higher total, and the Goblin last with a natural 1 in red" width="300">

Your GM can customise these rules, so the exact behaviour at your table may differ.

## Adding another feature's die to a roll

Some features roll a die to change someone else's roll, such as **Bardic Inspiration** or **Cutting Words**. Roll the
die as usual. Then right-click its message in chat and choose **Add to a roll…** or **Subtract from a roll…**.

<img src="images/bonus-menu.webp" alt="The right-click menu on a Bardic Inspiration roll, with Add to a roll and Subtract from a roll at the bottom" width="320">

Pick the roll from the list, newest first.

<img src="images/bonus-chooser.webp" alt="A window titled Add Bardic Inspiration asking which roll to add 1d6 (5) to" width="420">

The die's total is added to that roll, or taken off it. The roll updates its total and, where it can, whether it hits
or saves. If the roll was made for a roll request, the request's card updates too. Both messages get a note, so
everyone can see where the die went.

<img src="images/bonus-applied.webp" alt="Aria's Athletics check, now 16, noting Bardic Inspiration added 1d6 (5); below it Borin's die, noting it was added to Aria's check" width="320">

- A die can only be used once.
- Only the player who rolled the die can spend it, or the GM.
- You can choose any roll you can see. If it isn't yours to change, such as a monster's roll for Cutting Words, the
  GM's Foundry makes the change, so a GM needs to be logged in. If it can't be done, you're told, and the die isn't
  spent.
- Checks, saves, attacks and damage rolls can't be used as the die.

## Fighter's Indomitable

A Fighter with the **Indomitable** feature from D&D 5e's compendiums can use it on a saving throw they failed. A
**Use Indomitable** button appears on the failed save. It's also in the save's right-click menu.

<img src="images/indomitable-button.webp" alt="A failed Constitution save of 6, with a Use Indomitable button" width="320">

Using it spends one use of the feature and rerolls the d20, and the new roll stands. Under the 2024 rules the reroll
also adds your Fighter level; under the 2014 rules it doesn't. The save notes what happened:

<img src="images/indomitable-used.webp" alt="The save is now 17 and a success, with a note: Indomitable: rerolled the d20 (6 → 8) + 9 (Fighter level): 6 → 17" width="320">

- A natural 1 is fixed, so Indomitable isn't offered on one.
- On a save with no DC, it's offered whether or not you failed, and asks you to confirm before spending a use.
- If the reroll can't be saved, the use is given back.
- On a roll request whose result the GM hasn't shown yet, the button appears only once the GM shows it. Offering it
  sooner would tell you that you failed.

This is the class feature. The **Indomitable** Hero Card is separate, and you can use either.

## Answering the GM's roll requests

Sometimes the GM asks the table for rolls. A request card appears in chat, with a **Roll** button beside each of your
characters. Click it to make the roll. dnd5e's usual roll window opens, so advantage and your other options work as
normal.

<img src="images/request-player.webp" alt="A request card for an Athletics check, DC 15: Aria has rolled 17, and Borin has a Roll button" width="320">

Once you've rolled, your result shows on the card. The tankard button beside it plays a Hero Card on that roll.
Click the result itself to see its dice.

Things you may see on a request card:

- **DC ?** The GM is keeping the DC to themselves.
- **No success or failure yet.** The GM sees who passed straight away, and shows the table when they're ready.
- **Done**, in a Skill Challenge. You've finished your rolls, and the GM will show how you did.
- **?** in a Roll-Off against an NPC. The NPC's roll stays secret until the GM shows it.

### Choosing which roll to make

The GM may let you choose between several rolls, such as Athletics or Acrobatics. The card then lists them all, and
clicking **Roll** asks which one you want to make. Each choice can have its own DC, so the easier roll may be the one
with the harder DC. You see each DC unless the GM is keeping it hidden.

<img src="images/choice-dialog.webp" alt="A request for an Athletics Check at DC 15 or Acrobatics Check at DC 10, and the window asking Aria which to make" width="600">

### Divine Intervention

When you play the **Divine Intervention** card from your sheet, your GM is told, and sends the request when
they're ready.

In a Divine Intervention request, clicking **Roll** first asks you to pick a run of numbers from 1 to 100. Hover over a
number to preview the run that starts there, and click to pick it. Then roll the d100: you need to roll one of your
numbers.

<img src="images/divine-picker.webp" alt="A grid of the numbers 1 to 100 with 40 to 55 picked, and the text You need 40–55" width="400">

The **Advantage** card rolls a second d100 and keeps whichever lands in your numbers, and **Lucky** rerolls the d100.

<img src="images/divine-result.webp" alt="The Divine Intervention card: Aria picked 40–55 and rolled 47. The gods answer" width="320">

### Pop-up windows

Your GM may have requests pop up in a window, with a **Roll** button for each of your characters in it. The window
closes once everything in it is rolled, and the chat card works as well. If you join the game within 30 minutes of a
request you still need to roll for, its window opens for you then.

<img src="images/popup-player.webp" alt="A Roll Request window for a Dexterity save, DC 13, with Roll buttons for Aria and Borin" width="380">

### Rolling again

You can't delete a roll you made for a request, so a bad roll can't be thrown away. If the GM lets you roll again,
they remove your roll from the card, and your **Roll** button comes back.

## Credits

Inspired by the RoBear-E campaign. Sogrom's Table Tools is not affiliated with, or endorsed by, its creators.

The card art is made from images licensed from [Adobe Stock](https://stock.adobe.com) and [Pexels](https://www.pexels.com),
which remain the property of their creators. No AI-generated imagery is used. [art-sources.md](art-sources.md)
lists the source of each card. The Cinzel and Spectral fonts are under the SIL Open Font License (see [`assets/fonts`](../assets/fonts)).

## Author

- **Sogrom** ([@IainFielding](https://github.com/IainFielding))

## Licence

MIT. The card art and fonts keep their own terms: see [LICENSE](../LICENSE).
