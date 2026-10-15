/**
 * Natural 1s and 20s on a saving throw against an activity's damage. A creature whose save shows a natural 20 takes no
 * damage. One whose save shows a natural 1 takes the damage's maximum, every die at its highest, ignoring its
 * resistances and immunities.
 *
 * dnd5e rolls a save activity's damage once for every target, and its damage tray works out what each target takes
 * from that roll. So each target starts in the tray at what its natural calls for, and the GM can still change it there
 * before applying it.
 *
 * RSReforged applies damage from Apply buttons of its own, without dnd5e's tray, and Midi-QOL rolls the saves and applies
 * the damage itself. Their damage is changed as it is applied instead, by the same rule.
 */

import { MODULE_ID, getNatural } from "./hero-cards.mjs";

/**
 * Damage tray options already given their starting values, so a change the GM makes isn't overwritten.
 * @type {WeakSet<object>}
 */
const seeded = new WeakSet();

/**
 * The damage message whose damage another module's Apply button is applying, such as RSReforged's, which applies it to
 * the targeted tokens without dnd5e's damage tray or any note of where the damage came from. It is noted as the button
 * is clicked, before that module handles the click, and forgotten once the click has been handled.
 * @type {ChatMessage5e|null}
 */
let applying = null;

/**
 * Set while working out a target's resistances and immunities, which works out its damage too, so this file's own
 * hook leaves those calculations alone.
 */
let measuring = false;

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("setup", wrapDamageTray);
Hooks.once("ready", watchApplyButtons);
Hooks.on("dnd5e.preCalculateDamage", onPreCalculateDamage);

/**
 * A target the tray marked for maximum damage takes each damage at its maximum. Damage applied without the tray, from
 * another module's Apply button, is given what the target's natural calls for here instead.
 * @param {Actor5e} actor
 * @param {DamageDescription[]} damages       The damage to apply, changed in place.
 * @param {DamageApplicationOptions} options  Changed in place.
 */
function onPreCalculateDamage(actor, damages, options) {
  if ( measuring ) return;
  const own = options[MODULE_ID];
  // The tray started this target at what its natural calls for, and the GM may have changed it since.
  if ( own?.seeded ) {
    if ( own.maximize ) maximizeDamage(damages, options.originatingMessage);
    return;
  }
  if ( !game.settings.get(MODULE_ID, "naturalSaves") ) return;
  if ( options.midi ) return applyMidiNatural(actor, damages, options);
  if ( !applying ) return;
  const natural = getNaturalFor(actor, applying);
  if ( !natural ) return;
  setNaturalOptions(options, natural, actor, damages);
  if ( natural === 1 ) maximizeDamage(damages, applying);
}

/* -------------------------------------------- */

/**
 * Give a target of Midi-QOL's damage what its save's natural calls for. Midi marks each target whose save was a critical
 * success or failure as it works out their damage, and halves the damage of a save that succeeded in its own handler of
 * the same hook, which runs after this one.
 * @param {Actor5e} actor
 * @param {DamageDescription[]} damages       Changed in place.
 * @param {DamageApplicationOptions} options  Changed in place.
 */
function applyMidiNatural(actor, damages, options) {
  const { criticalSave, fumbleSave, itemCardUuid } = options.midi;
  if ( criticalSave ) {
    for ( const d of damages ) d.value = 0;
    return;
  }
  if ( !fumbleSave ) return;
  // A natural 1 takes the full damage, even on a total that met the DC.
  Object.assign(options.midi, { save: false, saved: false, superSaver: false, semiSuperSaver: false });
  setNaturalOptions(options, 1, actor, damages);
  // Midi keeps the rolls of the activity's damage on its card.
  const card = itemCardUuid ? fromUuidSync(itemCardUuid) : null;
  if ( card ) maximizeDamage(damages, card);
}

/* -------------------------------------------- */

/**
 * Note which damage message an RSReforged Apply button belongs to while its click is handled. The listener runs in
 * the capture phase, so before RSReforged's own, which works out each target's damage before it first waits.
 */
function watchApplyButtons() {
  if ( !game.modules.get("rsreforged")?.active ) return;
  document.addEventListener("click", event => {
    const button = event.target.closest?.('[data-action="rsr-apply-damage"]');
    const id = button?.closest("[data-message-id]")?.dataset.messageId;
    if ( !id ) return;
    applying = game.messages.get(id) ?? null;
    setTimeout(() => applying = null);
  }, { capture: true });
}

/* -------------------------------------------- */

/**
 * Set each damage to its maximum, every die at its highest.
 * @param {DamageDescription[]} damages  Changed in place.
 * @param {ChatMessage5e} message        The damage message the damage was rolled in.
 */
function maximizeDamage(damages, message) {
  const maximum = getMaximumDamage(message);
  if ( !maximum ) return;
  // Grouped as the damage tray groups it, each damage matches its maximum by place. Damage grouped some other way is
  // matched by type, where each type appears once.
  if ( (maximum.length === damages.length) && damages.every((d, i) => maximum[i].type === d.type) ) {
    damages.forEach((d, i) => d.value = maximum[i].value);
    return;
  }
  const once = list => type => list.filter(d => d.type === type).length === 1;
  for ( const d of damages ) {
    if ( once(damages)(d.type) && once(maximum)(d.type) ) d.value = maximum.find(m => m.type === d.type).value;
  }
}

/* -------------------------------------------- */
/*  Saves                                       */
/* -------------------------------------------- */

/**
 * @param {ChatMessage5e} message  A roll made from an activity's card.
 * @returns {ChatMessage5e|null}   The card, if its activity is a save.
 */
function getSaveUsage(message) {
  const usage = message?.system?.origin;
  return (usage?.type === "usage") && (usage.system.activity?.type === "save") ? usage : null;
}

/**
 * The natural 1s and 20s rolled on the saves made against a save activity's card. Each save is found by its token, and
 * by its actor too, as dnd5e's damage tray names a target by its actor when its token isn't on the scene being viewed.
 * A creature's later save stands over an earlier one, as it does for dnd5e's own outcomes.
 * @param {ChatMessage5e} usage
 * @returns {Map<string, 1|20>}  Keyed by token and actor UUID.
 */
export function getSaveNaturals(usage) {
  const naturals = new Map();
  for ( const save of usage.getAssociatedRolls("save") ) {
    const natural = getNatural(save.rolls[0]);
    for ( const uuid of [save.getAssociatedToken()?.uuid, save.getAssociatedActor()?.uuid] ) {
      if ( !uuid ) continue;
      if ( [1, 20].includes(natural) ) naturals.set(uuid, natural);
      else naturals.delete(uuid);
    }
  }
  return naturals;
}

/* -------------------------------------------- */
/*  Damage tray                                 */
/* -------------------------------------------- */

/**
 * dnd5e's damage tray keeps each target's options to itself, so give each target its starting options as the tray
 * first asks for them.
 */
function wrapDamageTray() {
  const Tray = customElements.get("damage-application");
  const getTargetOptions = Tray?.prototype.getTargetOptions;
  if ( !getTargetOptions ) {
    console.warn(`${MODULE_ID} | dnd5e's damage tray has changed: natural 1s and 20s on saves won't change damage.`);
    return;
  }
  Tray.prototype.getTargetOptions = function(uuid) {
    const options = getTargetOptions.call(this, uuid);
    if ( !seeded.has(options) ) {
      seeded.add(options);
      try {
        seedTargetOptions(this, uuid, options);
      } catch(err) {
        console.error(`${MODULE_ID} |`, err);
      }
    }
    return options;
  };
}

/**
 * Start a target of a save activity's damage at what its natural 1 or 20 calls for.
 * @param {DamageApplicationElement} tray
 * @param {string} uuid                       The target's token or actor UUID.
 * @param {DamageApplicationOptions} options  The target's options, changed in place.
 */
export function seedTargetOptions(tray, uuid, options) {
  const damage = tray.chatMessage;
  if ( !game.settings.get(MODULE_ID, "naturalSaves") || (damage?.type !== "damage") ) return;
  const usage = getSaveUsage(damage);
  const natural = usage && getSaveNaturals(usage).get(uuid);
  options[MODULE_ID] = { seeded: true, maximize: natural === 1 };
  if ( !natural ) return;
  const target = fromUuidSync(uuid);
  setNaturalOptions(options, natural, target?.actor ?? target, tray.damages);
}

/* -------------------------------------------- */

/**
 * @param {Actor5e} actor
 * @param {ChatMessage5e} message  A damage message.
 * @returns {1|20|void}  The natural 1 or 20 the actor rolled on their save against the damage's save activity.
 */
function getNaturalFor(actor, message) {
  const usage = message?.type === "damage" ? getSaveUsage(message) : null;
  if ( !usage ) return;
  const naturals = getSaveNaturals(usage);
  return naturals.get(actor.token?.uuid) ?? naturals.get(actor.uuid);
}

/* -------------------------------------------- */

/**
 * Apply what a natural calls for to a target's damage options: no damage for a 20, and for a 1 the full damage past the
 * target's resistances and immunities. Maximising the damage itself is left to the caller.
 * @param {DamageApplicationOptions} options  Changed in place.
 * @param {1|20} natural
 * @param {Actor5e} actor
 * @param {DamageDescription[]} damages
 */
function setNaturalOptions(options, natural, actor, damages) {
  if ( natural === 20 ) {
    options.multiplier = 0;
    return;
  }
  options.multiplier = 1;
  // Everything is ignored already.
  if ( options.ignore === true ) return;
  for ( const [change, types] of Object.entries(getDefences(actor, damages)) ) {
    if ( !types.size ) continue;
    options.ignore ??= {};
    options.ignore[change] = types.union(options.ignore[change] ?? new Set());
  }
}

/**
 * The damage a damage message would do with every die at its highest, grouped as its damage tray groups it.
 * @param {ChatMessage5e} message
 * @returns {{ type: string, value: number }[]|void}
 */
export function getMaximumDamage(message) {
  const rolls = message?.rolls.filter(r => r instanceof CONFIG.Dice.DamageRoll);
  if ( !rolls?.length ) return;
  const maximised = rolls.map(roll => roll.clone().evaluateSync({ maximize: true }));
  return dnd5e.dice.aggregateDamageRolls(maximised, { respectProperties: true })
    .map(roll => ({ type: roll.options.type, value: Math.max(0, roll.total) }));
}

/**
 * The resistances and immunities that would lessen this damage, as the damage tray names them: a damage type, or "ALL".
 * dnd5e names only the first it finds for each damage, so a resistance to fire hidden behind a resistance to all damage
 * only shows once "ALL" is ignored. It is asked again, ignoring what it named, until it names nothing new.
 * @param {Actor5e} actor
 * @param {DamageDescription[]} damages
 * @returns {{ resistance: Set<string>, immunity: Set<string> }}
 */
function getDefences(actor, damages) {
  const found = { resistance: new Set(), immunity: new Set() };
  measuring = true;
  try {
    for ( let size = -1; size !== (found.resistance.size + found.immunity.size); ) {
      size = found.resistance.size + found.immunity.size;
      const calculated = actor?.calculateDamage?.(damages, { ignore: { ...found } });
      for ( const d of calculated || [] ) {
        for ( const change of ["resistance", "immunity"] ) {
          if ( d.active?.all?.[change] ) found[change].add("ALL");
          if ( d.active?.type?.[change] ) found[change].add(d.type);
        }
      }
    }
  } finally {
    measuring = false;
  }
  return found;
}
