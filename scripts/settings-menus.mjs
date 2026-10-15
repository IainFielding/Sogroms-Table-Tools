/**
 * Settings menus: the module's settings, grouped into Hero Cards, Dice Rolling, Roll Requests and Gameplay
 * Enhancements, each opened from a button in Configure Settings rather than listed there.
 */

import { MODULE_ID } from "./hero-cards.mjs";
import { labelsSuperseded } from "./chat-button-labels.mjs";

/**
 * Settings another module can make moot, each with a check for that and the note shown in place of its hint. Such a
 * setting is shown switched off and can't be changed, and what was saved for it is kept.
 * @type {Record<string, { test: () => boolean, note: string }>}
 */
const SUPERSEDED = {
  chatButtonLabels: { test: labelsSuperseded, note: "STT.Settings.ChatButtonLabels.Superseded" }
};

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A window for one group of the module's world settings. Each subclass names its settings in `SETTINGS`.
 */
class SettingsMenu extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["stt-settings-menu"],
    tag: "form",
    window: {
      icon: "fa-solid fa-gears",
      contentClasses: ["standard-form"]
    },
    position: { width: 520, height: "auto" },
    form: {
      handler: SettingsMenu.#onSubmit,
      closeOnSubmit: true
    }
  };

  /** @override */
  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/settings-menu.hbs` },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /**
   * The keys of the settings this menu shows, in order.
   * @type {string[]}
   */
  static SETTINGS = [];

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.settings = this.constructor.SETTINGS.map(key => {
      const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
      const superseded = SUPERSEDED[key]?.test() ? SUPERSEDED[key] : null;
      const value = superseded ? false : game.settings.get(MODULE_ID, key);
      // A setting with choices is a dropdown, a number a number field, and the others are checkboxes.
      const choices = setting.choices ? Object.entries(setting.choices).map(([choice, label]) => ({
        value: choice, label: game.i18n.localize(label), selected: choice === value
      })) : null;
      return {
        key,
        id: `${this.id}-${key}`,
        label: game.i18n.localize(setting.name),
        hint: game.i18n.localize(superseded?.note ?? setting.hint),
        disabled: !!superseded,
        value,
        choices,
        number: isNumber(setting)
      };
    });
    context.buttons = [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Save the settings that changed, so only their own onChange handlers run.
   * @this {SettingsMenu}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const values = formData.object;
    for ( const key of this.constructor.SETTINGS ) {
      // A disabled field isn't submitted, which would read as switched off.
      if ( SUPERSEDED[key]?.test() ) continue;
      const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
      const { choices } = setting;
      let value = choices ? values[key] : !!values[key];
      // A blank number field saves as no value at all.
      if ( isNumber(setting) ) value = Number.isNumeric(values[key]) ? Number(values[key]) : null;
      if ( choices && !(value in choices) ) continue;
      if ( value !== game.settings.get(MODULE_ID, key) ) await game.settings.set(MODULE_ID, key, value);
    }
  }
}

/* -------------------------------------------- */

/**
 * @param {SettingConfig} setting
 * @returns {boolean}  Whether the setting holds a number.
 */
function isNumber(setting) {
  return (setting.type === Number) || (setting.type instanceof foundry.data.fields.NumberField);
}

/* -------------------------------------------- */

class HeroCardsSettings extends SettingsMenu {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stt-settings-hero-cards",
    window: { title: "STT.Settings.Menus.HeroCards.Name", icon: "fa-solid fa-cards-blank" }
  };

  /** @override */
  static SETTINGS = ["lockNaturals", "showPlayedCards"];
}

class DiceRollingSettings extends SettingsMenu {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stt-settings-dice-rolling",
    window: { title: "STT.Settings.Menus.DiceRolling.Name", icon: "fa-solid fa-dice-d20" }
  };

  /** @override */
  static SETTINGS = ["markNaturals", "naturalChecks", "naturalSaveOutcomes", "naturalSaves", "naturalRollOff",
    "naturalInitiative", "heavyWeapons", "loadingWeapons", "reloadWeapons", "lanceDisadvantage", "flanking"];
}

class RollRequestSettings extends SettingsMenu {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stt-settings-roll-requests",
    window: { title: "STT.Settings.Menus.RollRequests.Name", icon: "fa-solid fa-beer-mug-empty" }
  };

  /** @override */
  static SETTINGS = ["defaultDC", "showDCDefault", "teamScoring", "attachRolls", "popupPlayers", "popupGM", "deathSavePrompt"];
}

class WorldScriptSettings extends SettingsMenu {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stt-settings-world-scripts",
    window: { title: "STT.Settings.Menus.WorldScripts.Name", icon: "fa-solid fa-earth-europe" }
  };

  /** @override */
  static SETTINGS = ["bloodiedTint", "fadeUnprepared", "rarityColours", "chatButtonLabels", "oneTabActivities",
    "spellComponentWarnings", "welcomeCards"];
}

/* -------------------------------------------- */

Hooks.once("init", registerMenus);

/**
 * Register a Configure Settings button for each group of settings.
 */
function registerMenus() {
  const menus = {
    heroCards: [HeroCardsSettings, "HeroCards"],
    diceRolling: [DiceRollingSettings, "DiceRolling"],
    rollRequests: [RollRequestSettings, "RollRequests"],
    worldScripts: [WorldScriptSettings, "WorldScripts"]
  };
  for ( const [key, [type, lang]] of Object.entries(menus) ) {
    game.settings.registerMenu(MODULE_ID, key, {
      name: `STT.Settings.Menus.${lang}.Name`,
      label: `STT.Settings.Menus.${lang}.Label`,
      hint: `STT.Settings.Menus.${lang}.Hint`,
      icon: type.DEFAULT_OPTIONS.window.icon,
      type,
      restricted: true
    });
  }
}
