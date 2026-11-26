// Sequent calculus: sequents, calculi whose rules are data, a checker for
// derivations, and proof search that returns either a derivation the checker
// accepts or a countermodel. The classical calculus is G3cp, with any number
// of formulas on the right; the intuitionistic one has exactly one.

import { formula, formulas, parse, refuse, FALSE, compareNames } from "./formula.js";
import { ruleKey } from "./fitch.js";

// ---- sequents ----------------------------------------------------------------------------------

const unique = (fs) => [...new Map(fs.map((f) => [f.key, f])).values()];

/** A sequent Γ ⊢ Δ: two lists of formulas, read as sets. */
export class Sequent {
  constructor(left, right) {
    this.left = unique(formulas(left));
    this.right = unique(formulas(right));
    this.key = [...this.left.map((f) => f.key)].sort().join(",") + "⊢" + [...this.right.map((f) => f.key)].sort().join(",");
    Object.freeze(this);
  }
  toString(options) {
    const l = this.left.map((f) => f.toString(options)).join(", ");
    const r = this.right.map((f) => f.toString(options)).join(", ");
    return `${l}${l ? " " : ""}${options?.style === "ascii" ? "|-" : "⊢"}${r ? " " : ""}${r}`;
  }
}
/** A sequent from text such as "p -> q, p |- q" (⊢ or |- between the sides), or from two lists. */
export function sequent(left, right) {
  if (left instanceof Sequent) return left;
  if (right === undefined && typeof left === "string") {
    const parts = left.split(/⊢|\|-|\\vdash/);
    if (parts.length !== 2) refuse("syntax", `a sequent is written "premises ⊢ conclusions" (or with |-): ${left}`);
    return new Sequent(parts[0], parts[1]);
  }
  return new Sequent(left, right ?? []);
}

// ---- calculi as data ---------------------------------------------------------------------------

/**
 * A rule acts on one formula of the conclusion (the principal formula): the
 * one of the given kind on the given side. Each premise is the conclusion
 * without that formula, with the listed formulas added on the left and right;
 * A and B are the principal formula's parts. `only` means the right side is
 * replaced by what is listed, and `keep` that the principal formula stays.
 */
const R = (side, kind, ...premises) => ({ side, kind, premises });
const classicalRules = {
  "¬L": R("L", "not", { right: ["A"] }),
  "¬R": R("R", "not", { left: ["A"] }),
  "∧L": R("L", "and", { left: ["A", "B"] }),
  "∧R": R("R", "and", { right: ["A"] }, { right: ["B"] }),
  "∨L": R("L", "or", { left: ["A"] }, { left: ["B"] }),
  "∨R": R("R", "or", { right: ["A", "B"] }),
  "→L": R("L", "imp", { right: ["A"] }, { left: ["B"] }),
  "→R": R("R", "imp", { left: ["A"], right: ["B"] }),
  "↔L": R("L", "iff", { left: ["A", "B"] }, { right: ["A", "B"] }),
  "↔R": R("R", "iff", { left: ["A"], right: ["B"] }, { left: ["B"], right: ["A"] }),
  "⊕L": R("L", "xor", { left: ["A"], right: ["B"] }, { left: ["B"], right: ["A"] }),
  "⊕R": R("R", "xor", { left: ["A", "B"] }, { right: ["A", "B"] }),
};
const intuitionisticRules = {
  "¬L": R("L", "not", { right: ["A"], only: true, keep: true }),
  "¬R": R("R", "not", { left: ["A"], right: ["⊥"] }),
  "∧L": R("L", "and", { left: ["A", "B"] }),
  "∧R": R("R", "and", { right: ["A"] }, { right: ["B"] }),
  "∨L": R("L", "or", { left: ["A"] }, { left: ["B"] }),
  "∨R1": R("R", "or", { right: ["A"] }),
  "∨R2": R("R", "or", { right: ["B"] }),
  "→L": R("L", "imp", { right: ["A"], only: true, keep: true }, { left: ["B"] }),
  "→R": R("R", "imp", { left: ["A"], right: ["B"] }),
  "↔L": R("L", "iff", { left: ["A → B", "B → A"] }),
  "↔R": R("R", "iff", { left: ["A"], right: ["B"] }, { left: ["B"], right: ["A"] }),
  "⊕L": R("L", "xor", { left: ["A ∨ B", "¬(A ∧ B)"] }),
  "⊕R": R("R", "xor", { right: ["A ∨ B"] }, { right: ["¬(A ∧ B)"] }),
};
const AXIOMS = {
  Ax: "the same formula on both sides",
  "⊥L": "⊥ on the left",
  "⊤R": "⊤ on the right",
};
const makeCalculus = (name, logic, ruleTable, maxRight) => {
  const byKey = new Map();
  for (const n of [...Object.keys(ruleTable), ...Object.keys(AXIOMS)]) byKey.set(ruleKey(n), n);
  byKey.set("axiom", "Ax").set("id", "Ax").set("init", "Ax");
  return Object.freeze({ name, logic, rules: Object.freeze(ruleTable), axioms: AXIOMS, maxRight, find: (text) => byKey.get(ruleKey(text)) ?? null });
};
/**
 * The calculi that come with the package. A calculus of your own is
 * calculus(name, rules, { maxRight }) with rules in the same shape.
 */
export const calculi = Object.freeze({
  classical: makeCalculus("classical sequent calculus (G3cp)", "classical", classicalRules, Infinity),
  intuitionistic: makeCalculus("intuitionistic sequent calculus (G3ip)", "intuitionistic", intuitionisticRules, 1),
});
export const calculus = (name, ruleTable, { maxRight = Infinity, logic } = {}) => makeCalculus(name, logic, ruleTable, maxRight);

const schemaCache = new Map();
const schema = (text) => {
  let s = schemaCache.get(text);
  if (!s) schemaCache.set(text, (s = parse(text)));
  return s;
};
const fill = (text, principal) => {
  const [A, B] = principal.parts;
  return schema(text).substitute(B ? { A, B } : { A });
};
/** The premises a rule asks for, given the conclusion and the principal formula. With keep, both readings. */
function expected(rule, concl, principal, keepAll) {
  const side = rule.side === "L" ? "left" : "right";
  return rule.premises.map((p) => {
    const keep = p.keep || keepAll;
    let left = concl.left.filter((f) => side !== "left" || keep || f.key !== principal.key);
    let right = p.only ? [] : concl.right.filter((f) => side !== "right" || keep || f.key !== principal.key);
    left = [...left, ...(p.left ?? []).map((t) => fill(t, principal))];
    right = [...right, ...(p.right ?? []).map((t) => fill(t, principal))];
    return new Sequent(left, right);
  });
}

// ---- derivations -------------------------------------------------------------------------------

/**
 * A derivation: a sequent, the rule that concludes it, the principal formula
 * (optional: the checker finds it), and the derivations of its premises.
 */
export class Derivation {
  constructor(seq, rule, premises = [], principal = null) {
    this.sequent = sequent(seq);
    this.rule = rule;
    this.premises = premises;
    this.principal = principal ? formula(principal) : null;
  }
  /** The derivation as numbered lines, premises before the lines that use them. */
  lines() {
    const out = [];
    const seen = new Map();
    const walk = (d) => {
      if (seen.has(d)) return seen.get(d);
      const cites = d.premises.map(walk);
      out.push({ n: out.length + 1, sequent: d.sequent, rule: d.rule, cites, principal: d.principal });
      seen.set(d, out.length);
      return out.length;
    };
    walk(this);
    return out;
  }
  get size() {
    return this.lines().length;
  }
  check(options) {
    return checkDerivation(this, options);
  }
  toString(options) {
    const ls = this.lines();
    const texts = ls.map((l) => l.sequent.toString(options));
    const width = Math.max(...texts.map((t) => [...t].length));
    const digits = String(ls.length).length;
    return ls.map((l, i) => `${String(l.n).padStart(digits)}. ${texts[i]}${" ".repeat(width - [...texts[i]].length)}   ${l.rule}${l.cites.length ? " " + l.cites.join(", ") : ""}`).join("\n");
  }
}

/**
 * Read a derivation from numbered lines, the last line being the sequent
 * derived:
 *
 *   1. p |- p, q        Ax
 *   2. q |- p, q        Ax
 *   3. p | q |- p, q    |L 1, 2
 */
export function parseDerivation(text, { calculus: calc = calculi.classical } = {}) {
  const nodes = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/(#|\/\/).*$/, "").trim();
    if (!line) continue;
    const n = nodes.length + 1;
    const num = /^\(?(\d+)[.):]\s*/.exec(line);
    if (num && Number(num[1]) !== n) refuse("syntax", `line ${n} of the derivation is numbered ${num[1]}; number the lines 1, 2, 3, … or not at all`);
    const rest = num ? line.slice(num[0].length) : line;
    let found = null;
    const cuts = [];
    for (let i = rest.length - 1; i > 0; i--) if (/\s/.test(rest[i]) && !/\s/.test(rest[i - 1])) cuts.push(i);
    for (const i of cuts) {
      const why = rest.slice(i);
      const [name, ...rest2] = why.trim().split(/[\s,;]+/);
      if (!name || /^\d+$/.test(name) || rest2.some((x) => !/^\d+$/.test(x))) continue;
      const cites = rest2.map(Number);
      const head = rest.slice(0, i);
      if (!/⊢|\|-/.test(head) || /⊢|\|-/.test(why)) continue;
      found = { seq: sequent(head), rule: calc.find(name) ?? name, cites };
      break;
    }
    if (!found) refuse("syntax", `line ${n} of the derivation: write a sequent, then the rule and the lines it uses ("${rest}")`);
    const bad = found.cites.find((c) => c < 1 || c >= n);
    if (bad !== undefined) refuse("syntax", `line ${n} of the derivation cites line ${bad}, which is not an earlier line`);
    nodes.push(new Derivation(found.seq, found.rule, found.cites.map((c) => nodes[c - 1])));
  }
  if (!nodes.length) refuse("syntax", "the derivation has no lines");
  return nodes[nodes.length - 1];
}

const sameSet = (a, b) => a.key === b.key;

/**
 * Check a derivation against a calculus (default calculi.classical).
 *
 *   { ok, errors: [{ line, rule, message }], proves }
 *
 * Each error names the line (as numbered by derivation.lines()), the rule
 * and the premises the rule needed there.
 */
export function checkDerivation(input, { calculus: calc = calculi.classical } = {}) {
  const d = typeof input === "string" ? parseDerivation(input, { calculus: calc }) : input;
  const errors = [];
  const ls = d.lines();
  for (const l of ls) {
    const bad = (message) => errors.push({ line: l.n, rule: l.rule, message: `line ${l.n}: ${message}` });
    const s = l.sequent;
    if (s.right.length > calc.maxRight) {
      bad(`${s} has ${s.right.length} formulas on the right; ${calc.name} allows ${calc.maxRight}`);
      continue;
    }
    const name = calc.find(l.rule);
    const given = l.cites.map((c) => ls[c - 1].sequent);
    if (!name) {
      bad(`"${l.rule}" is not a rule of ${calc.name}`);
      continue;
    }
    if (name in calc.axioms) {
      if (given.length) bad(`${name} has no premises`);
      else if (name === "Ax" && !s.left.some((f) => s.right.some((g) => g.key === f.key))) bad(`Ax needs the same formula on both sides of ${s}`);
      else if (name === "⊥L" && !s.left.some((f) => f === FALSE || f.kind === "bot")) bad(`⊥L needs ⊥ on the left of ${s}`);
      else if (name === "⊤R" && !s.right.some((f) => f.kind === "top")) bad(`⊤R needs ⊤ on the right of ${s}`);
      continue;
    }
    const rule = calc.rules[name];
    const side = rule.side === "L" ? s.left : s.right;
    const candidates = (l.principal ? [l.principal] : side).filter((f) => f.kind === rule.kind && side.some((g) => g.key === f.key));
    if (!candidates.length) {
      bad(`${name} works on a formula of the form ${kindShape(rule.kind)} on the ${rule.side === "L" ? "left" : "right"}, and ${s} has none`);
      continue;
    }
    if (given.length !== rule.premises.length) {
      bad(`${name} takes ${rule.premises.length} premise${rule.premises.length === 1 ? "" : "s"}; ${given.length} cited`);
      continue;
    }
    const fits = candidates.some((principal) =>
      [false, true].some((keepAll) => {
        const want = expected(rule, s, principal, keepAll);
        return want.every((w, i) => sameSet(w, given[i])) || (want.length === 2 && sameSet(want[0], given[1]) && sameSet(want[1], given[0]));
      }),
    );
    if (!fits) {
      const want = expected(rule, s, candidates[0], false);
      bad(`${name} on "${candidates[0]}" needs ${want.map((w) => `"${w}"`).join(" and ")}; the cited line${given.length === 1 ? " is" : "s are"} ${given.map((g) => `"${g}"`).join(" and ")}`);
    }
  }
  return { ok: errors.length === 0, errors, proves: errors.length === 0 ? d.sequent.toString() : null, lines: ls.length, calculus: calc.name };
}
const kindShape = (kind) => ({ not: "¬A", and: "A ∧ B", or: "A ∨ B", imp: "A → B", iff: "A ↔ B", xor: "A ⊕ B" })[kind];

// ---- proof search ------------------------------------------------------------------------------

const BUDGET = Symbol("budget");

/** Classical search in G3cp: every rule is invertible, so there is nothing to undo. */
function searchClassical(start, state) {
  const go = (s) => {
    if (++state.nodes > state.budget) throw BUDGET;
    if (s.left.some((f) => s.right.some((g) => g.key === f.key))) return new Derivation(s, "Ax");
    if (s.left.some((f) => f.kind === "bot")) return new Derivation(s, "⊥L");
    if (s.right.some((f) => f.kind === "top")) return new Derivation(s, "⊤R");
    // one-premise rules first, to keep the tree narrow
    const pick = (wide) => {
      for (const [side, list] of [["L", s.left], ["R", s.right]]) {
        for (const f of list) {
          if (f.kind === "atom" || f.kind === "top" || f.kind === "bot") continue;
          const name = Object.keys(classicalRules).find((n) => classicalRules[n].side === side && classicalRules[n].kind === f.kind);
          if ((classicalRules[name].premises.length > 1) === wide) return [name, f];
        }
      }
      return null;
    };
    const choice = pick(false) ?? pick(true);
    if (!choice) {
      // only atoms (and ⊤ on the left, ⊥ on the right) remain, with none shared: a countermodel
      state.countermodel = { trueAtoms: s.left.filter((f) => f.kind === "atom").map((f) => f.name) };
      return null;
    }
    const [name, f] = choice;
    const premises = [];
    for (const p of expected(classicalRules[name], s, f, false)) {
      const d = go(p);
      if (!d) return null;
      premises.push(d);
    }
    return new Derivation(s, name, premises, f);
  };
  return go(start);
}

/**
 * Intuitionistic search. The left side only grows, so a branch that meets a
 * sequent it has already seen is going in a circle and is cut off; with that
 * the search always ends. Steps that can lose something (choosing a side of
 * ∨ on the right, using a conditional or a negation on the left) are rationed:
 * the search first allows none on a branch, then one, then two, so the first
 * derivation found is a direct one. Returns a derivation in the calculus
 * above (with the principal formulas of left rules kept in their premises),
 * or null when there is none.
 */
export function searchIntuitionistic(leftList, goal, state) {
  const BOT = FALSE;
  const seen = new Set();
  let cuts = 0;
  const seq = (G, C) => new Sequent([...G.values()], [C]);
  const add = (G, ...fs) => {
    const H = new Map(G);
    for (const f of fs) H.set(f.key, f);
    return H;
  };
  const go = (G, C, ration) => {
    if (++state.nodes > state.budget) throw BUDGET;
    const here = () => seq(G, C);
    if (G.has(C.key)) return new Derivation(here(), "Ax");
    if (G.has(BOT.key)) return new Derivation(here(), "⊥L");
    if (C.kind === "top") return new Derivation(here(), "⊤R");
    const context = [...G.keys()].sort().join(",");
    const key = context + "⊢" + C.key;
    if (seen.has(key)) return null;
    seen.add(key);
    try {
      // rules on the right that lose nothing. (¬A with A already on the left is left alone:
      // it can only follow from a contradiction on the left, which the left rules find.)
      if (C.kind === "imp" || (C.kind === "not" && !G.has(C.arg.key))) {
        const p = go(add(G, C.parts[0]), C.kind === "imp" ? C.right : BOT, ration);
        return p && new Derivation(here(), C.kind === "imp" ? "→R" : "¬R", [p], C);
      }
      if (C.kind === "and" || C.kind === "iff" || C.kind === "xor") {
        const [a, b] =
          C.kind === "and" ? [[G, C.left], [G, C.right]]
          : C.kind === "iff" ? [[add(G, C.left), C.right], [add(G, C.right), C.left]]
          : [[G, fill("A ∨ B", C)], [G, fill("¬(A ∧ B)", C)]];
        const p1 = go(...a, ration);
        const p2 = p1 && go(...b, ration);
        return p2 && new Derivation(here(), { and: "∧R", iff: "↔R", xor: "⊕R" }[C.kind], [p1, p2], C);
      }
      // rules on the left that lose nothing: first a conditional whose left side is in hand
      for (const f of G.values()) {
        if (f.kind === "imp" && G.has(f.left.key) && !G.has(f.right.key)) {
          const p = go(add(G, f.right), C, ration);
          return p && new Derivation(here(), "→L", [new Derivation(seq(G, f.left), "Ax"), p], f);
        }
      }
      for (const f of G.values()) {
        const one = (name, ...news) => {
          if (news.every((x) => G.has(x.key))) return undefined;
          const p = go(add(G, ...news), C, ration);
          return p && new Derivation(here(), name, [p], f);
        };
        let r;
        if (f.kind === "and") r = one("∧L", f.left, f.right);
        else if (f.kind === "iff") r = one("↔L", fill("A → B", f), fill("B → A", f));
        else if (f.kind === "xor") r = one("⊕L", fill("A ∨ B", f), fill("¬(A ∧ B)", f));
        if (r !== undefined) return r;
      }
      for (const f of G.values()) {
        if (f.kind === "not" && G.has(f.arg.key)) return new Derivation(here(), "¬L", [new Derivation(seq(G, f.arg), "Ax")], f);
      }
      for (const f of G.values()) {
        if (f.kind === "or" && !G.has(f.left.key) && !G.has(f.right.key)) {
          const p1 = go(add(G, f.left), C, ration);
          const p2 = p1 && go(add(G, f.right), C, ration);
          return p2 && new Derivation(here(), "∨L", [p1, p2], f);
        }
      }
      // the steps that can lose something: each is tried, within the ration
      // (¬L toward a goal other than ⊥ is a detour when ⊥ is already being sought from these same formulas)
      const conditionals = [...G.values()].filter((f) => f.kind === "imp" && !G.has(f.right.key));
      const negations = C.kind !== "bot" && seen.has(context + "⊢" + BOT.key) ? [] : [...G.values()].filter((f) => f.kind === "not");
      if (C.kind !== "or" && !conditionals.length && !negations.length) return null;
      if (ration === 0) {
        cuts++;
        return null;
      }
      if (C.kind === "or") {
        const p1 = go(G, C.left, ration - 1);
        if (p1) return new Derivation(here(), "∨R1", [p1], C);
        const p2 = go(G, C.right, ration - 1);
        if (p2) return new Derivation(here(), "∨R2", [p2], C);
      }
      for (const f of negations) {
        const p = go(G, f.arg, ration - 1);
        if (p) return new Derivation(here(), "¬L", [p], f);
      }
      for (const f of conditionals) {
        const p1 = go(G, f.left, ration - 1);
        if (!p1) continue;
        const before = cuts;
        const p2 = go(add(G, f.right), C, ration - 1);
        if (p2) return new Derivation(here(), "→L", [p1, p2], f);
        // with the right side of the conditional in hand the goal must follow, or it never will
        if (cuts === before) return null;
      }
      return null;
    } finally {
      seen.delete(key);
    }
  };
  const start = new Map(leftList.map((f) => [f.key, f]));
  for (let ration = 0; ration <= 64; ration++) {
    cuts = 0;
    const d = go(start, goal, ration);
    if (d || cuts === 0) return d;
  }
  throw BUDGET;
}

// ---- Kripke models, for what intuitionistic logic does not prove ---------------------------

/**
 * Does the world force the formula? A model is { parent: [-1, 0, 0, …] }
 * (a tree of worlds, world 0 the root) with { holds: [[atoms true at world 0], …] }
 * where an atom true at a world stays true at every later world.
 */
export function forces(model, world, input) {
  const f = formula(input);
  const n = model.parent.length;
  const later = (w) => {
    const out = [w];
    for (let v = w + 1; v < n; v++) if (out.includes(model.parent[v])) out.push(v);
    return out;
  };
  const go = (w, g) => {
    switch (g.kind) {
      case "atom": return model.holds[w].includes(g.name);
      case "top": return true;
      case "bot": return false;
      case "and": return go(w, g.left) && go(w, g.right);
      case "or": return go(w, g.left) || go(w, g.right);
      case "imp": return later(w).every((v) => !go(v, g.left) || go(v, g.right));
      case "not": return later(w).every((v) => !go(v, g.arg));
      case "iff": return later(w).every((v) => go(v, g.left) === go(v, g.right));
      default: return (go(w, g.left) || go(w, g.right)) && later(w).every((v) => !(go(v, g.left) && go(v, g.right)));
    }
  };
  return go(world, f);
}
const TREES = [[-1], [-1, 0], [-1, 0, 1], [-1, 0, 0], [-1, 0, 1, 2], [-1, 0, 0, 1], [-1, 0, 1, 1], [-1, 0, 0, 0]];
/** A Kripke model with at most four worlds whose root forces all of `left` and not `goal`, or null. */
function kripkeCountermodel(left, goal, limit = 400000) {
  const names = [...new Set([...left, goal].flatMap((f) => f.atoms()))].sort(compareNames);
  let tried = 0;
  for (const parent of TREES) {
    const n = parent.length;
    // the sets of worlds an atom may be true on: closed under going later
    const upsets = [];
    for (let m = 0; m < 1 << n; m++) {
      let ok = true;
      for (let w = 1; w < n; w++) if ((m >> parent[w]) & 1 && !((m >> w) & 1)) ok = false;
      if (ok) upsets.push(m);
    }
    const choice = names.map(() => 0);
    for (;;) {
      if (++tried > limit) return null;
      const model = { parent, holds: Array.from({ length: n }, (_, w) => names.filter((_, i) => (upsets[choice[i]] >> w) & 1)) };
      if (left.every((f) => forces(model, 0, f)) && !forces(model, 0, goal)) {
        return {
          ...model,
          worlds: n,
          toString() {
            return model.holds.map((h, w) => `world ${w}${parent[w] >= 0 ? ` (after world ${parent[w]})` : ""}: ${h.length ? h.join(", ") + " true" : "nothing true yet"}`).join("\n");
          },
        };
      }
      let i = 0;
      while (i < names.length && ++choice[i] === upsets.length) choice[i++] = 0;
      if (i === names.length) break;
    }
  }
  return null;
}

/**
 * Search for a derivation of a sequent.
 *
 *   proveSequent("p -> q, p |- q")
 *   proveSequent("|- p | ~p", { logic: "intuitionistic" })
 *
 *   { status: "proved", derivation }       the checker accepts it
 *   { status: "invalid", countermodel }    a valuation making the left true and the right false
 *   { status: "unprovable", kripke }       intuitionistic only: classically valid, but a Kripke
 *                                          model (checked) shows there is no proof
 *   { status: "unresolved", reason }
 */
export function proveSequent(input, { logic = "classical", budget = 2000000 } = {}) {
  const s = sequent(input);
  const state = { nodes: 0, budget, countermodel: null };
  const unresolved = (reason) => ({ status: "unresolved", budget, reason });
  let classical;
  try {
    classical = searchClassical(s, state);
  } catch (e) {
    if (e === BUDGET) return unresolved(`the search used its budget of ${budget} steps without an answer`);
    throw e;
  }
  if (!classical) {
    const atoms = [...new Set([...s.left, ...s.right].flatMap((f) => f.atoms()))].sort(compareNames);
    const model = Object.fromEntries(atoms.map((a) => [a, state.countermodel.trueAtoms.includes(a)]));
    /* c8 ignore next */
    if (!s.left.every((f) => f.evaluate(model)) || s.right.some((f) => f.evaluate(model))) throw new Error("internal error: the countermodel does not check");
    return { status: "invalid", countermodel: model };
  }
  if (logic === "classical") return finish(classical, calculi.classical);
  if (logic !== "intuitionistic") refuse("bad-argument", `logic is "classical" or "intuitionistic", not ${logic}`);
  if (s.right.length > 1) refuse("bad-argument", "an intuitionistic sequent has one formula on the right");
  const goal = s.right[0] ?? FALSE;
  let d;
  try {
    state.nodes = 0;
    d = searchIntuitionistic(s.left, goal, state);
  } catch (e) {
    if (e === BUDGET) return unresolved(`the intuitionistic search used its budget of ${budget} steps without an answer`);
    throw e;
  }
  if (d) return finish(d, calculi.intuitionistic);
  const kripke = kripkeCountermodel(s.left, goal);
  if (!kripke) return unresolved("the search shows there is no intuitionistic proof, but no Kripke model with at most four worlds was found to certify that");
  return { status: "unprovable", logic, classicallyValid: true, kripke };
}
function finish(derivation, calc) {
  const checked = checkDerivation(derivation, { calculus: calc });
  /* c8 ignore next */
  if (!checked.ok) throw new Error("internal error: the derivation found does not check: " + checked.errors[0].message);
  return { status: "proved", derivation, logic: calc.logic };
}

export { kripkeCountermodel, BUDGET };
