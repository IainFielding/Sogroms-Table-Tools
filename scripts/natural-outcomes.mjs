/**
 * Natural 1s and 20s that decide a roll made against a DC: a natural 20 always succeeds and a natural 1 always fails,
 * whatever the total, on each kind of roll whose setting is on (see getNaturalOutcome in hero-cards.mjs).
 *
 * A roll request's card scores its own rolls, in roll-requests.mjs. dnd5e judges every other roll that carries its DC,
 * such as a check asked for from a journal, by the roll's own `isSuccess` and `isFailure`. So those are wrapped here,
 * and everything dnd5e works out from them follows.
 */

import { MODULE_ID, getNatural, getNaturalOutcome } from "./hero-cards.mjs";

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("setup", wrapD20Roll);

/**
 * Let a natural 1 or 20 decide whether a d20 roll made against a target succeeds. dnd5e notes on each roll what kind it
 * is, as its `rollType`.
 */
export function wrapD20Roll() {
  const proto = CONFIG.Dice.D20Roll?.prototype;
  const getters = ["isSuccess", "isFailure"].map(name => findGetter(proto, name));
  if ( !getters.every(Boolean) ) {
    console.warn(`${MODULE_ID} | dnd5e's d20 roll has changed: natural 1s and 20s won't decide rolls made against a DC.`);
    return;
  }
  const [isSuccess, isFailure] = getters;
  const wrap = (name, getter, succeeds) => Object.defineProperty(proto, name, {
    configurable: true,
    get() {
      const result = getter.call(this);
      // Not rolled yet, or with no target to succeed or fail against.
      if ( (result === undefined) || !Number.isNumeric(this.options.target) ) return result;
      const outcome = getNaturalOutcome(getNatural(this), this.options.rollType);
      return outcome === null ? result : outcome === succeeds;
    }
  });
  wrap("isSuccess", isSuccess, true);
  wrap("isFailure", isFailure, false);
}

/* -------------------------------------------- */

/**
 * @param {object|void} proto  A prototype.
 * @param {string} name
 * @returns {Function|void}  The getter of that name it has or inherits.
 */
function findGetter(proto, name) {
  for ( let p = proto; p; p = Object.getPrototypeOf(p) ) {
    const getter = Object.getOwnPropertyDescriptor(p, name)?.get;
    if ( getter ) return getter;
  }
}
