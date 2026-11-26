// Proof search for natural deduction, and hints. A found proof is an ordinary
// Fitch proof that the checker accepts; a hint is the next line of such a
// proof, continuing from the lines already written.

import { Formula, formula, formulas, refuse, FALSE } from "./formula.js";
import { Proof, checkProof, parseProof, proofState, rules, special } from "./fitch.js";
import { searchIntuitionistic, kripkeCountermodel, BUDGET } from "./sequent.js";
import { entails } from "./sat.js";

const NO_PROOF = Symbol("no proof");
const N = (f) => new Formula("not", f);
const B2 = (kind, a, b) => new Formula(kind, a, b);

/** The lines written so far, and how to add one. */
class Builder {
  constructor(lines = []) {
    this.lines = lines.map((l) => ({ ...l }));
    this.next = lines.reduce((m, l) => Math.max(m, l.n), 0) + 1;
  }
  get last() {
    return this.lines.length ? this.lines[this.lines.length - 1].n : 0;
  }
  add(depth, f, rule, cites) {
    this.lines.push({ n: this.next, depth, formula: f, rule, cites });
    return this.next++;
  }
}
/** What is in reach at one place in the proof: lines by formula, and finished subproofs. */
const newScope = (outer) => ({ lines: new Map(outer?.lines), subs: new Map(outer?.subs), halves: new Map(outer?.halves) });
const lineOf = (scope, f) => scope.lines.get(f.key)?.n;
const formulasOf = (scope) => [...scope.lines.values()].map((e) => e.formula);

function put(b, scope, depth, f, rule, cites) {
  const had = lineOf(scope, f);
  if (had !== undefined) return had;
  const n = b.add(depth, f, rule, cites);
  scope.lines.set(f.key, { n, formula: f });
  return n;
}
/** A subproof that assumes one formula and ends with another; `body` writes it and returns the line reached. */
function subproof(b, scope, depth, assume, reach, body) {
  const key = assume.key + "⊢" + reach.key;
  const had = scope.subs.get(key);
  if (had) return had;
  const inner = newScope(scope);
  const first = b.add(depth + 1, assume, "assumption", []);
  inner.lines.set(assume.key, { n: first, formula: assume });
  let n = body(inner);
  if (n !== b.last) n = b.add(depth + 1, reach, "R", [n]);
  const range = [first, n];
  scope.subs.set(key, range);
  return range;
}

/** Write out an intuitionistic sequent derivation as Fitch lines; returns the line of its goal. */
function emit(d, b, scope, depth) {
  const C = d.sequent.right[0];
  const have = lineOf(scope, C);
  if (have !== undefined) return have;
  const P = d.principal;
  const [p0, p1] = d.premises;
  // a conditional that is one half of a biconditional in reach is written out only if it is needed as a line
  const at = (f) => {
    const n = lineOf(scope, f);
    const iffLine = scope.halves.get(f.key);
    if (n !== undefined || iffLine === undefined) return n;
    const r = subproof(b, scope, depth, f.left, f.right, (inner) => put(b, inner, depth + 1, f.right, "↔E", [iffLine, lineOf(inner, f.left)]));
    return put(b, scope, depth, f, "→I", [r]);
  };
  const go = (x, sc = scope, dp = depth) => emit(x, b, sc, dp);
  const sub = (assume, reach, x) => subproof(b, scope, depth, assume, reach, (inner) => go(x, inner, depth + 1));
  const say = (f, rule, cites) => put(b, scope, depth, f, rule, cites);
  switch (d.rule) {
    case "Ax": return at(C);
    case "⊥L": return say(C, "⊥E", [at(FALSE)]);
    case "⊤R": return say(C, "⊤I", []);
    case "→R": return say(C, "→I", [sub(C.left, C.right, p0)]);
    case "¬R": return say(C, "¬I", [sub(C.arg, FALSE, p0)]);
    case "∧R": {
      const a = go(p0);
      return say(C, "∧I", [a, go(p1)]);
    }
    case "∨R1": case "∨R2": return say(C, "∨I", [go(p0)]);
    case "↔R": {
      const r1 = sub(C.left, C.right, p0);
      return say(C, "↔I", [r1, sub(C.right, C.left, p1)]);
    }
    case "⊕R": {
      const a = go(p0);
      return say(C, "⊕I", [a, go(p1)]);
    }
    case "∧L":
      say(P.left, "∧E", [at(P)]);
      say(P.right, "∧E", [at(P)]);
      return go(p0);
    case "↔L":
      for (const [x, y] of [[P.left, P.right], [P.right, P.left]]) {
        const cond = B2("imp", x, y);
        if (lineOf(scope, cond) === undefined) scope.halves.set(cond.key, at(P));
      }
      return go(p0);
    case "⊕L":
      say(B2("or", P.left, P.right), "⊕E", [at(P)]);
      say(N(B2("and", P.left, P.right)), "⊕E", [at(P)]);
      return go(p0);
    case "→L": {
      const a = go(p0);
      const iffLine = scope.halves.get(P.key);
      if (iffLine !== undefined) say(P.right, "↔E", [iffLine, a]);
      else say(P.right, "→E", [at(P), a]);
      return go(p1);
    }
    case "¬L": {
      const a = go(p0);
      const bot = say(FALSE, "¬E", [a, at(P)]);
      return C.kind === "bot" ? bot : say(C, "⊥E", [bot]);
    }
    case "∨L": {
      const r1 = sub(P.left, C, p0);
      return say(C, "∨E", [at(P), r1, sub(P.right, C, p1)]);
    }
    /* c8 ignore next 2 */
    default:
      throw new Error(`internal error: no translation for ${d.rule}`);
  }
}

/** Write a proof of the goal from what is in reach; returns its line. Throws NO_PROOF or BUDGET. */
function derive(goal, b, scope, depth, state, classical) {
  const have = lineOf(scope, goal);
  if (have !== undefined) return have;
  const say = (f, rule, cites) => put(b, scope, depth, f, rule, cites);
  const sub = (assume, reach) => subproof(b, scope, depth, assume, reach, (inner) => derive(reach, b, inner, depth + 1, state, classical));
  if (classical) {
    // take the goal apart first: these steps lose nothing
    switch (goal.kind) {
      case "imp": return say(goal, "→I", [sub(goal.left, goal.right)]);
      case "not": return say(goal, "¬I", [sub(goal.arg, FALSE)]);
      case "and": {
        const a = derive(goal.left, b, scope, depth, state, classical);
        return say(goal, "∧I", [a, derive(goal.right, b, scope, depth, state, classical)]);
      }
      case "iff": {
        const r1 = sub(goal.left, goal.right);
        return say(goal, "↔I", [r1, sub(goal.right, goal.left)]);
      }
      case "top": return say(goal, "⊤I", []);
      default:
    }
  }
  const direct = searchIntuitionistic(formulasOf(scope), goal, state);
  if (direct) return emit(direct, b, scope, depth);
  if (!classical || goal.kind === "bot") throw NO_PROOF;
  // indirectly: suppose the goal fails and reach ⊥. By Glivenko's theorem this works whenever the goal follows classically.
  const range = subproof(b, scope, depth, N(goal), FALSE, (inner) => {
    const d = searchIntuitionistic(formulasOf(inner), FALSE, state);
    if (!d) throw NO_PROOF;
    return emit(d, b, inner, depth + 1);
  });
  return say(goal, "IP", [range]);
}

/** Drop the lines from `from` on that the line `target` does not depend on, and renumber. */
function prune(lines, from, target, keepPremises) {
  const byN = new Map(lines.map((l) => [l.n, l]));
  const need = new Set();
  const mark = (n) => {
    if (need.has(n)) return;
    need.add(n);
    for (const c of byN.get(n).cites) (Array.isArray(c) ? c : [c]).forEach(mark);
  };
  mark(target);
  let kept = lines.filter((l, i) => i < from || need.has(l.n) || (keepPremises && special(l.rule) === "premise"));
  // a repeat of the line just before it says nothing: drop it and point its users at the original
  const same = new Map();
  kept = kept.filter((l, i) => {
    const prev = kept[i - 1];
    if (i >= from && l.rule === "R" && prev && prev.depth === l.depth && (same.get(l.cites[0]) ?? l.cites[0]) === (same.get(prev.n) ?? prev.n)) {
      same.set(l.n, same.get(prev.n) ?? prev.n);
      return false;
    }
    return true;
  });
  const point = (x) => same.get(x) ?? x;
  kept = kept.map((l) => ({ ...l, cites: l.cites.map((c) => (Array.isArray(c) ? c.map(point) : point(c))) }));
  const renumber = new Map(kept.map((l, i) => [l.n, i < from ? l.n : (kept[from - 1]?.n ?? 0) + (i - from) + 1]));
  return kept.map((l) => ({
    ...l,
    n: renumber.get(l.n),
    cites: l.cites.map((c) => (Array.isArray(c) ? c.map((x) => renumber.get(x)) : renumber.get(c))),
  }));
}

const logicOf = (set) => (set.logic === "intuitionistic" || !set.find("IP") ? "intuitionistic" : "classical");

/**
 * Find a natural deduction proof.
 *
 *   prove("p -> q, q -> r", "p -> r")
 *   prove([], "p | ~p", { logic: "intuitionistic" })
 *
 *   { status: "proved", proof }           a Proof the checker accepts
 *   { status: "invalid", countermodel }   a valuation: premises true, conclusion false
 *   { status: "unprovable", kripke }      intuitionistic only: no proof, with a Kripke model
 *   { status: "unresolved", reason }
 *
 * Classical proofs use the introduction and elimination rules and, where
 * they must, IP (indirect proof); intuitionistic ones never use IP.
 */
export function prove(premises, conclusion, { logic = "classical", budget = 2000000 } = {}) {
  if (logic !== "classical" && logic !== "intuitionistic") refuse("bad-argument", `logic is "classical" or "intuitionistic", not ${logic}`);
  const ps = formulas(premises);
  const goal = formula(conclusion);
  const truth = entails(ps, goal, { budget });
  if (truth.status === "invalid") return { status: "invalid", countermodel: truth.countermodel };
  if (truth.status === "unresolved") return truth;
  const b = new Builder();
  const scope = newScope();
  for (const p of ps) put(b, scope, 0, p, "premise", []);
  const state = { nodes: 0, budget };
  let target;
  try {
    target = derive(goal, b, scope, 0, state, logic === "classical");
  } catch (e) {
    if (e === BUDGET) return { status: "unresolved", budget, reason: `the proof search used its budget of ${budget} steps without an answer` };
    if (e !== NO_PROOF) throw e;
    if (logic === "intuitionistic") {
      const kripke = kripkeCountermodel(ps, goal);
      if (kripke) return { status: "unprovable", logic, classicallyValid: true, kripke };
      return { status: "unresolved", reason: "the search shows there is no intuitionistic proof, but no Kripke model with at most four worlds was found to certify that" };
    }
    /* c8 ignore next */
    return { status: "unresolved", reason: "the argument is valid, but the proof search did not find a proof" };
  }
  let lines = b.lines;
  if (target !== b.last) {
    // the conclusion is itself a premise, or was reached before the last line
    b.add(0, goal, "R", [target]);
    target = b.last;
    lines = b.lines;
  }
  const proof = new Proof(prune(lines, 0, target, true));
  const set = logic === "classical" ? rules.classical : rules.intuitionistic;
  const checked = checkProof(proof, { rules: set, premises: ps, conclusion: goal });
  /* c8 ignore next */
  if (!checked.complete) throw new Error("internal error: the proof found does not check: " + (checked.errors[0]?.message ?? checked.note));
  return { status: "proved", proof, logic, lines: proof.lines.length };
}
const showLine = (l) => {
  const cites = l.cites.map((c) => (Array.isArray(c) ? `${c[0]}-${c[1]}` : String(c))).join(", ");
  return `${l.n}. ${"│ ".repeat(l.depth)}${l.formula}   ${l.rule}${cites ? " " + cites : ""}`;
};

/**
 * The next line of a proof in progress, and only the next line.
 *
 *   hint(textSoFar, { premises, conclusion, rules })
 *
 * Leave `premises` out and the premises are the ones the proof writes down.
 *
 *   { status: "hint", line: { n, depth, formula, rule, cites }, text, goal }
 *   { status: "error", error }       a line already written fails: fix that first
 *   { status: "done" }               the proof is complete
 *   { status: "invalid", countermodel }   no proof exists
 *   { status: "stuck", message }     the open subproof does not lead anywhere useful
 *   { status: "unprovable", message }  valid classically, but out of reach of an intuitionistic rule set
 *   { status: "unresolved", reason }
 *
 * `goal` is what the hint is working toward at that place in the proof. The
 * hint continues from the lines already there, so it follows the writer's
 * own approach where that can still succeed.
 */
export function hint(input, { premises, conclusion, rules: set = rules.classical, budget = 2000000 } = {}) {
  if (conclusion === undefined) refuse("bad-argument", "hint needs the conclusion being proved");
  const goal = formula(conclusion);
  const proof = input instanceof Proof ? input : typeof input === "string" ? (input.trim() ? parseProof(input, { rules: set }) : new Proof([])) : new Proof(input?.lines ?? input ?? []);
  // with no premises named, the premises are the ones the proof writes down
  const ps = premises === undefined ? proof.lines.filter((l) => l.depth === 0 && special(l.rule) === "premise").map((l) => l.formula) : formulas(premises);
  const checked = checkProof(proof, { rules: set, premises: ps, conclusion: goal });
  if (!checked.ok) return { status: "error", error: checked.errors[0], message: `fix this first: ${checked.errors[0].message}` };
  if (checked.complete) return { status: "done", message: "the proof is complete" };
  const classical = logicOf(set) === "classical";
  const truth = entails(ps, goal, { budget });
  if (truth.status === "invalid") return { status: "invalid", countermodel: truth.countermodel, message: "the conclusion does not follow from the premises, so there is no proof to finish" };
  if (truth.status === "unresolved") return truth;

  const lines = proof.lines;
  const state = proofState(proof);
  const depth = state.open.length;
  const nextN = lines.reduce((m, l) => Math.max(m, l.n), 0) + 1;
  const make = (d, f, rule, cites, toward) => {
    const line = { n: nextN, depth: d, formula: f, rule, cites };
    return { status: "hint", line, text: showLine(line), goal: String(toward) };
  };
  // a premise not yet written down comes first
  const written = new Set(lines.filter((l) => l.depth === 0 && special(l.rule) === "premise").map((l) => l.formula.key));
  const missing = ps.find((p) => !written.has(p.key));
  if (missing && depth === 0) return make(0, missing, "premise", [], goal);
  if (missing) return { status: "stuck", message: `the premise "${missing}" is not written down yet; premises go outside every subproof` };

  // what is in reach at each level, from the outside in
  const scopes = [newScope()];
  const level = [lines.filter((l) => l.depth === 0), ...state.open.map((s) => s.lines)];
  const closedAt = [state.closed.filter((s) => !state.open.some((o) => o.closed.includes(s))), ...state.open.map((s) => s.closed)];
  for (let k = 0; k <= depth; k++) {
    if (k) scopes.push(newScope(scopes[k - 1]));
    for (const l of level[k]) scopes[k].lines.set(l.formula.key, { n: l.n, formula: l.formula });
    for (const s of closedAt[k]) scopes[k].subs.set(s.assume.key + "⊢" + s.reach.key, [s.first, s.last]);
  }
  // top-level lines that sit after a closed subproof are still top-level: level[0] has them all

  // a plan from one level of the proof: the lines a proof of that level's goal would add
  const plan = (k, scope = scopes[k]) => {
    const b = new Builder(lines);
    try {
      const target = derive(goals[k].goal, b, newScope(scope), k, { nodes: 0, budget }, classical);
      return { target, added: prune(b.lines, lines.length, target, false).slice(lines.length) };
    } catch (e) {
      if (e === BUDGET || e === NO_PROOF) return { failed: e };
      throw e;
    }
  };
  const failure = (e, toward) => {
    if (e === BUDGET) return { status: "unresolved", budget, reason: `the proof search used its budget of ${budget} steps without an answer` };
    if (!classical) return { status: "unprovable", message: `"${toward}" follows here classically, but not by intuitionistic rules alone` };
    /* c8 ignore next */
    return { status: "unresolved", reason: "the proof search did not find a way forward" };
  };
  const first = (p, k) => {
    const toward = goals[k].goal;
    if (p.failed) return failure(p.failed, toward);
    if (!p.added.length) return make(k, toward, "R", [p.target], toward);
    return { status: "hint", line: p.added[0], text: showLine(p.added[0]), goal: String(toward) };
  };

  // what each open subproof is for: the place it has in a proof of the level outside it,
  // or, when no such proof uses it, the commonest reason for assuming what it assumes
  const goals = [{ goal, why: null }];
  for (let k = 1; k <= depth; k++) {
    const A = state.open[k - 1].assume;
    const G = goals[k - 1].goal;
    let g = null;
    const outside = plan(k - 1);
    if (outside.failed === BUDGET) return failure(BUDGET, G);
    if (outside.added) {
      const i = outside.added.findIndex((l) => l.depth === k && l.rule === "assumption" && l.formula.key === A.key);
      if (i >= 0) {
        let reach = outside.added[i];
        for (let j = i + 1; j < outside.added.length; j++) {
          const l = outside.added[j];
          if (l.depth < k || (l.depth === k && l.rule === "assumption")) break;
          if (l.depth === k) reach = l;
        }
        g = { goal: reach.formula, why: "plan" };
      }
    }
    if (!g) {
      const cases = formulasOf(scopes[k - 1]).find((f) => f.kind === "or" && (f.left.key === A.key || f.right.key === A.key));
      if (G.kind === "imp" && G.left.key === A.key) g = { goal: G.right, why: "→I", gives: G };
      else if (G.kind === "not" && G.arg.key === A.key) g = { goal: FALSE, why: "¬I", gives: G };
      else if (classical && A.kind === "not" && A.arg.key === G.key) g = { goal: FALSE, why: "IP", gives: G };
      else if (cases) g = { goal: G, why: "∨E", gives: G, cases, other: [cases.left.key === A.key ? cases.right : cases.left, G] };
      else g = { goal: FALSE, why: "¬I", gives: N(A) };
      const ok = entails(formulasOf(scopes[k]), g.goal, { budget });
      if (ok.status !== "valid") {
        return {
          status: "stuck",
          message: `the subproof that starts at line ${state.open[k - 1].first} assumes "${A}", and from there ${g.goal.kind === "bot" ? "no contradiction follows" : `"${g.goal}" does not follow`}; end it, or start it with a different assumption`,
        };
      }
    }
    goals.push(g);
  }

  const here = goals[depth];
  const lastLine = lines[lines.length - 1];
  if (depth > 0 && lastLine.depth === depth && lastLine.formula.key === here.goal.key) {
    // the subproof has reached what it was for: the next line is outside it, and uses it
    const s = state.open[depth - 1];
    const range = [s.first, lastLine.n];
    const outer = newScope(scopes[depth - 1]);
    outer.subs.set(s.assume.key + "⊢" + here.goal.key, range);
    if (here.why === "plan") return first(plan(depth - 1, outer), depth - 1);
    const toward = goals[depth - 1].goal;
    if (here.why === "∨E") {
      const [assume, reach] = here.other;
      const done = outer.subs.get(assume.key + "⊢" + reach.key);
      if (!done) return make(depth, assume, "assumption", [], reach);
      const pair = here.cases.left.key === s.assume.key ? [range, done] : [done, range];
      return make(depth - 1, here.gives, "∨E", [lineOf(outer, here.cases), ...pair], toward);
    }
    return make(depth - 1, here.gives, here.why, [range], toward);
  }
  return first(plan(depth), depth);
}
