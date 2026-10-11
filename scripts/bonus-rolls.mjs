/**
 * Bonus rolls: a die rolled by another feature, such as Bardic Inspiration or Cutting Words, can be added to or
 * subtracted from a roll already in chat. Right-click the bonus roll's message and choose the roll to change.
 *
 * The roll changed is rewritten in place, as a Hero Card's Inspiration does, so its total, hit or miss, and any
 * roll request's result are worked out again. The bonus roll is marked as used, so it can only be spent once.
 */

import {
  EMBEDDED_ROLLS, MODULE_ID, finalize, getRollKind, localize, onEmbeddedRolls, reportError, sumTotals, updateInitiative
} from "./hero-cards.mjs";

/**
 * How many of the latest chat messages are offered as rolls to change.
 */
const RECENT_MESSAGES = 30;

/**
 * Bonus rolls being spent on this client, so a second click cannot spend one again before it is marked as used.
 * @type {Set<string>}
 */
const spending = new Set();

/**
 * How each kind of roll is named when a roll message has no flavor of its own.
 */
const ROLL_KINDS = {
  attack: "STT.RollKind.Attack",
  damage: "STT.RollKind.Damage",
  check: "STT.RollKind.Check",
  save: "STT.RollKind.Save",
  initiative: "STT.RollKind.Initiative",
  divine: "STT.RollKind.Divine"
};

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.on("getChatMessageContextOptions", onGetContextOptions);
Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
Hooks.once("ready", () => game.socket.on(`module.${MODULE_ID}`, onSocketMessage));

/**
 * Offer Add to a roll and Subtract from a roll on a bonus roll's message.
 * @param {ChatLog} _app
 * @param {ContextMenuEntry[]} options
 */
function onGetContextOptions(_app, options) {
  for ( const sign of [1, -1] ) {
    options.push({
      label: localize(sign > 0 ? "STT.Bonus.MenuAdd" : "STT.Bonus.MenuSubtract"),
      icon: sign > 0 ? "fa-solid fa-plus" : "fa-solid fa-minus",
      visible: li => !!getBonusSource(li, game.user),
      onClick: (_event, li) => chooseTarget(getBonusSource(li, game.user), sign).catch(reportError)
    });
  }
}

/* -------------------------------------------- */

/**
 * The bonus roll a message's right-click menu spends: the message itself, or one another module draws inside its card,
 * as RSReforged draws a feature's die inside the feature's card and leaves the die's own message empty.
 * @param {HTMLElement} li  The message's element in the chat log.
 * @param {User} user
 * @returns {ChatMessage5e|null}
 */
function getBonusSource(li, user) {
  const message = game.messages.get(li.dataset.messageId);
  if ( canSpend(message, user) ) return message;
  for ( const element of li.querySelectorAll(EMBEDDED_ROLLS) ) {
    const roll = game.messages.get(element.dataset.messageId);
    if ( (roll !== message) && canSpend(roll, user) ) return roll;
  }
  return null;
}

/* -------------------------------------------- */

/**
 * Note on a bonus roll which roll it was spent on, and on any card another module draws it inside.
 * @param {ChatMessage5e} message
 * @param {HTMLElement} html
 */
function onRenderChatMessage(message, html) {
  const note = createUsedNote(message);
  if ( note ) html.querySelector(".message-content")?.append(note);
  onEmbeddedRolls(html, (roll, element) => {
    const embedded = roll === message ? null : createUsedNote(roll);
    if ( embedded ) element.append(embedded);
  });
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e} message
 * @returns {HTMLParagraphElement|null}  A note of the roll a bonus roll was spent on, if it has been.
 */
function createUsedNote(message) {
  const used = message.getFlag(MODULE_ID, "bonusUsed");
  if ( !used ) return null;
  const note = document.createElement("p");
  note.className = "supplement stt-card-log stt-bonus-used";
  note.innerHTML = `<i class="fa-solid ${used.sign > 0 ? "fa-plus" : "fa-minus"}" inert></i>`;
  note.append(localize(used.sign > 0 ? "STT.Bonus.AddedTo" : "STT.Bonus.SubtractedFrom", { target: used.target }));
  return note;
}

/* -------------------------------------------- */

/**
 * Handle the module's socket messages: the active GM applies bonuses for users who may not change the roll themselves,
 * and tells them if it couldn't.
 * @param {object} data
 * @param {string} userId  The sender, which Foundry's server adds, so it cannot be forged.
 */
function onSocketMessage(data, userId) {
  switch ( data?.action ) {
    case "applyBonus": return onApplyBonusRequest(data, userId);
    case "bonusNotApplied": return ui.notifications.warn(localize(data.reason === "invalid"
      ? "STT.Bonus.GMRefused" : "STT.Bonus.GMFailed"));
  }
}

/* -------------------------------------------- */

/**
 * As the active GM, apply a bonus a user asked for. The request is checked again here, as the user who sent it: only
 * the bonus roll's own author may spend it, and only on a roll they can see. If it can't be applied, they are told.
 * @param {object} data
 * @param {string} userId
 */
async function onApplyBonusRequest(data, userId) {
  if ( game.user !== game.users.activeGM ) return;
  const user = game.users.get(userId);
  if ( !user ) return;
  const reply = reason => game.socket.emit(`module.${MODULE_ID}`, { action: "bonusNotApplied", reason },
    { recipients: [userId] });
  const source = game.messages.get(data.source);
  const target = game.messages.get(data.target);
  if ( !canSpend(source, user) || !isValidTarget(target, source, user) ) return reply("invalid");
  try {
    if ( !(await applyBonus(source, target, data.sign < 0 ? -1 : 1)) ) reply("invalid");
  } catch(err) {
    console.error(`${MODULE_ID} | Could not apply a bonus roll for ${user.name}`, err);
    reply("error");
  }
}

/* -------------------------------------------- */
/*  Choosing                                    */
/* -------------------------------------------- */

/**
 * @param {ChatMessage5e|void} message
 * @returns {boolean}  Whether this message is a bonus roll that can still be spent: a plain roll, such as a feature's
 *   die, rather than a check, save, attack or damage roll, and not one made for a roll request. Midi-QOL keeps a
 *   feature's die on the feature's card, along with any attack or damage, so a card holding only plain rolls counts.
 */
export function isBonusRoll(message) {
  if ( !message?.rolls.length ) return false;
  if ( message.getFlag(MODULE_ID, "bonusUsed") || message.getFlag(MODULE_ID, "requestRoll") ) return false;
  const { D20Roll, DamageRoll } = CONFIG.Dice;
  return (getRollKind(message) === null) && message.rolls.every(r => !(r instanceof D20Roll) && !(r instanceof DamageRoll));
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e|void} message
 * @param {User} user
 * @returns {boolean}  Whether this user may spend this bonus roll: they rolled it, or they are the GM.
 */
export function canSpend(message, user) {
  if ( !isBonusRoll(message) || !canSee(message, user) ) return false;
  return user.isGM || (message.author?.id === user.id);
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e} message
 * @param {User} user
 * @returns {boolean}  Whether this user can see the message's rolls. `isContentVisible` only answers for this client's
 *   own user, and the GM also checks requests made by others.
 */
export function canSee(message, user) {
  if ( user.isGM ) return true;
  if ( message.blind ) return false;
  return !message.whisper.length || message.whisper.includes(user.id) || (message.author?.id === user.id);
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e|void} target
 * @param {ChatMessage5e} source  The bonus roll.
 * @param {User} user
 * @returns {boolean}  Whether this user may spend the bonus roll on this roll.
 */
export function isValidTarget(target, source, user) {
  return !!target && (target !== source) && !!getRollKind(target) && canSee(target, user);
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e} source  The bonus roll.
 * @returns {ChatMessage5e[]}  The latest rolls this user could change with it, newest first.
 */
export function getTargets(source) {
  const canAsk = !!game.users.activeGM;
  return game.messages.contents.slice(-RECENT_MESSAGES).reverse().filter(message => {
    if ( !isValidTarget(message, source, game.user) ) return false;
    return canAsk || message.canUserModify(game.user, "update");
  });
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e} message  A roll to change.
 * @param {object} [options]
 * @param {boolean} [options.total=true]  Include the roll's current total.
 * @returns {string}  How it is listed, e.g. "Sefris · Dexterity Saving Throw · 12".
 */
function describeTarget(message, { total=true }={}) {
  const who = message.getAssociatedActor()?.name ?? message.speaker.alias;
  const sum = total ? sumTotals(message.rolls) : null;
  return [who, message.flavor || localize(ROLL_KINDS[getRollKind(message)]), sum].filterJoin(" · ");
}

/* -------------------------------------------- */

/**
 * @param {ChatMessage5e} source
 * @returns {string}  The bonus's name: its feature's, or the message's flavor.
 */
function getBonusLabel(source) {
  return source.getAssociatedActivity?.()?.item?.name || source.flavor || localize("STT.Bonus.DefaultLabel");
}

/* -------------------------------------------- */

/**
 * Ask which roll to change, then change it.
 * @param {ChatMessage5e} source
 * @param {1|-1} sign  Add or subtract.
 */
async function chooseTarget(source, sign) {
  const targets = getTargets(source);
  if ( !targets.length ) {
    ui.notifications.warn(localize("STT.Bonus.NoTargets"));
    return;
  }
  const { escapeHTML } = foundry.utils;
  const keys = sign > 0 ? { title: "STT.Bonus.AddTitle", hint: "STT.Bonus.AddHint" }
    : { title: "STT.Bonus.SubtractTitle", hint: "STT.Bonus.SubtractHint" };
  const buttons = targets.map((m, i) => `
    <button type="button" class="stt-bonus-choice" data-index="${i}">
      <span>${escapeHTML(describeTarget(m))}</span>
    </button>
  `).join("");

  let chosen;
  await foundry.applications.api.DialogV2.wait({
    classes: ["stt-card-dialog", "stt-bonus-dialog"],
    window: {
      title: localize(keys.title, { label: getBonusLabel(source) }),
      icon: `fa-solid ${sign > 0 ? "fa-plus" : "fa-minus"}`
    },
    position: { width: 420 },
    content: `
      <p class="stt-card-hint">${escapeHTML(localize(keys.hint, {
        formula: source.rolls[0].formula, total: source.rolls[0].total
      }))}</p>
      <div class="stt-bonus-list">${buttons}</div>
    `,
    buttons: [{ action: "cancel", label: "STT.Common.Cancel", icon: "fa-solid fa-xmark" }],
    render: (_event, dialog) => {
      for ( const el of dialog.element.querySelectorAll(".stt-bonus-choice") ) {
        el.addEventListener("click", () => {
          chosen = Number(el.dataset.index);
          dialog.close();
        });
      }
    },
    close: () => chosen,
    rejectClose: false
  });
  const target = targets[chosen];
  if ( !target ) return;

  // Rolls this user may not change are changed by the GM, who says so if they can't.
  if ( target.canUserModify(game.user, "update") ) {
    await applyBonus(source, target, sign);
    return;
  }
  const gm = game.users.activeGM;
  if ( !gm ) {
    ui.notifications.warn(localize("STT.Bonus.NoGM"));
    return;
  }
  game.socket.emit(`module.${MODULE_ID}`, { action: "applyBonus", source: source.id, target: target.id, sign },
    { recipients: [gm.id] });
  ui.notifications.info(localize("STT.Bonus.SentToGM"));
}

/* -------------------------------------------- */
/*  Applying                                    */
/* -------------------------------------------- */

/**
 * Add a bonus roll's total to another roll, or subtract it, noting it on both.
 *
 * If two clients spend the same bonus at the same moment, both mark it used and both rewrite the roll from the same
 * starting point, so the bonus is applied once. A card played on the same roll at the same moment can be lost the same
 * way, as both rewrite the whole roll; that needs two people acting on one roll within a fraction of a second.
 * @param {ChatMessage5e|void} source  The bonus roll.
 * @param {ChatMessage5e|void} target  The roll to change.
 * @param {1|-1} sign
 * @returns {Promise<boolean>}  Whether the bonus was applied: false if it was already spent, or is being spent.
 */
export async function applyBonus(source, target, sign) {
  if ( !source || !target || source.getFlag(MODULE_ID, "bonusUsed") || spending.has(source.id) ) return false;
  spending.add(source.id);
  try {
    // Marked as used before the roll is changed, so it cannot be spent twice. If changing the roll fails, the mark is
    // taken off again and the bonus can still be spent.
    await source.setFlag(MODULE_ID, "bonusUsed", { target: describeTarget(target, { total: false }), sign });
    try {
      await addBonus(source, target, sign);
    } catch(err) {
      await source.unsetFlag(MODULE_ID, "bonusUsed");
      throw err;
    }
    // The roll now holds the bonus, so it stays spent, and counts as applied, even if the tracker can't be updated.
    if ( getRollKind(target) === "initiative" ) await updateInitiative(target);
    return true;
  } finally {
    spending.delete(source.id);
  }
}

/* -------------------------------------------- */

/**
 * Rewrite a roll with a bonus roll's total added or subtracted, and note it on the roll.
 * @param {ChatMessage5e} source  The bonus roll.
 * @param {ChatMessage5e} target  The roll to change.
 * @param {1|-1} sign
 */
async function addBonus(source, target, sign) {
  const bonus = source.rolls[0];
  const rolls = target.rolls.map(r => Roll.fromData(r.toJSON()));
  // The bonus goes on the first roll, but the note gives the whole message's total, as the list of rolls did, so a
  // damage roll of several types reads the same in both.
  const before = sumTotals(rolls);

  // A single die keeps its dice in the roll's breakdown; anything longer is added as its total.
  const { NumericTerm, OperatorTerm } = foundry.dice.terms;
  const terms = Roll.fromData(bonus.toJSON()).terms;
  rolls[0].terms.push(OperatorTerm.fromData({ class: "OperatorTerm", operator: sign > 0 ? "+" : "-", evaluated: true }));
  if ( terms.length === 1 ) rolls[0].terms.push(terms[0]);
  else rolls[0].terms.push(NumericTerm.fromData({
    class: "NumericTerm", number: bonus.total, options: { flavor: bonus.formula }, evaluated: true
  }));
  finalize(rolls[0]);

  const label = getBonusLabel(source);
  const detail = localize(sign > 0 ? "STT.Bonus.Log.Added" : "STT.Bonus.Log.Subtracted", {
    formula: bonus.formula, bonus: bonus.total, before, after: sumTotals(rolls)
  });
  const entry = {
    text: localize("STT.Cards.Log.Entry", { card: label, detail }),
    card: label,
    icon: sign > 0 ? "fa-solid fa-plus" : "fa-solid fa-minus",
    by: source.getAssociatedActor()?.name ?? source.speaker.alias ?? ""
  };
  const log = [...(target.getFlag(MODULE_ID, "log") ?? []), entry];
  await target.update({ rolls: rolls.map(r => r.toJSON()), [`flags.${MODULE_ID}.log`]: log });
}
