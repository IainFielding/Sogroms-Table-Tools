# Sogrom's Table Tools: GM Guide

This guide is for the GM. It covers setting Sogrom's Table Tools up, the settings, and asking the table for rolls. What players
see and do, including how the Hero Cards work, is in the [player guide](player.md). Read that first: as GM you
can do everything a player can.

## Contents

- [Setting up](#setting-up)
- [Settings](#settings)
- [Asking for rolls](#asking-for-rolls)
  - [The request window](#the-request-window)
  - [Kinds of request](#kinds-of-request)
  - [Running a request](#running-a-request)
  - [Who can roll, and rolling again](#who-can-roll-and-rolling-again)
  - [Private rolls and what "hidden" means](#private-rolls-and-what-hidden-means)
  - [Pop-ups](#pop-ups)
  - [Death saves](#death-saves)
- [Cards and dice at the table](#cards-and-dice-at-the-table)
- [Other modules](#other-modules)
- [Macros](#macros)

## Setting up

1. **Install.** In Foundry's setup screen, go to **Add-on Modules → Install Module**. Search for "Sogrom's Table Tools" or paste
   the manifest URL:
   `https://github.com/IainFielding/Sogroms-Table-Tools/releases/latest/download/module.json`
2. **Enable** Sogrom's Table Tools in your world's **Manage Modules**. It needs Foundry VTT v14 and D&D 5e 6.x (tested on 6.0.6).
3. **Give out the cards.** Drag the **Hero Cards** feature from the **Items (Sogrom's Table Tools)** compendium onto each
   character who should have them. Each card is an activity on that feature with one use, recovered on a long rest.
   To give a card back early, reset its uses on the character sheet.

The first time the module runs in a world, you're whispered a welcome card: where things are, what's new, and a
button for each group of settings. Drag its **Hero Cards** link onto a character to give them the cards, and click its
tankard to open the request window. After an update that adds features, you get a short note of what's new instead.
A patch release says nothing. Turn the cards off with **Welcome and What's New Cards**, under
[Gameplay Enhancements](#gameplay-enhancements).

<img src="images/gm-welcome.webp" alt="The welcome card: where to find things, with a Hero Cards link and a tankard button, what's new in 1.1.0, and buttons for Hero Cards, Dice Rolling, Roll Requests and Gameplay Enhancements" width="300">

The compendiums sit in a **Sogrom's Table Tools** folder in the Compendium sidebar. Players can view them.

| Compendium | What's in it |
|---|---|
| **Journal (Sogrom's Table Tools)** | **Artwork**: the art of every card, and the campaign art. **Spell Lists**: a class spell list for each spellcasting class, registered with D&D 5e. |
| **Items (Sogrom's Table Tools)** | The **Hero Cards** feature, the **Belts of Phoenix Dexterity**, and **Corn Liquor**. |
| **Spells (Sogrom's Table Tools)** | **Theodore's Morning Coffee**. |

## Settings

In **Game Settings → Configure Settings → Sogrom's Table Tools**, the settings are grouped behind four buttons:
**Hero Cards**, **Dice Rolling**, **Roll Requests** and **Gameplay Enhancements**. Each opens a window with that group's settings. Only a GM
can open them, and each setting applies to the whole world.

<img src="images/gm-settings.webp" alt="The Sogrom's Table Tools tab of Foundry's settings, with the Hero Cards, Dice Rolling, Roll Requests and Gameplay Enhancements buttons" width="640">

### Hero Cards

<img src="images/gm-settings-hero-cards.webp" alt="The Hero Card Settings window, with its two settings" width="420">

| Setting | Default | What it does |
|---|---|---|
| **Natural 1s and 20s Lock Hero Cards** | On | No card can be played on a roll whose d20 shows a natural 1 or 20. Turn it off to allow Advantage and Inspiration on them. Either way, Lucky can't be played on a natural 20, and nothing rerolls a natural 1. |
| **Show Played Cards on Screen** | On | A played card's art appears in the middle of the screen for everyone who can see the roll. Chat keeps a record either way. |

### Dice Rolling

<img src="images/gm-settings-dice-rolling.webp" alt="The Dice Rolling Settings window" width="420">

| Setting | Default | What it does |
|---|---|---|
| **Ring Natural 1s and 20s** | On | A roll whose d20 shows a natural 20 is ringed in gold in chat, and a natural 1 in red: checks, saving throws and attacks, a save summarised inside the card of the spell that called for it, and a result on a request card. Turn it off for plain totals. |
| **Natural 1s and 20s on Checks** | On | A natural 20 on an ability check, skill check or tool check made against a DC always succeeds, and a natural 1 always fails, whatever the total. It counts on request cards, where a plain d20 is judged the same way: in a Standard Roll, a Skill Challenge, and for each roll a Team Challenge judges against its DC. It also counts on any check D&D 5e rolls against a DC, such as one asked for from a journal. Turn it off to judge every check by its total alone. |
| **Natural 1s and 20s on All Saves** | On | A natural 20 on a saving throw made against a DC always succeeds, and a natural 1 always fails, whatever the total: saves against spells and features, concentration saves, and saves on request cards. D&D 5e then treats the save that way throughout: a natural 20 under the DC is shown as saved and starts at the damage its spell or feature deals on a save, usually half, and a natural 1 over it can break concentration or be turned by a Legendary Resistance. With **Natural 1s and 20s on Saves against Damage** on as well, the natural 20 takes no damage and the natural 1 the maximum. Death saves keep D&D 5e's own rules. Turn it off to judge every save by its total alone. |
| **Natural 1s and 20s on Saves against Damage** | On | When a spell or feature calls for a save and deals damage, a natural 20 on the save takes no damage, and a natural 1 takes the damage's maximum, every die at its highest (36 from 6d6), ignoring resistances and immunities. Each starts that way in the damage's **Apply** tray, where you can still change it. Turn it off for D&D 5e's own rules. |
| **Natural 1s and 20s in a Roll-Off** | On | In a [Roll-Off](#roll-off) between two d20 rolls, a natural 20 wins outright, against any total but another natural 20, and a natural 1 loses to anything but another natural 1. Two natural 20s, or two natural 1s, are decided by their totals. Turn it off for the higher total to win every time. |
| **Natural 1s and 20s on Initiative** | On | A creature whose initiative roll shows a natural 20 goes first in the initiative order, above any higher total, and one whose roll shows a natural 1 goes last, below any lower total. Each keeps the initiative it rolled, shown in gold or red in the combat tracker, and several natural 20s, or several natural 1s, are ordered among themselves by it. A Hero Card or a bonus that changes the roll's d20 moves the creature to match, and an initiative you type in has no natural. Turn it off to order everyone by their totals alone. |
| **Heavy Weapon Disadvantage** | On | An attack with a Heavy weapon starts at disadvantage when its wielder can't handle it, by the rules set in D&D 5e's **Rules Version**. Under the 2024 rules, that's a melee weapon wielded with a Strength score under 13, or a ranged weapon with a Dexterity score under 13. Under the 2014 rules, it's any Heavy weapon wielded by a Small or Tiny creature. It counts for characters and NPCs alike. It's added to the attack as one more source of disadvantage, alongside those from the character's effects, and D&D 5e resolves them together: advantage from an effect cancels it out, an effect that says the attack can't have disadvantage stops it, and one that forces a mode wins. When that leaves the attack at disadvantage, the roll dialog opens with **Disadvantage** chosen, and the player can still change it there. While Midi-QOL is active, it's left to Midi-QOL, which applies the same rule and lets effects excuse a creature from it. Turn it off to leave Heavy as a label only, as D&D 5e does. |
| **Loading Weapon Warning** | On | A Loading weapon fires only one piece of ammunition per action, bonus action or reaction. When a creature in the combat attacks a second time with the same Loading weapon in the same turn, whoever rolls is warned, but the attack is still rolled: the module can't tell whether it was made with an action, a bonus action or a reaction. Out of combat, nothing is checked. A creature with a feat named Crossbow Expert (identifier `crossbow-expert`) ignores Loading on hand, light and heavy crossbows. |
| **Reload Weapon Shots** | On | A Reload weapon's shots are kept as its own **Limited Uses**, so Reload 6 is 6 uses, and each attack roll spends one, as an attack with ammunition spends a piece of it. An attack activity set to spend the weapon's uses already spends one each time it's used, so it's left to do that. When the weapon is empty, the attack isn't rolled. Instead, a dialog offers to reload it, which refills its uses, and the attack can then be rolled again. A Reload weapon with no Limited Uses is offered to be set up after its first attack, starting from the number in its description, such as "Reload 6", when there is one. That attack counts as its first shot. If you cancel, you aren't asked again for that weapon; set its Limited Uses on its sheet instead. Give the uses a recovery there if you'd like them to refill on a rest. |
| **Lance Disadvantage** | On | An attack with the 2014 Lance, marked Special, starts at disadvantage against a target within 5 feet, measured from the nearest spaces the two tokens occupy. It needs one targeted token on the same scene as the attacker's. The 2024 Lance has no such rule, and isn't marked Special. Like Heavy, it's one more source of disadvantage, resolved with the character's own, and the player can still change the roll in its dialog. |
| **Flanking** | Off | The Dungeon Master's Guide's optional flanking rule. A creature and an ally both beside an enemy, on opposite sides or opposite corners of its space, have advantage on melee attacks against it, weapon or spell. As the guide draws it, a line between the centres of the two creatures' spaces must pass through opposite sides or corners of the enemy's space; a creature larger than one space flanks if any of its spaces does. Allies are tokens with the attacker's disposition, friendly or hostile, and an ally that's incapacitated (paralysed, petrified, stunned and unconscious included) or dead doesn't count. It needs one targeted token on the same scene as the attacker's, and a square grid: gridless and hex scenes are left alone. Like the weapon rules, it's one more source of advantage, resolved with the character's own, and the player can still change the roll in its dialog. It's worked out once, as the attack is rolled, so it costs nothing while tokens move. While Midi-QOL's own flanking option is turned on, flanking is left to Midi-QOL. |

The **Firearm** property stays a label only: the 2014 rules' firearm proficiency is given, like any other, on the character. **Special** does nothing except on the 2014 Lance, as its rules are in each weapon's description.

### Roll Requests

<img src="images/gm-settings-roll-requests.webp" alt="The Roll Request Settings window, with its seven settings" width="420">

| Setting | Default | What it does |
|---|---|---|
| **Default DC** | Blank | The DC each roll starts with when you open the request window. Leave it blank for none; you can still set or change the DC for each request, or later from the card. |
| **Show the DC to Players by Default** | Off | Whether **Show DC to Players** starts ticked in the request window. You can still change it for each request. |
| **Default Team Challenge Scoring** | Average of the rolls | How a Team Challenge is scored when you open the request window. You can still change it for each request. See [Team Challenge](#team-challenge). |
| **Attach Rolls to Request Cards** | On | The rolls made for a request show on its card rather than as messages of their own, as D&D 5e does for an item's saves. Click a result to see its dice. |
| **Pop Up Roll Requests for Players** | Off | Opens a window for each player with a character in a request, with a Roll button for each of their characters. |
| **Pop Up Roll Requests for the GM** | Off | Opens a window for you when a request includes NPCs, or any actor no player owns. |
| **Automatic Death Save Requests** | Off | Posts a death save request at the start of a dying character's turn in combat. See [Death saves](#death-saves). |

### Gameplay Enhancements

Optional changes to tokens, actor sheets and spellcasting. Each is off until you turn it on. The window also holds **Welcome and
What's New Cards**, which starts on.

<img src="images/gm-settings-world-scripts.webp" alt="The Gameplay Enhancements window, with its seven settings: the six enhancements unticked, and Welcome and What's New Cards ticked" width="420">

| Setting | Default | What it does |
|---|---|---|
| **Bloodied Token Tint** | Off | When D&D 5e marks a creature Bloodied, its token is tinted red and its token ring's background turns red. A token that's already Bloodied when you turn this on changes the next time it becomes Bloodied. |
| **Fade Unprepared Spells** | Off | On actor sheets, spells of level 1 or higher that could be prepared but aren't are faded. Cantrips, always-prepared spells, and spells from items or at-will and innate sections stay as they are. |
| **Chat Button Labels** | Off | On compact chat cards, each icon button shows its name beside its icon, so you don't have to hover over it to see what it does. Switched off while Carolingian UI is enabled, which labels them itself: see [Other modules](#other-modules). |
| **One-Tab Activities** | Off | An activity's **Identity**, **Activation** and **Effect** tabs are laid out side by side in one wide window, without their hints. Handy when you're making a lot of content. |
| **Spell Component Warnings** | Off | Warns whoever casts a spell when it needs a component they can't provide. The spell is still cast. **Verbal:** the caster, character or NPC, has D&D 5e's **Silenced** status, from the token or an effect. **Material:** a character casts a spell whose material components have no cost without a spellcasting focus equipped or a component pouch carried, so needs the materials themselves. A focus is any equipment, weapon or tool marked **Focus**, and counts only while equipped; which kind of focus suits the character's class isn't checked. A component pouch counts while it's carried, equipped or not. Spells with costly materials, spells cast through an item such as a staff, innate and at-will spells, and NPCs aren't checked for materials. **Somatic** components aren't checked, as D&D 5e doesn't track what a creature holds in its hands. |
| **Item Rarity Colours** | Off | Tints each item row on actor sheets by its rarity: green for uncommon, blue for rare, purple for very rare, orange for legendary and gold for artifact. |
| **Welcome and What's New Cards** | On | Whispers the GMs a welcome card the first time the module runs in a world, and a short note of what's new after an update that adds features. See [Setting up](#setting-up). |

<table><tr>
<td><img src="images/world-scripts-rarity.webp" alt="Aria's inventory with Item Rarity Colours on: a cream Potion of Healing, a green Cloak of Elvenkind, a blue Flame Tongue, a purple Staff of Power, an orange Holy Avenger and a gold Orb of Dragonkind" width="400"></td>
<td><img src="images/world-scripts-fade.webp" alt="Aria's spells with Fade Unprepared Spells on: Sleep and Misty Step are faded, Magic Missile, Shield and Hold Person are not" width="400"></td>
</tr></table>

<img src="images/world-scripts-chat-labels.webp" alt="A Dagger card in chat with Chat Button Labels on: its buttons read Attack and Damage" width="300">

<img src="images/world-scripts-one-tab.webp" alt="A Dagger's Attack activity with One-Tab Activities on: its Identity, Activation and Effect tabs side by side" width="640">

## Asking for rolls

Open the request window from the **tankard** button in the chat controls, under the chat log:

<img src="images/gm-chat-control.webp" alt="The chat controls, with the tankard button for roll requests among the buttons on the right" width="300">

When the chat sidebar is closed, use **Request Rolls** in the token controls instead. Only a GM sees these
buttons.

### The request window

<img src="images/gm-request-window.webp" alt="The Request Rolls window: six kinds of roll, the roll and DC, who rolls, and options" width="520">

1. **Kind of roll.** Pick one of the six kinds described below. The fields below change to suit it, and anything
   you've filled in carries over when you switch.
2. **Rolls.** Choose the roll: a plain die (a d20 by default, or a d6, d8, d10, d12 or d100), any skill or tool check,
   ability check, or saving throw. The DC starts blank each time you open the window, or as the **Default DC**
   setting if you've set one: set one, or leave it blank for none and set it later from the card. A Skill Challenge, and a Team Challenge not scored by its average, need
   one before you can send them.
3. **Who rolls.** The actors of any tokens you have selected are ticked for you; otherwise the player characters
   are. The list offers the selected tokens, the player characters, the members of your groups, the combatants, and
   the tokens on the current scene. The tick button beside the heading selects them all.

   Above the list, **quick picks** tick a whole group in one click, and untick it if it's all ticked already:

   | Quick pick | Who it ticks |
   |---|---|
   | Your party's name | The members of D&D 5e's primary party. Each of your other group actors gets a pick of its own, by its name. |
   | **Combat: everyone** | Everyone in the current combat. Each unlinked token rolls for itself. |
   | **Combat: hostile** | The combatants whose tokens are hostile, for when only the monsters need to roll. |
   | **Selected tokens** | The tokens you have selected now, even ones selected after you opened the window. |
   | **Everyone on scene** | Every token on the scene you're viewing. |

   A pick only shows when there's someone in it, and it's highlighted while all of its members are ticked. In Team vs
   Team, each side has its own picks, and ticking a group for one side takes its members off the other. When a combat
   is running and no NPCs are selected, the NPCs' side starts with the hostile combatants.
4. **Options.**
   - **Show DC to Players.** Unticked, players see "DC ?" on the card, and the DC is kept off their rolls so D&D 5e
     doesn't show them success or failure. Ticked, a public Standard Roll shows players who passed straight away.
   - **Roll Visibility.** **Public**; **Private GM Roll**, where each player sees only their own results; or **Blind
     GM Roll**, where only you see any of them, for a roll such as Perception, Insight or Stealth whose result the
     player shouldn't know.
5. **Send Request** posts the request to chat.

**Offering a choice of rolls.** In a Standard Roll, Team Challenge or Skill Challenge, click **+** beside a roll to
let each actor make a different roll instead, such as Athletics or Acrobatics, or Persuasion or Deception. You can
offer up to four rolls. When a player clicks **Roll**, they're asked which one to make. Hover over a result on the card
to see which they chose.

In a Standard Roll or Skill Challenge, each choice has a DC of its own, so an easier roll can have a harder DC: for
example, Athletics at DC 15 or Acrobatics at DC 10. A new choice starts with the roll's DC. In a Team Challenge,
the choices share one DC, because the rolls are averaged against it.

<img src="images/gm-request-choices.webp" alt="The Rolls section with Athletics at DC 15, or Acrobatics at DC 10" width="520">

The card lists each choice with its DC, and you can click any of them to change it. Players see each DC on the card
and on the buttons they choose from, or "DC ?" if you're keeping the DC hidden.

### Kinds of request

#### Standard Roll

Each actor rolls once, against a DC if you set one. A check's or a save's natural 20 passes and its natural 1 fails,
whatever the total, unless you turn those rules off under [Dice Rolling](#dice-rolling). You see straight away who
passed and how many succeeded. Players don't, until you click **Show to players**, and you can hide it again.

A public roll with **Show DC to Players** ticked starts already shown, since players can see the DC and the totals
for themselves. Click **Shown** to hide it.

<table>
<tr><th>What you see</th><th>What players see</th></tr>
<tr>
<td><img src="images/gm-request-hidden.webp" alt="The GM's card: DC 15, Aria 17 in green, Borin 8 and Goblin 12 in red, 1 of 3 succeeded, and a Show to Players button" width="300"></td>
<td><img src="images/player-request-hidden.webp" alt="The player's card: DC ?, the same totals with no success or failure shown" width="300"></td>
</tr>
</table>

Once you show it:

<img src="images/player-request-shown.webp" alt="The player's card after the GM shows it: Aria in green, Borin and Goblin in red, 1 of 3 succeeded" width="300">

#### Skill Challenge

Three rolls in turn, each with its own roll and DC. Choose how many successes are needed (2 of 3 by default). An
actor stops rolling as soon as they have passed or failed. Only you see who passed until you click **Show to
players**; players see "Done" once they have finished.

<img src="images/gm-request-window-challenge.webp" alt="The request window set to Skill Challenge, with three rolls, each with a DC, and Successes Needed: 2 of 3" width="520">

<img src="images/gm-skill-challenge.webp" alt="A Skill Challenge card: Athletics DC 12, Stealth DC 14, Constitution Save DC 13. Aria passed with 15 and 16; Borin failed his first roll and has a Roll button for the second" width="300">

#### Team Challenge

Everyone rolls, and the team gets one result. Choose how it's worked out under **Scoring**:

| Scoring | How the team's result is worked out |
|---|---|
| **Average of the rolls** | The average, rounded down, is compared to the DC. Each natural 1 removes the highest roll from the pool, and each natural 20 removes the lowest. If that would leave no rolls, 1s and 20s cancel out in pairs, and at least one roll always stays. Hover over a removed roll to see why it was removed. |
| **Half must succeed** | The group check from the Player's Handbook: if at least half the team meets the DC, the whole team succeeds. |
| **Leader, helped by the rest** | The roll with the highest modifier counts, +1 for each other roll that meets the DC and −1 for each that doesn't. |
| **Weakest link** | The roll with the lowest modifier counts, +1 for each other roll that meets the DC. Other failures don't count against it. |

All but the average are judged against the DC, so they need one. A check's or a save's natural 20 meets the DC and its
natural 1 doesn't, whatever the total, when a roll is counted as a success or as a +1 or −1. A roll's modifier is its total less the d20 it kept,
so where you offer a choice of rolls, such as Athletics or Acrobatics, each actor is judged by the roll they chose. On
a tie, the higher total counts. The card marks each roll with what it did for the team (**Leader**, **+1**, **−1**),
and its summary shows the working, such as "Aria leads: 21, +1 helped, −2 hindered = 20".

Only you see the result until you click **Show to players**. A Hero Card played on a roll, or a changed DC, scores the
team again, so playing Inspiration on a helper can make them the leader.

<img src="images/gm-request-window-team.webp" alt="The request window set to Team Challenge, with an Athletics roll at DC 13 and its Scoring set to Average of the rolls" width="520">

<img src="images/gm-team-challenge.webp" alt="A Team Challenge card: Aria's natural 20 ringed in gold, Borin's 4 greyed out as removed, Goblin 11. Team average 15, 1 removed, Success" width="300">

#### Roll-Off

One actor against another, player characters or NPCs. Pick a **Challenger** and an **Opponent**, and a roll for each:
a d20 (the default), a d6, d8, d10, d12 or d100, or any check, save or tool. The higher total wins; an equal total is a
tie.

When both rolls are d20 rolls, a natural 20 wins outright, even against a higher total, and a natural 1 loses, even to
a lower one. Two natural 20s, or two natural 1s, are decided by their totals. The card says when a natural decided it,
such as "Aria wins on a natural 20". Turn this off with [Natural 1s and 20s in a Roll-Off](#dice-rolling).

<img src="images/gm-request-window-rolloff.webp" alt="The request window set to Roll-Off, with Aria as Challenger and the Goblin as Opponent" width="520">

An NPC's roll is a private GM roll: players see "?" until you click **Show NPC roll** on the card, and you can hide it
again.

<table>
<tr><th>What you see</th><th>What players see</th></tr>
<tr>
<td><img src="images/gm-rolloff.webp" alt="The GM's Roll-Off card: Aria 14 against Goblin 9, Aria wins, and a Show NPC Roll button" width="300"></td>
<td><img src="images/player-rolloff.webp" alt="The player's Roll-Off card: Aria 14 against Goblin ?, The result is hidden" width="300"></td>
</tr>
</table>

#### Team vs Team

Pick a **Players** team and an **NPCs** team, and a roll for each (a d20 by default, or any check, save or tool). Each
team's rolls are pooled like a Team Challenge, natural 1s and 20s included, and the higher average wins. The averages
are rounded down to one decimal place, so 12.6 beats 12.3; only averages equal to that place tie.

As in a Roll-Off, each NPC's roll is a private GM roll: players see "?" for the NPCs, and no winner, until you click
**Show NPC rolls** on the card, and you can hide them again.

<img src="images/gm-request-window-versus.webp" alt="The request window set to Team vs Team, with Aria and Borin on the Players team and the Goblin on the NPCs team, each team rolling a d20" width="520">

<img src="images/gm-versus.webp" alt="A Team vs Team card: Players (Aria 13, Borin 16) average 14, NPCs (Goblin 10) average 10. Players win, and a Show NPC Rolls button" width="300">

#### Divine Intervention

Choose the one character who prays, and set how many numbers they pick, from 1 to 50 (16 by default). When the
player clicks **Roll**, they pick that many numbers in a row from 1 to 100, then roll a d100, and must roll one of
their numbers. The **Advantage** card rolls a second d100 and keeps whichever lands in their numbers, and **Lucky**
rerolls the d100.

When a player plays the **Divine Intervention** card from their sheet, you're whispered a note with a **Set Up Divine
Intervention** button. It opens this window set to Divine Intervention, with that player's character the one to
roll. Set the numbers to pick, and send it when you're ready.

<img src="images/gm-request-window-divine.webp" alt="The request window set to Divine Intervention, with Numbers to Pick set to 16" width="520">

### Running a request

**Rolling for NPCs.** Every row has a **Roll** button for you, so you can roll for anyone, including NPCs.

**Changing the DC.** On a Standard Roll, Team Challenge or Skill Challenge card, click the DC to change it, or clear
it for no DC (each Skill Challenge roll must keep one, as must a Team Challenge not scored by its average). Where each choice has its own DC, click the one to change.
Rolls already made are scored again against the new DC.

<img src="images/gm-change-dc.webp" alt="The Change DC window, with the DC set to 12" width="340">

<img src="images/gm-request-dc-changed.webp" alt="The card after changing the DC to 12: the Goblin's 12 now succeeds, 2 of 3 succeeded" width="300">

**Cards on requested rolls.** Requested rolls are ordinary D&D 5e rolls, so players can play Hero Cards on them,
from the tankard button beside their result. The card updates as soon as a card changes a roll.

**Attached rolls.** With **Attach Rolls to Request Cards** on (the default), the rolls don't get chat messages of
their own. Click a result to see its dice. Notes on any cards played show under the row.

### Who can roll, and rolling again

- A roll only counts if it was made by you or by one of the actor's owners.
- If the same roll is made twice, such as by you and a player clicking **Roll** at the same moment, the first one
  counts.
- **To let someone roll again,** click their result on the card to open its dice, then click **Roll again** and
  confirm. Their roll is deleted and their **Roll** button comes back. A card played on that roll stays spent. With
  **Attach Rolls to Request Cards** off, you can also delete the roll's own chat message. Players can't delete a
  roll made for a request, so they can't throw away a bad roll.

<img src="images/gm-roll-again.webp" alt="Aria's failed roll of 4 opened on the request card, showing its dice and a Roll Again button" width="300">

### Private rolls and what "hidden" means

- With **Private GM Roll**, each player sees only their own results. In a private Roll-Off or Team vs Team, **Show NPC roll**
  (or **Show NPC rolls**) shows the NPCs' rolls only to the players in the request, not to everyone.
- With **Blind GM Roll**, players see "?" for every result, their own included, so they can't play a Hero Card on a
  roll they made blind. In a blind Roll-Off or Team vs Team there's no button to show the NPCs' rolls.
- **Hidden isn't secret.** The DC, and results you haven't shown yet, are hidden on the chat card, but they still
  reach every player's Foundry as part of the request. A player who opens the browser console can read them. That's
  how Foundry shares chat messages, so the hiding keeps the table honest rather than keeping a secret.

### Pop-ups

Two settings, both off by default, open a window when a request is posted:

- **Pop Up Roll Requests for Players** gives each player a window with a **Roll** button for each of their
  characters in the request. A player who joins within 30 minutes of a request they still need to roll for gets its
  window then.
- **Pop Up Roll Requests for the GM** does the same for you, for NPCs and any other actor no player owns.

<img src="images/popup-gm.webp" alt="The GM's Roll Request window for a Wisdom check, DC 12, with a Roll button for the Goblin" width="380">

Each window closes once everything in it is rolled. The chat card works either way.

### Death saves

With **Automatic Death Save Requests** on, a **Death Save** request is posted at the start of a creature's turn in combat if it's
at 0 hit points and dying. It's an ordinary request, for that one creature, so it opens a pop-up under the two settings
above: the player's window for their character, and yours only for a creature no player owns. You can always roll it
from the chat card.

<img src="images/death-save-request.webp" alt="A Death Save request card, Standard Roll at DC 10, with a Roll button for Aria" width="300">

- **Who is asked.** Characters, and NPCs marked **Important** on their sheet, as D&D 5e shows death saves for. A
  creature that is defeated in the combat tracker, dead, or stable isn't asked.
- **The result shows at once.** A death save's result goes onto the sheet as soon as it's rolled, so the card shows
  pass or fail, against DC 10, without waiting for **Show to players**.
- **Stable.** After a third success D&D 5e clears the creature's successes but leaves it at 0 hit points, so Sogrom's
  Table Tools notes that it's stable and stops asking. It's asked again once it takes a failure (mark one on its
  sheet when it's hurt at 0 hit points: D&D 5e doesn't) or after it's been healed and drops again. The **Stable**
  condition stops the requests too.
- **Healed before rolling.** If the creature is healed before its death save is rolled, the request is removed and its
  pop-ups close.
- **Once a round.** Going back a turn and forward again doesn't post a second request for the same round.

## Cards and dice at the table

- **You can play cards for players.** As GM you can open the card chooser on any roll by a character who holds
  Hero Cards, and play one for them.
- **Bonus dice need a GM online.** When a player adds a die such as Bardic Inspiration to a roll that isn't theirs,
  such as a monster's roll for Cutting Words, your Foundry makes the change. If no GM is logged in, or your Foundry
  can't make it, the player is told and the die isn't spent.
- **Indomitable waits for you.** On a request whose result you haven't shown, Indomitable (the card or the Fighter
  feature) is only offered once you click **Show to players**, so it doesn't give away who failed.
- **Natural 1s and 20s.** The lock is a world setting: see [Settings](#settings).

## Other modules

Sogrom's Table Tools works alongside modules that change how D&D 5e rolls and shows its chat cards:

- **RSReforged.** Its quick rolls draw an activity's attack, damage and formula rolls inside the activity's card. The
  Hero Card button, notes on cards played, and natural 1 and 20 rings appear there, and a feature's die shown there,
  such as Bardic Inspiration, can be added to a roll from the card's right-click menu. Damage applied with
  RSReforged's own Apply buttons follows **Natural 1s and 20s on Saves against Damage**. RSReforged swaps Shift on a
  Roll button: a plain click rolls straight away, and Shift-click opens the roll window.
- **Midi-QOL: partly supported.** Using the Hero Cards feature from the sheet opens the card chooser, as it does
  without Midi. When Midi rolls the saves and applies a spell's damage itself, a natural 20 on the save takes no damage
  and a natural 1 takes the damage's maximum past resistances and immunities, following **Natural 1s and 20s on saves
  against damage**. A feature's die that Midi shows on the feature's card, such as Bardic Inspiration, can be added to
  a roll from the card's right-click menu. Natural 1s and 20s on the saves Midi lists on its card are ringed. Midi judges
  the saves it rolls itself by their totals, so **Natural 1s and 20s on All Saves** doesn't change who it counts as
  saved. For the same rule there, turn on Midi's own **Critical/Fumble always succeed/fail for saving throws**.

  What isn't supported: a card played after Midi has resolved a roll changes the roll in chat, but not the hits,
  saves or damage Midi has already worked out and applied. If you want cards to decide outcomes, set Midi's hit
  checking and damage application to manual, so the card can be played before the result is applied.
- **Carolingian UI.** The request card, its pop-up, the card chooser and the request window keep their own look under
  Carolingian UI's chat styles, fonts and colour themes, in its dark and light themes alike. Carolingian UI's hint
  tooltips work in the request window: each hint is behind the **?** beside its setting. On its compact chat cards,
  where an attack and its damage are rows inside the weapon's card, the Hero Card button is beside each row's title,
  notes on cards played are under the row, and natural 1s and 20s are ringed. Natural 1s and 20s on initiative are
  coloured in its combat tracker too.

  Carolingian UI writes the labels on a chat card's buttons itself, so **Chat Button Labels** is switched off while it
  is enabled, and greyed out in **Gameplay Enhancements**. Use **Labeled card buttons** in Carolingian UI's chat
  message settings instead.

  Its **Retroactive advantage buttons**, the arrows either side of a roll's total, change a roll after it was made,
  as a Hero Card does. They work alongside the cards: a request card counts the changed roll, and a card played
  afterwards works on the dice the arrows kept. They aren't Hero Cards, though. They cost nothing, they aren't held
  back by **Lock natural 1s and 20s**, and the roll's own player can click them. If you want Hero Cards to be the only
  way to change a roll, turn them off in Carolingian UI's chat message settings.

  **Custom CSS.** Keeping that look means that, while Carolingian UI is enabled, an ordinary rule in its **Custom CSS**
  field, or in any other custom CSS module, has no effect on the request card, the card windows or the played card
  shown on screen. Without Carolingian UI, custom CSS reaches them as it always has. There are two ways to restyle
  them with it enabled:

  - **Change the theme's colours and fonts.** They are CSS variables, which still take a plain rule. This turns the
    teal accents purple and the headings into Georgia:

    ```css
    .chat-message .stt-request,
    .stt-card-dialog,
    .stt-played-card {
      --cc-open: #a070e0;
      --cc-font-heading: Georgia, serif;
    }
    ```

    The variables are `--cc-open` (teal accents), `--cc-settled` and `--cc-settled-bright` (brass), `--cc-bg`,
    `--cc-panel-2`, `--cc-line`, `--cc-line-2`, `--cc-text`, `--cc-muted`, `--cc-bright`, `--cc-fail`,
    `--cc-font-heading` and `--cc-font-body`. The full list is at the top of the card windows' styles, in
    `styles/hero-cards.css`.
  - **Change anything else.** Mark the declaration `!important`, and start the selector as below, with `:not(#\#)`
    four times, so it outranks the rule that protects the theme:

    ```css
    body.crlngn-ui:not(#\#):not(#\#):not(#\#):not(#\#) .stt-request h3 {
      font-size: 18px !important;
    }
    ```

## Macros

A macro can open the request window, or post a request without it:

```js
const tools = game.modules.get("sogrom-table-tools").api;

// Open the request window, as the tankard button does.
tools.requestRolls();

// Open it on a Team Challenge, with the combat's hostile combatants ticked.
tools.requestRolls({ mode: "team", group: "hostile" });

// Ask the party's player characters for a DC 15 Athletics check.
const party = game.actors.filter(a => a.hasPlayerOwner && (a.type === "character"));
await tools.createRequest({
  mode: "standard",
  parts: [{ type: "skill", key: "ath", dc: 15 }],
  actors: party.map(a => a.uuid)
});
```

Anything the macro leaves out is filled in as the window would fill it. A request that can't be rolled, such as one
naming a skill D&D 5e doesn't know, is refused with a message saying why. The
[Developer Guide](developer.md#the-api) describes every option, with an example for each kind of request.
