/**
 * Just enough of Foundry and dnd5e for the module's rules to be imported and run under Node.
 *
 * The scripts register hooks and define an ApplicationV2 subclass when they load, and read `CONFIG`,
 * `game` and `fromUuidSync` when they run. Vitest loads this file before any test imports them.
 */

import { readFileSync } from "node:fs";

export const actorNames = new Map();

// Foundry's own `Number.isNumeric` (common/primitives/number.mjs), which it installs at startup.
Number.isNumeric = n => {
  if ( Array.isArray(n) ) return false;
  if ( [null, ""].includes(n) ) return false;
  return +n === +n;
};

// Foundry's own `Array#filterJoin` (common/primitives/array.mjs): join the parts that aren't empty.
Object.defineProperty(Array.prototype, "filterJoin", {
  value: function(sep) {
    return this.filter(p => !!p).join(sep);
  }
});

// Foundry's own `String#capitalize` (common/primitives/string.mjs).
Object.defineProperty(String.prototype, "capitalize", {
  value: function() {
    return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this;
  }
});

globalThis.Hooks ={ on() {}, once() {}, call() { return true; }, callAll() {} };

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: Base => class extends Base {},
      DialogV2: { wait: async () => null }
    },
    ux: { FormDataExtended: class {} }
  },
  utils: {
    // Foundry's own escapeHTML (common/utils/helpers.mjs).
    escapeHTML: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]),
    deepClone: v => structuredClone(v),
    getProperty: (object, key) => key.split(".").reduce((o, k) => o?.[k], object)
  }
};

// Foundry's own token dispositions (common/constants.mjs).
globalThis.CONST = { TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } };

globalThis.CONFIG = {
  Dice: { D20Roll: class {}, BasicRoll: class {}, DamageRoll: class {} },
  DND5E: {
    abilities: { str: { label: "Strength" }, dex: { label: "Dexterity" }, wis: { label: "Wisdom" } },
    skills: { ath: { label: "Athletics" }, acr: { label: "Acrobatics" } },
    tools: { thief: {} }
  }
};

globalThis.dnd5e = { documents: { Trait: { keyLabel: key => ({ thief: "Thieves' Tools" })[key] } } };

/**
 * Enough of Foundry's chat log for the scripts: iterable, and able to find a message by ID. Tests assign a plain array
 * of messages to `game.messages`, which is wrapped in a new log each time, as Foundry replaces its log on reload.
 */
class MessageLog extends Array {
  get(id) {
    return this.find(m => m.id === id);
  }

  has(id) {
    return !!this.get(id);
  }

  get contents() {
    return [...this];
  }
}

/**
 * The module's English strings, read as Foundry reads them, so tests see the same text players do.
 */
const strings = JSON.parse(readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

/**
 * @param {string} key
 * @returns {string}  The string, or the key itself if there is none, as Foundry does.
 */
function localize(key) {
  const value = foundry.utils.getProperty(strings, key);
  return typeof value === "string" ? value : key;
}

/**
 * The module's world settings, as a test has set them.
 * @type {Map<string, unknown>}
 */
export const settingValues = new Map([["showDCDefault", false], ["markNaturals", true], ["teamScoring", "average"]]);

let messages = new MessageLog();
globalThis.game = {
  user: { isGM: true },
  settings: { get: (_scope, key) => settingValues.get(key) },
  // The module itself, which names the speaker of its messages.
  modules: new Map([["sogrom-table-tools", { id: "sogrom-table-tools", title: "Sogrom's Table Tools", active: true }]]),
  i18n: {
    lang: "en",
    localize,
    // Foundry's own getListFormatter (client/helpers/localization.mjs).
    getListFormatter: ({ style = "long", type = "conjunction" } = {}) => new Intl.ListFormat("en", { style, type }),
    // Foundry's own format, which is its localize given data (client/helpers/localization.mjs): each {name} is
    // replaced by data.name, so a value left out reads "undefined", as it would in Foundry.
    format: (key, data = {}) => localize(key).replace(/{[^}]+}/g, k => data[k.slice(1, -1)])
  },
  get messages() {
    return messages;
  },
  set messages(value) {
    messages = MessageLog.from(value);
  }
};

/**
 * The IDs of the users who own each actor, keyed by actor UUID.
 * @type {Map<string, string[]>}
 */
export const actorOwners = new Map();

globalThis.fromUuidSync = uuid => (actorNames.has(uuid) ? {
  name: actorNames.get(uuid),
  testUserPermission: (user, level) => (level === "OWNER") && !!actorOwners.get(uuid)?.includes(user.id)
} : null);
