/**
 * The GM's welcome card, and a "what's new" card after an update that adds features.
 *
 * Whispered to every GM, once per world: the first time the module runs it says where things are and which settings
 * are worth a look; after a release that adds features it lists them; a patch release says nothing. A world setting
 * turns both off.
 *
 * Which release last added features is WHATS_NEW's last entry, not the module's own version: a patch must stay
 * silent, and a development build's manifest holds a placeholder rather than a version. The world remembers the last
 * entry it announced.
 */

import { CARDS_ITEM_ID, MODULE_ID, localize } from "./hero-cards.mjs";
import { openRollRequest } from "./roll-requests.mjs";

/**
 * Where the GM guide lives, linked from the card.
 */
const GUIDE_URL = "https://github.com/IainFielding/Sogroms-Table-Tools/blob/main/docs/gm.md";

/**
 * The releases that added something a GM should hear about, oldest first. Add an entry when a feature release ships;
 * a patch release adds nothing. Each line is a key in the language file.
 * @type {{ version: string, lines: string[] }[]}
 */
export const WHATS_NEW = [
  {
    version: "0.1.1",
    lines: [
      "STT.Welcome.New.DiceSoNice",
      "STT.Welcome.New.Versus",
      "STT.Welcome.New.DefaultDC",
      "STT.Welcome.New.Cards"
    ]
  },
  {
    version: "1.0.0",
    lines: [
      "STT.Welcome.New.BlindRoll",
      "STT.Welcome.New.ShownDC"
    ]
  },
  {
    version: "1.0.1",
    lines: [
      "STT.Welcome.New.NaturalInitiative",
      "STT.Welcome.New.NaturalChecks",
      "STT.Welcome.New.NaturalRollOff"
    ]
  }
];

/**
 * Where to find things, for the welcome card. Each is a key in the language file. A {cards} in one is a link to the
 * Hero Cards feature in the module's compendium, which the GM can drag from the card onto a character, and a
 * {tankard} is the request button, which opens the request window from the card too.
 */
const PLACES = ["STT.Welcome.Place.Cards", "STT.Welcome.Place.Play", "STT.Welcome.Place.Requests"];

/**
 * The settings menus the card opens, as registered in settings-menus.mjs, with their language keys and icons.
 */
const MENUS = [
  { menu: "heroCards", lang: "HeroCards", icon: "fa-solid fa-cards-blank" },
  { menu: "diceRolling", lang: "DiceRolling", icon: "fa-solid fa-dice-d20" },
  { menu: "rollRequests", lang: "RollRequests", icon: "fa-solid fa-beer-mug-empty" },
  { menu: "worldScripts", lang: "WorldScripts", icon: "fa-solid fa-earth-europe" }
];

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", registerSettings);
// On init rather than on ready: the chat log draws the messages already in it before ready, so a card from an earlier
// session must be covered too.
Hooks.once("init", registerWelcomeButtons);
Hooks.once("ready", postWelcomeIfDue);

/**
 * The setting that turns the cards off, and the release this world last announced, which is only bookkeeping.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "welcomeCards", {
    name: "STT.Settings.WelcomeCards.Name",
    hint: "STT.Settings.WelcomeCards.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "welcomeVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

/* -------------------------------------------- */
/*  Which Card                                  */
/* -------------------------------------------- */

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}  Whether `a` is a later version than `b`, compared part by part as numbers.
 */
export function newerThan(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for ( let i = 0; i < Math.max(pa.length, pb.length); i++ ) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if ( x !== y ) return x > y;
  }
  return false;
}

/* -------------------------------------------- */

/**
 * @param {string} seen  The last version announced; empty when the world has never had a card.
 * @param {typeof WHATS_NEW} [entries]
 * @returns {{ kind: "welcome", version: string }|{ kind: "whatsNew", version: string, entries: typeof WHATS_NEW }|null}
 *   The card that is due, if any.
 */
export function cardDue(seen, entries=WHATS_NEW) {
  const latest = entries.at(-1)?.version;
  if ( !latest ) return null;
  if ( !seen ) return { kind: "welcome", version: latest };
  const fresh = entries.filter(e => newerThan(e.version, seen));
  return fresh.length ? { kind: "whatsNew", version: latest, entries: fresh } : null;
}

/* -------------------------------------------- */
/*  Posting                                     */
/* -------------------------------------------- */

/**
 * Post whichever card is due, from the one active GM's client, whispered to every GM. The version announced is saved
 * before the card is posted, so a card that fails is not tried again on every load.
 */
export async function postWelcomeIfDue() {
  try {
    if ( !game.user?.isActiveGM ) return;
    if ( !game.settings.get(MODULE_ID, "welcomeCards") ) return;
    const due = cardDue(game.settings.get(MODULE_ID, "welcomeVersion") ?? "");
    if ( !due ) return;
    await game.settings.set(MODULE_ID, "welcomeVersion", due.version);

    const welcome = due.kind === "welcome";
    const lines = (welcome ? WHATS_NEW.slice(-1) : due.entries).flatMap(e => e.lines).map(key => localize(key));
    const cards = `@UUID[Compendium.${MODULE_ID}.items.Item.${CARDS_ITEM_ID}]{${localize("STT.Welcome.CardsLink")}}`;
    const html = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/welcome.hbs`, {
      heading: welcome ? localize("STT.Welcome.Heading")
        : localize("STT.Welcome.WhatsNewHeading", { version: due.version }),
      intro: welcome ? localize("STT.Welcome.Intro") : "",
      places: welcome ? PLACES.map(key => formatPlace(key, cards)) : [],
      newTitle: welcome ? localize("STT.Welcome.NewTitle", { version: due.version }) : "",
      lines,
      settingsTitle: localize("STT.Welcome.SettingsTitle"),
      buttons: MENUS.map(({ menu, lang, icon }) => ({ menu, icon, label: localize(`STT.Settings.Menus.${lang}.Name`) })),
      guide: GUIDE_URL,
      guideLabel: localize("STT.Welcome.Guide")
    });
    // The Hero Cards link is drawn as a content link, so it can be dragged onto a character like one in a journal.
    const content = await foundry.applications.ux.TextEditor.implementation.enrichHTML(html);
    await ChatMessage.create({
      content,
      speaker: { alias: game.modules.get(MODULE_ID)?.title ?? MODULE_ID },
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      flags: { [MODULE_ID]: { welcome: due.kind } }
    });
  } catch(err) {
    console.error(`${MODULE_ID} | Could not post the welcome card`, err);
  }
}

/* -------------------------------------------- */

/**
 * One of the places to find things, as HTML: its text escaped, with the request button in place of {tankard}.
 * @param {string} key
 * @param {string} cards  The Hero Cards link, put in place of {cards}.
 * @returns {string}
 */
function formatPlace(key, cards) {
  const label = foundry.utils.escapeHTML(localize("STT.Request.WindowTitle"));
  const tankard = `<button type="button" class="stt-welcome-tankard" data-stt-open-requests data-tooltip="${label}"
    aria-label="${label}"><i class="fa-solid fa-beer-mug-empty" inert></i></button>`;
  return foundry.utils.escapeHTML(localize(key, { cards, tankard: "{tankard}" })).replace("{tankard}", tankard);
}

/* -------------------------------------------- */

/**
 * Make the card's buttons open the settings menu each names, or the request window. One listener on the document, added on init, rather than
 * one per card as it is drawn: the chat log draws the messages already in it before ready, so a
 * card from an earlier session would otherwise have buttons that do nothing. It also covers a popped-out chat log.
 */
export function registerWelcomeButtons() {
  document.addEventListener("click", event => {
    if ( event.target?.closest?.("[data-stt-open-requests]") ) {
      event.preventDefault();
      openRollRequest();
      return;
    }
    const button = event.target?.closest?.("[data-stt-settings-menu]");
    if ( !button ) return;
    event.preventDefault();
    const menu = game.settings?.menus?.get(`${MODULE_ID}.${button.dataset.sttSettingsMenu}`);
    if ( !menu || (menu.restricted && !game.user?.isGM) ) return;
    new menu.type().render({ force: true });
  });
}
