/**
 * The GM's window for asking for rolls.
 */

import { MODULE_ID, localize } from "./hero-cards.mjs";
import {
  CHALLENGE_PARTS, DICE, DIVINE_RANGE, MAX_CHOICES, MODES, ROLL_MODES, SCORING, createRequest, getChoices, getPartLabel
} from "./roll-requests.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { FormDataExtended } = foundry.applications.ux;

/**
 * @typedef {object} DraftRoll
 * @property {string} roll            The roll, e.g. "skill.ath" or "d20".
 * @property {number|null} dc
 * @property {DraftChoice[]} alternatives  Other rolls the actor may choose instead.
 */

/**
 * @typedef {object} DraftChoice
 * @property {string} roll
 * @property {number|null} [dc]  Its own DC, in a mode where each choice has one: null for none. Left out, as when the
 *   choice was added in a mode without, it starts as its roll's DC.
 */

/**
 * @typedef {object} RequestDraft
 * @property {string} mode
 * @property {DraftRoll[]} parts  Always three: the rolls outside a contest.
 * @property {DraftRoll} standard  A standard roll's roll and DC, starting as a d20.
 * @property {Record<string, [string, string]>} sideRolls  Each contest mode's roll for each side, keyed by mode,
 *   starting as d20 against d20.
 * @property {number} successes
 * @property {number} range  How many consecutive numbers a Divine Intervention roll is given.
 * @property {string} scoring  How a Team Challenge is scored: a key in SCORING.
 * @property {boolean} showDC
 * @property {"public"|"gm"|"blind"} rollMode
 * @property {string[]} actors                 Who rolls, outside a contest.
 * @property {string|null} divine              Who prays in Divine Intervention, kept apart so picking them leaves
 *   who rolls in the other modes alone. Null until one is picked, when it is the first of those who roll.
 * @property {[string[], string[]]} teams      Each team in Team vs Team.
 * @property {[string|null, string|null]} rivals  Each side of a Roll-Off.
 */

/**
 * @typedef {object} RequestPreset
 * @property {string} [mode]      The kind of request to start on, a key in MODES.
 * @property {string[]} [actors]  The UUIDs of who rolls.
 * @property {string} [group]     Instead of `actors`, a quick pick whose members roll: "party", "combat", "hostile",
 *   "selected", "scene", or "group.<actor ID>" for another group actor. See getQuickPicks.
 */

/**
 * @typedef {object} QuickPick
 * @property {string} id       "party", "group.<actor ID>", "combat", "hostile", "selected" or "scene".
 * @property {string} label
 * @property {string} icon
 * @property {string[]} uuids  The actors it ticks.
 */

export default class RollRequestConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "stt-roll-request",
    classes: ["stt-card-dialog", "stt-request-config"],
    tag: "form",
    window: {
      title: "STT.Request.WindowTitle",
      icon: "fa-solid fa-beer-mug-empty",
      contentClasses: ["standard-form"]
    },
    position: { width: 600, height: "auto" },
    form: {
      handler: RollRequestConfig.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      selectAll: RollRequestConfig.#onSelectAll,
      addChoice: RollRequestConfig.#onAddChoice,
      removeChoice: RollRequestConfig.#onRemoveChoice,
      pickGroup: RollRequestConfig.#onPickGroup
    }
  };

  /** @override */
  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/roll-request.hbs` },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /**
   * The last request made this session, used as the starting point for the next one.
   * @type {RequestDraft|null}
   */
  static #last = null;

  /**
   * Actors offered in the window, in the order shown. Chosen when the window first opens.
   * @type {Actor5e[]|null}
   */
  #actors = null;

  /**
   * The request as filled in so far, kept so switching mode does not lose it.
   * @type {RequestDraft|null}
   */
  #draft = null;

  /**
   * The kind of request and who rolls, set over the starting draft when the window first opens.
   * @type {RequestPreset|null}
   */
  #preset = null;

  /**
   * @param {object} [options]
   * @param {RequestPreset} [options.preset]  The kind of request and who rolls, to start with.
   */
  constructor({ preset, ...options }={}) {
    super(options);
    this.#preset = preset ?? null;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#actors ??= getCandidates(this.#preset?.actors);
    this.#draft ??= this.#getInitialDraft();
    const draft = this.#draft;
    const mode = MODES[draft.mode];
    const challenge = draft.mode === "challenge";
    const team = draft.mode === "team";
    const rollOptions = getRollGroups(mode.dice ?? ["d20"]);

    // Divine Intervention is always a d100, so it has no roll to choose.
    // Contests keep their own rolls, one per side, so they start as d20 against d20 whatever the other modes hold.
    let rows = [];
    if ( mode.contest ) {
      rows = mode.sides.map((side, index) => ({
        label: localize("STT.Request.Config.SideRoll", { side: localize(side) }),
        field: `sideRolls.${index}`,
        roll: draft.sideRolls[draft.mode][index]
      }));
    }
    else if ( challenge ) {
      rows = Array.from({ length: CHALLENGE_PARTS }, (_, i) => ({
        label: localize("STT.Request.Config.NumberedRoll", { number: i + 1 }), hasDC: true
      }));
    }
    // A standard roll keeps its own roll too, starting as a d20.
    else if ( draft.mode === "standard" ) {
      rows = [{ label: localize("STT.Request.Config.Roll"), hasDC: true, field: "standard", ...draft.standard }];
    }
    else if ( draft.mode !== "divine" ) rows = [{ label: localize("STT.Request.Config.Roll"), hasDC: true }];
    rows.forEach((row, index) => {
      if ( !row.field ) Object.assign(row, { field: `parts.${index}`, ...draft.parts[index] });
      // Where the mode allows it, a roll can offer others to choose from instead.
      row.canChoose = !!mode.choices && !!row.hasDC;
      row.choiceDCs = row.canChoose && !!mode.choiceDCs;
      row.alternatives = row.canChoose ? row.alternatives.map(({ roll, dc }, i) => ({
        roll, dc: dc === undefined ? row.dc : dc, index: i
      })) : [];
      row.full = row.alternatives.length >= MAX_CHOICES - 1;
    });

    // Anyone a quick pick would tick is offered, even if they arrived after the window opened, such as a token selected
    // since. They are added at the end, so the actors already listed keep their places.
    const picks = getQuickPicks();
    for ( const uuid of new Set(picks.flatMap(p => p.uuids)) ) {
      const actor = this.#actors.some(a => a.uuid === uuid) ? null : fromUuidSync(uuid);
      if ( actor ) this.#actors.push(actor);
    }
    const pickContext = (chosen, { exclude=null, side=null }={}) => picks.filter(p => p.id !== exclude).map(p => ({
      id: p.id, label: p.label, icon: p.icon, count: p.uuids.length, side, hasSide: side !== null,
      pressed: p.uuids.every(uuid => chosen.includes(uuid)),
      tooltip: localize("STT.Request.Config.Picks.Tooltip", { name: p.label })
    }));

    const choice = (actor, index, checked) => ({ index, name: actor.name, img: actor.img, checked });
    return Object.assign(context, {
      modes: Object.entries(MODES).map(([value, m]) => ({
        value, icon: m.icon, label: localize(m.label), hint: localize(m.hint), checked: value === draft.mode
      })),
      rows,
      rollOptions,
      challenge,
      contest: !!mode.contest,
      divine: draft.mode === "divine",
      range: draft.range,
      rangeLimits: DIVINE_RANGE,
      successes: draft.successes,
      successOptions: Array.from({ length: CHALLENGE_PARTS }, (_, i) => ({
        value: i + 1, label: localize("STT.Request.Config.SuccessesOf", { count: i + 1, total: CHALLENGE_PARTS })
      })),
      team,
      scoringOptions: Object.entries(SCORING).map(([value, s]) => ({
        value, label: localize(s.label), selected: value === draft.scoring
      })),
      scoringHint: localize(SCORING[draft.scoring].hint),
      // Divine Intervention asks one actor: the one picked for it, or else the first of those chosen in another mode.
      actors: this.#actors.map((a, i) => choice(a, i, draft.mode === "divine"
        ? (draft.divine ?? draft.actors[0]) === a.uuid
        : draft.actors.includes(a.uuid))),
      picks: pickContext(draft.actors),
      sides: mode.contest ? mode.sides.map((label, side) => ({
        label: localize(label),
        side,
        single: draft.mode === "rolloff",
        // A Roll-Off side is one actor, so it has no quick picks. The players don't pick the hostile combatants, and the
        // NPCs don't pick the party.
        picks: draft.mode === "rolloff" ? [] : pickContext(draft.teams[side], { exclude: side ? "party" : "hostile", side }),
        actors: this.#actors.map((a, i) => choice(a, i, draft.mode === "rolloff"
          ? draft.rivals[side] === a.uuid
          : draft.teams[side].includes(a.uuid)))
      })) : null,
      showDC: draft.showDC,
      rollMode: draft.rollMode,
      buttons: [{ type: "submit", icon: "fa-solid fa-paper-plane", label: "STT.Request.Config.Send" }]
    });
  }

  /* -------------------------------------------- */

  /**
   * @returns {RequestDraft}  The last request made, or a fresh one built from the selected tokens.
   */
  #getInitialDraft() {
    const selected = canvas.tokens?.controlled.map(t => t.actor).filter(Boolean) ?? [];
    const players = this.#actors.filter(a => a.hasPlayerOwner).map(a => a.uuid);
    const draft = foundry.utils.deepClone(RollRequestConfig.#last) ?? {
      mode: "standard",
      parts: Array.from({ length: CHALLENGE_PARTS }, () => ({ roll: "skill.ath", dc: null })),
      successes: 2,
      range: DIVINE_RANGE.initial,
      rollMode: "public"
    };
    draft.standard ??= { roll: "d20", dc: null };
    // Every DC starts as the GM's default, blank unless they have set one, so they set a DC only if they want it, here
    // or later from the card. The rolls carry over from the last request, but not their DCs.
    const dc = game.settings.get(MODULE_ID, "defaultDC");
    for ( const part of [draft.standard, ...draft.parts] ) {
      part.dc = Number.isInteger(dc) ? dc : null;
      for ( const choice of part.alternatives ?? [] ) delete choice.dc;
    }
    // How a Team Challenge is scored carries over from the last request, and otherwise starts from the GM's setting.
    if ( !(draft.scoring in SCORING) ) draft.scoring = game.settings.get(MODULE_ID, "teamScoring");
    if ( !(draft.scoring in SCORING) ) draft.scoring = "average";
    for ( const part of [draft.standard, ...draft.parts] ) part.alternatives ??= [];
    draft.sideRolls ??= {};
    for ( const [key, m] of Object.entries(MODES) ) if ( m.contest ) draft.sideRolls[key] ??= ["d20", "d20"];
    // Who rolls always starts from the current selection rather than the last request, and whether players see the
    // DC always starts from the GM's setting. In a combat, the NPCs' team starts as the hostile combatants unless NPCs
    // are selected.
    const npcs = selected.filter(a => !a.hasPlayerOwner).map(a => a.uuid);
    const hostile = getQuickPicks().find(p => p.id === "hostile")?.uuids ?? [];
    Object.assign(draft, {
      showDC: game.settings.get(MODULE_ID, "showDCDefault"),
      actors: selected.length ? selected.map(a => a.uuid) : players,
      divine: null,
      teams: [players, npcs.length ? npcs : hostile],
      rivals: [selected[0]?.uuid ?? null, selected[1]?.uuid ?? null]
    });
    if ( this.#preset ) Object.assign(draft, resolvePreset(this.#preset, draft));
    return draft;
  }

  /* -------------------------------------------- */

  /**
   * Switch the open window to a kind of request and who rolls, keeping the rest of what the GM has filled in.
   * @param {RequestPreset} preset
   */
  applyPreset(preset) {
    this.#readForm();
    const resolved = resolvePreset(preset, this.#draft);
    for ( const uuid of resolved.actors ?? [resolved.divine] ) {
      const actor = fromUuidSync(uuid);
      if ( actor && !this.#actors.some(a => a.uuid === uuid) ) this.#actors.unshift(actor);
    }
    Object.assign(this.#draft, resolved);
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */

  /**
   * Update the draft from the fields currently shown.
   * @returns {RequestDraft}
   */
  #readForm() {
    const data = foundry.utils.expandObject(new FormDataExtended(this.element).object);
    const draft = this.#draft;
    const chosen = flags => this.#actors.filter((_, i) => flags?.[i]).map(a => a.uuid);
    const shown = draft.mode;

    const toDC = dc => (Number.isNumeric(dc) ? Number(dc) : null);
    // A choice's DC is only shown in a mode where each choice has one. Elsewhere it is left out, not cleared, so it
    // starts as its roll's DC on switching to such a mode.
    const toRoll = ({ roll, dc, alternatives }, previous) => ({
      roll,
      dc: toDC(dc),
      alternatives: Object.values(alternatives ?? {}).map((a, i) => {
        if ( "dc" in a ) return { roll: a.roll, dc: toDC(a.dc) };
        const before = previous?.alternatives?.[i];
        return (before && ("dc" in before)) ? { roll: a.roll, dc: before.dc } : { roll: a.roll };
      })
    });
    for ( const [i, part] of Object.entries(data.parts ?? {}) ) draft.parts[i] = toRoll(part, draft.parts[i]);
    for ( const [i, side] of Object.entries(data.sideRolls ?? {}) ) draft.sideRolls[shown][i] = side.roll;
    if ( data.standard ) draft.standard = toRoll(data.standard);
    if ( "successes" in data ) draft.successes = Number(data.successes) || 2;
    if ( data.scoring in SCORING ) draft.scoring = data.scoring;
    if ( "range" in data ) {
      draft.range = Math.clamp(Math.round(Number(data.range) || DIVINE_RANGE.initial), DIVINE_RANGE.min, DIVINE_RANGE.max);
    }
    if ( "showDC" in data ) draft.showDC = !!data.showDC;
    draft.rollMode = ROLL_MODES.includes(data.rollMode) ? data.rollMode : "public";

    if ( shown === "rolloff" ) draft.rivals = [0, 1].map(s => this.#actors[data.rivals?.[s]]?.uuid ?? null);
    else if ( shown === "versus" ) draft.teams = [0, 1].map(s => chosen(data.teams?.[s]));
    else if ( shown === "divine" ) draft.divine = this.#actors[data.actor]?.uuid ?? null;
    else draft.actors = chosen(data.actors);

    if ( data.mode in MODES ) draft.mode = data.mode;
    return draft;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    // The hint under the scoring explains the way chosen.
    if ( (event.target.name === "scoring") && (event.target.value in SCORING) ) {
      const hint = this.element.querySelector(".stt-request-scoring-hint");
      if ( hint ) hint.textContent = localize(SCORING[event.target.value].hint);
      return;
    }
    if ( event.target.name !== "mode" ) return;
    this.#readForm();
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // The fields differ between modes, so let the window fit them.
    if ( !options.isFirstRender ) this.setPosition({ height: "auto" });
  }

  /* -------------------------------------------- */

  /**
   * Tick every actor in a list, or untick them all if they already are.
   * @this {RollRequestConfig}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static #onSelectAll(_event, target) {
    const list = target.closest("fieldset").querySelector(".stt-request-actor-list");
    const boxes = [...list.querySelectorAll("input[type=checkbox]")];
    const checked = !boxes.every(b => b.checked);
    for ( const box of boxes ) box.checked = checked;
  }

  /* -------------------------------------------- */

  /**
   * Tick everyone in a quick pick, or untick them if they all are. On one side of a Team vs Team, ticking them takes
   * them off the other side, since no one can be on both.
   * @this {RollRequestConfig}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static #onPickGroup(_event, target) {
    const draft = this.#readForm();
    const pick = getQuickPicks().find(p => p.id === target.dataset.group);
    if ( !pick ) return;
    const side = target.dataset.side === undefined ? null : Number(target.dataset.side);
    const chosen = side === null ? draft.actors : draft.teams[side];
    const all = pick.uuids.every(uuid => chosen.includes(uuid));
    const next = all ? chosen.filter(uuid => !pick.uuids.includes(uuid))
      : [...chosen, ...pick.uuids.filter(uuid => !chosen.includes(uuid))];
    if ( side === null ) draft.actors = next;
    else {
      draft.teams[side] = next;
      if ( !all ) draft.teams[1 - side] = draft.teams[1 - side].filter(uuid => !pick.uuids.includes(uuid));
    }
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */

  /**
   * Offer another roll to choose from instead of a roll, starting as the first that isn't offered already.
   * @this {RollRequestConfig}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static #onAddChoice(_event, target) {
    const row = foundry.utils.getProperty(this.#readForm(), target.dataset.field);
    if ( !row || (row.alternatives.length >= MAX_CHOICES - 1) ) return;
    const offered = [row.roll, ...row.alternatives.map(a => a.roll)];
    const next = getRollGroups([]).flatMap(g => g.options).find(o => !offered.includes(o.value));
    if ( next ) row.alternatives.push({ roll: next.value });
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */

  /**
   * Stop offering one of a roll's alternatives.
   * @this {RollRequestConfig}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static #onRemoveChoice(_event, target) {
    const row = foundry.utils.getProperty(this.#readForm(), target.dataset.field);
    row?.alternatives.splice(Number(target.dataset.index), 1);
    this.render({ parts: ["form"] });
  }

  /* -------------------------------------------- */

  /**
   * Post the request to chat. A thrown error is shown as a notification and keeps the window open.
   * @this {RollRequestConfig}
   */
  static async #onSubmit() {
    const draft = this.#readForm();
    const mode = MODES[draft.mode];
    const split = roll => {
      const [type, key] = roll.split(".");
      return { type, key: key ?? null };
    };
    const toPart = ({ roll, dc, alternatives=[] }) => {
      const part = { ...split(roll), dc: mode.contest ? null : dc };
      // The same roll offered twice is no choice at all.
      const offered = new Set([roll]);
      const others = alternatives.filter(a => !offered.has(a.roll) && offered.add(a.roll));
      if ( mode.choices && others.length ) {
        part.alternatives = others.map(a => (mode.choiceDCs
          ? { ...split(a.roll), dc: a.dc === undefined ? dc : a.dc } : split(a.roll)));
      }
      return part;
    };
    const request = {
      mode: draft.mode,
      successes: Math.clamp(draft.successes, 1, CHALLENGE_PARTS),
      showDC: draft.showDC,
      rollMode: draft.rollMode
    };

    if ( mode.contest ) {
      const sides = draft.mode === "rolloff" ? draft.rivals.map(uuid => uuid ? [uuid] : []) : draft.teams;
      if ( sides.some(s => !s.length) ) {
        const side = localize(mode.sides[sides.findIndex(s => !s.length)]);
        throw new Error(localize("STT.Request.Config.ChooseSide", { side }));
      }
      if ( sides[0].some(uuid => sides[1].includes(uuid)) ) throw new Error(localize("STT.Request.Config.BothSides"));
      const parts = draft.sideRolls[draft.mode].map(roll => toPart({ roll, dc: null }));
      Object.assign(request, { parts, sides, actors: sides.flat() });
    } else {
      const actors = draft.mode === "divine" ? [draft.divine ?? draft.actors[0]].filter(Boolean) : draft.actors;
      if ( !actors.length ) throw new Error(localize("STT.Request.Config.ChooseActor"));
      const count = draft.mode === "challenge" ? CHALLENGE_PARTS : 1;
      const parts = draft.mode === "standard" ? [toPart(draft.standard)] : draft.parts.slice(0, count).map(toPart);
      if ( (draft.mode === "challenge") && parts.some(p => getChoices(p).some(c => c.dc === null)) ) {
        throw new Error(localize("STT.Request.Config.ChallengeDC"));
      }
      if ( draft.mode === "team" ) {
        if ( SCORING[draft.scoring].needsDC && (parts[0].dc === null) ) throw new Error(localize("STT.Request.Config.ScoringDC"));
        request.scoring = draft.scoring;
      }
      Object.assign(request, { parts, actors });
      if ( draft.mode === "divine" ) {
        Object.assign(request, { parts: [{ type: "d100", key: null, dc: null }], range: draft.range });
      }
    }

    RollRequestConfig.#last = foundry.utils.deepClone(draft);
    await createRequest(request);
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Actors the GM might ask to roll: any asked for by name, those of the selected tokens, the player characters, the
 * members of the party and other groups, the combatants, then the scene's other tokens. Past those asked for by name,
 * each group is in order of name, so the list doesn't change with the order the world happens to hold them in.
 * @param {string[]} [uuids]  Actors to offer first, such as the one who played a Divine Intervention card.
 * @returns {Actor5e[]}
 */
function getCandidates(uuids=[]) {
  const actors = new Map();
  const add = actor => actor && !actors.has(actor.uuid) && actors.set(actor.uuid, actor);
  const byName = list => list.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  for ( const uuid of uuids ) add(fromUuidSync(uuid));
  byName((canvas.tokens?.controlled ?? []).map(t => t.actor)).forEach(add);
  byName(game.actors.filter(a => (a.type === "character") && a.hasPlayerOwner)).forEach(add);
  // Then the members of the groups and the combatants, and the scene's other tokens last.
  const picks = getQuickPicks();
  const members = scene => byName(picks.filter(p => (p.id === "scene") === scene)
    .flatMap(p => p.uuids.map(uuid => fromUuidSync(uuid))));
  members(false).forEach(add);
  members(true).forEach(add);
  return [...actors.values()];
}

/* -------------------------------------------- */

/**
 * The groups the GM can tick in one click, each only if it has someone in it: dnd5e's primary party, the world's other
 * group actors, everyone in the current combat, its hostile combatants, the selected tokens, and everyone on the scene.
 * Combatants and scene tokens are their tokens' actors, so each unlinked token rolls for itself.
 * @returns {QuickPick[]}
 */
export function getQuickPicks() {
  const picks = [];
  const add = (id, label, icon, actors) => {
    const uuids = [...new Set(actors.filter(Boolean).map(a => a.uuid))];
    if ( uuids.length ) picks.push({ id, label, icon, uuids });
  };
  const members = group => group.system.members?.map(m => m.actor) ?? [];
  const party = game.actors.party;
  if ( party ) add("party", party.name, "fa-solid fa-users", members(party));
  for ( const group of game.actors.filter(a => (a.type === "group") && (a !== party)) ) {
    add(`group.${group.id}`, group.name, "fa-solid fa-people-group", members(group));
  }
  // The combat on the scene being viewed, or else the active one, as with the canvas turned off nothing is viewed.
  const combat = game.combat ?? game.combats.find(c => c.active);
  const combatants = combat?.combatants.contents ?? [];
  add("combat", localize("STT.Request.Config.Picks.Combat"), "fa-solid fa-swords", combatants.map(c => c.actor));
  add("hostile", localize("STT.Request.Config.Picks.Hostile"), "fa-solid fa-skull", combatants
    .filter(c => c.token?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE).map(c => c.actor));
  add("selected", localize("STT.Request.Config.Picks.Selected"), "fa-solid fa-object-group",
    canvas.tokens?.controlled.map(t => t.actor) ?? []);
  // The scene the GM is looking at, read from the documents so it works with the canvas turned off too.
  const scene = canvas.scene ?? game.scenes.viewed ?? game.scenes.active;
  add("scene", localize("STT.Request.Config.Picks.Scene"), "fa-solid fa-map", scene?.tokens.map(t => t.actor) ?? []);
  return picks;
}

/* -------------------------------------------- */

/**
 * The kind of request and who rolls that a preset asks for, filling in from the draft what it leaves out.
 * @param {RequestPreset} preset
 * @param {RequestDraft} draft
 * @returns {{ mode: string, actors?: string[], divine?: string }}  Who rolls, or for Divine Intervention, which
 *   asks one actor, the one who prays, leaving who rolls in the other modes as it was.
 */
function resolvePreset({ mode, actors, group }, draft) {
  const members = group ? getQuickPicks().find(p => p.id === group)?.uuids : null;
  const resolved = { mode: mode in MODES ? mode : draft.mode };
  const chosen = actors ?? members;
  if ( (resolved.mode === "divine") && chosen?.[0] ) resolved.divine = chosen[0];
  else resolved.actors = [...(chosen ?? draft.actors)];
  return resolved;
}

/* -------------------------------------------- */

/**
 * Every roll that can be requested, grouped for the roll picker.
 * @param {string[]} dice  Plain dice offered in this mode.
 * @returns {{ label: string, options: { value: string, label: string }[] }[]}
 */
function getRollGroups(dice) {
  const abilities = Object.keys(CONFIG.DND5E.abilities);
  const sorted = options => options.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  return [
    {
      label: localize("STT.Request.Config.Groups.Dice"),
      options: dice.map(die => ({ value: die, label: DICE[die].label }))
    },
    {
      label: localize("STT.Request.Config.Groups.Skills"),
      options: sorted(Object.entries(CONFIG.DND5E.skills).map(([key, s]) => ({ value: `skill.${key}`, label: s.label })))
    },
    {
      label: localize("STT.Request.Config.Groups.Checks"),
      options: abilities.map(key => ({ value: `check.${key}`, label: getPartLabel({ type: "check", key }) }))
    },
    {
      label: localize("STT.Request.Config.Groups.Saves"),
      options: abilities.map(key => ({ value: `save.${key}`, label: getPartLabel({ type: "save", key }) }))
    },
    {
      label: localize("STT.Request.Config.Groups.Tools"),
      options: sorted(Object.keys(CONFIG.DND5E.tools).map(key => ({
        value: `tool.${key}`,
        label: dnd5e.documents.Trait.keyLabel(key, { trait: "tool" }) ?? key
      })))
    }
  ];
}
