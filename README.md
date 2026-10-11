# Sogrom's Table Tools

![Foundry VTT v14](https://img.shields.io/badge/Foundry_VTT-v14-red)
![D&D 5e 6.x](https://img.shields.io/badge/D%26D_5e-6.x-red)
[![Latest release](https://img.shields.io/github/v/release/IainFielding/Sogroms-Table-Tools)](https://github.com/IainFielding/Sogroms-Table-Tools/releases/latest)

**Hero Cards, cinematic rolls, and less work behind the screen for D&D 5e on Foundry VTT.**

Give your players more chances to be heroes without adding more for the GM to manage. This module enhances D&D 5e with Hero Cards, streamlined roll requests, and a host of gameplay improvements that keep the action flowing.

<img src="docs/images/card-window.webp" alt="The Hero Cards window, showing the art of every card a character still has" width="640">


## Features

### Hero Cards

Hero Cards are twelve illustrated, once per longrest boons that let players turn defeat into victory, survive impossible odds, and pull off memorable last-minute saves. When a card can help, it's offered automatically, played directly from chat, and shown to the whole table.

- Play cards on existing rolls straight from chat.
- See only the cards that can affect the current roll.
- Celebrate every play with animated table-wide card reveals.

<table><tr>
<td><img src="docs/images/card-chooser.webp" alt="The card chooser for a roll, offering Advantage, Lucky and the three Inspiration cards" width="420"></td>
<td><img src="docs/images/played-card.webp" alt="A played card shown large in the middle of the screen, captioned 'Aria plays Relentless'" width="200"></td>
</tr></table>

### Roll requests

Ask the whole table for rolls in seconds.

Whether you're running a skill challenge, resolving a chase, or calling for a dramatic group save, Roll Requests collect everyone's results in one place and keep the game moving.

- Six request types, from simple checks to team competitions and divine intervention.
- Offer multiple roll choices, each with its own DC.
- Hide DCs and results until the perfect moment for a reveal.
- Automatic death save requests when a dying character's turn begins.
- Macro-friendly API for custom encounters and automation.

<table><tr>
<td><img src="docs/images/gm-request-window.webp" alt="The Request Rolls window: six kinds of roll, the roll and DC, who rolls, and options" width="420"></td>
<td><img src="docs/images/gm-skill-challenge.webp" alt="A Skill Challenge card with three rolls, each with a DC, and the party's results" width="260"></td>
</tr></table>

### Enhanced Rolls

Give important rolls the spotlight they deserve. Critical successes and failures stand out instantly, feature dice can be applied directly from chat, and optional rules make natural 1s and 20s feel truly memorable.

- Natural 1s and 20s stand out with distinctive red and gold highlights.
- Critical save outcomes can deal maximum damage or avoid damage entirely.
- A natural 20 on a check or a saving throw always succeeds, and a natural 1 always fails.
- Add Bardic Inspiration, Cutting Words, and other feature dice directly from chat.


<table><tr>
<td><img src="docs/images/naturals.webp" alt="Two Athletics checks: a natural 20 with a glowing gold ring, and a natural 1 with a red ring" width="300"></td>
<td><img src="docs/images/indomitable-used.webp" alt="A save rerolled with Indomitable, now 17 and a success, with a note of what changed" width="300"></td>
</tr></table>

### Gameplay Enhancements

A collection of optional enhancements that that improve readability, reduce friction, and make everyday play smoother for both players and GMs. Enable only the features you want and tailor the experience to your table.

- Bloodied creatures are easier to spot at a glance.
- Unprepared spells are visually distinguished in spell lists.
- Item rarities are colour-coded throughout the sheet.

<img src="docs/images/world-scripts-rarity.webp" alt="An inventory with Item Rarity Colours on, each item tinted by its rarity" width="420">

## Documentation

| Guide | For |
|---|---|
| **[Player Guide](docs/player.md)** | Playing Hero Cards, adding feature dice, Indomitable, and answering roll requests. |
| **[GM Guide](docs/gm.md)** | Setting up, every setting, running roll requests, and macros. |
| **[Developer Guide](docs/developer.md)** | The API, stored data, socket messages, code layout and tests. |
| **[Changelog](CHANGELOG.md)** | What's changed in each release. |

Found a bug or have an idea? [Open an issue](https://github.com/IainFielding/Sogroms-Table-Tools/issues/new/choose).
Want to help? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Installation

In Foundry's setup screen, go to **Add-on Modules → Install Module**, and search for **Sogrom's Table Tools**, or paste
this manifest URL:

```
https://github.com/IainFielding/Sogroms-Table-Tools/releases/latest/download/module.json
```

Then enable it in your world's **Manage Modules**, and drag the **Hero Cards** feature from the
**Items (Sogrom's Table Tools)** compendium onto each character who should have them.

**Requires** Foundry VTT v14 and the D&D 5e system 6.x (tested on 6.0.6).

## Support

Sogrom's Table Tools is completely free. If it's added a little extra heroism to your table, consider 
[buying me a coffee on Ko-fi](https://ko-fi.com/sogrom).

## Credits

Inspired by D&D campaigns DM'd by [Captain RoBear](https://www.youtube.com/channel/UCktEYryPmattKzrpo0_kGzA). Sogrom's Table Tools is not affiliated with, or endorsed by Captain RoBear in any capacty.

The card art is made from images licensed from [Adobe Stock](https://stock.adobe.com) and [Pexels](https://www.pexels.com),
which remain the property of their creators. No AI-generated imagery is used. [docs/art-sources.md](docs/art-sources.md)
lists the source of each card. The Cinzel and Spectral fonts are under the SIL Open Font License (see `assets/fonts`).

Made by **Sogrom** ([@IainFielding](https://github.com/IainFielding)).

## Licence

MIT. The card art and fonts keep their own terms: see [LICENSE](LICENSE).
