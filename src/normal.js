// Normal forms: negation normal form, conjunctive and disjunctive forms by
// distribution or from the table, and the Tseitin form, which stays small by
// naming subformulas.

import { Formula, formula, refuse, and, or, not, atom, compareNames, TRUE, FALSE } from "./formula.js";
import { minterms, maxterms, fromMinterms, fromMaxterms, atomsOf } from "./semantics.js";

const N = (f) => new Formula("not", f);
const B = (kind, a, b) => new Formula(kind, a, b);

/** Remove ⊤ and ⊥ wherever they sit under a connective. The result is ⊤, ⊥, or free of both. */
export function foldConstants(input) {
  const go = (f) => {
    if (!f.parts.length) return f;
    if (f.kind === "not") {
      const a = go(f.arg);
      return a === TRUE ? FALSE : a === FALSE ? TRUE : a === f.arg ? f : N(a);
    }
    const l = go(f.left);
    const r = go(f.right);
    const lt = l === TRUE, lf = l === FALSE, rt = r === TRUE, rf = r === FALSE;
    switch (f.kind) {
      case "and": if (lf || rf) return FALSE; if (lt) return r; if (rt) return l; break;
      case "or": if (lt || rt) return TRUE; if (lf) return r; if (rf) return l; break;
      case "imp": if (lf || rt) return TRUE; if (lt) return r; if (rf) return go(N(l)); break;
      case "iff": if (lt) return r; if (rt) return l; if (lf) return go(N(r)); if (rf) return go(N(l)); break;
      default: if (lf) return r; if (rf) return l; if (lt) return go(N(r)); if (rt) return go(N(l));
    }
    return l === f.left && r === f.right ? f : B(f.kind, l, r);
  };
  return go(formula(input));
}

/**
 * Negation normal form: only ∧ and ∨, with ¬ on atoms alone. → ↔ ⊕ are
 * written out and negations pushed inward by De Morgan's laws.
 */
export function nnf(input) {
  const go = (f, neg) => {
    switch (f.kind) {
      case "atom": return neg ? N(f) : f;
      case "top": return neg ? FALSE : TRUE;
      case "bot": return neg ? TRUE : FALSE;
      case "not": return go(f.arg, !neg);
      case "and": return B(neg ? "or" : "and", go(f.left, neg), go(f.right, neg));
      case "or": return B(neg ? "and" : "or", go(f.left, neg), go(f.right, neg));
      case "imp": return neg ? B("and", go(f.left, false), go(f.right, true)) : B("or", go(f.left, true), go(f.right, false));
      default: {
        // a ↔ b is (¬a ∨ b) ∧ (a ∨ ¬b); its negation, which is a ⊕ b, is (a ∨ b) ∧ (¬a ∨ ¬b)
        const same = (f.kind === "iff") !== neg;
        return same
          ? B("and", B("or", go(f.left, true), go(f.right, false)), B("or", go(f.left, false), go(f.right, true)))
          : B("and", B("or", go(f.left, false), go(f.right, false)), B("or", go(f.left, true), go(f.right, true)));
      }
    }
  };
  return go(formula(input), false);
}

// ---- clause sets over numbered atoms ---------------------------------------------------------
// A literal is ±v for atom number v ≥ 1; a clause is a sorted array of literals.

const byVar = (a, b) => Math.abs(a) - Math.abs(b) || b - a;
/** Sort, drop repeats; null when the clause holds a literal and its negation. */
export function tidyClause(lits) {
  const c = [...new Set(lits)].sort(byVar);
  for (let i = 1; i < c.length; i++) if (c[i] === -c[i - 1]) return null;
  return c;
}
function dedupe(clauses) {
  const seen = new Map();
  for (const c of clauses) seen.set(c.join(","), c);
  return [...seen.values()];
}
/** Drop every clause that contains another one. */
function subsume(clauses) {
  if (clauses.length > 3000) return clauses;
  const sorted = [...clauses].sort((a, b) => a.length - b.length);
  const kept = [];
  for (const c of sorted) {
    const set = new Set(c);
    if (!kept.some((k) => k.every((l) => set.has(l)))) kept.push(c);
  }
  return kept;
}
const orderClauses = (clauses) =>
  [...clauses].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return byVar(a[i], b[i]);
    return a.length - b.length;
  });

/** Clauses of a formula in negation normal form, by distributing ∨ over ∧. */
function distribute(f, number, limit) {
  const go = (g) => {
    switch (g.kind) {
      case "atom": return [[number(g.name)]];
      case "not": return [[-number(g.arg.name)]];
      case "top": return [];
      case "bot": return [[]];
      case "and": return dedupe([...go(g.left), ...go(g.right)]);
      default: {
        const L = go(g.left);
        const R = go(g.right);
        if (L.length * R.length > limit * 4) refuse("too-large", `distribution passes ${limit} clauses; ask for method "tseitin", which stays small`);
        const out = [];
        for (const a of L) for (const b of R) {
          const c = tidyClause([...a, ...b]);
          if (c) out.push(c);
        }
        const d = subsume(dedupe(out));
        if (d.length > limit) refuse("too-large", `distribution passes ${limit} clauses; ask for method "tseitin", which stays small`);
        return d;
      }
    }
  };
  return orderClauses(subsume(go(f)));
}

const numbering = (names) => {
  const index = new Map(names.map((n, i) => [n, i + 1]));
  return { names: [null, ...names], number: (n) => index.get(n) };
};
const litFormula = (names) => (l) => (l > 0 ? atom(names[l]) : not(atom(names[-l])));

/**
 * Conjunctive normal form: a conjunction of disjunctions of literals.
 * method "distribute" (default) multiplies out and drops clauses that are
 * always true or contain another clause; "table" gives the full form with one
 * clause for each false row; "tseitin" names subformulas with new atoms and
 * is satisfiable exactly when the formula is, not equivalent to it.
 */
export function cnf(input, { method = "distribute", limit = 5000, atoms } = {}) {
  const f = formula(input);
  if (method === "table") {
    const names = atomsOf([f], atoms);
    return fromMaxterms(names, maxterms(f, names));
  }
  if (method === "tseitin") return tseitin(f).formula;
  if (method !== "distribute") refuse("bad-argument", `unknown method ${method}`);
  const { names, number } = numbering(f.atoms());
  const cs = distribute(nnf(foldConstants(f)), number, limit);
  return and(cs.map((c) => or(c.map(litFormula(names)))));
}

/**
 * Disjunctive normal form: a disjunction of conjunctions of literals.
 * method "distribute" (default) or "table" (one term for each true row).
 */
export function dnf(input, { method = "distribute", limit = 5000, atoms } = {}) {
  const f = formula(input);
  if (method === "table") {
    const names = atomsOf([f], atoms);
    return fromMinterms(names, minterms(f, names));
  }
  if (method !== "distribute") refuse("bad-argument", `unknown method ${method}`);
  const { names, number } = numbering(f.atoms());
  // the terms of f are the clauses of ¬f with every literal turned over
  const cs = distribute(nnf(foldConstants(N(f))), number, limit);
  return or(cs.map((c) => and(c.map((l) => litFormula(names)(-l)))));
}

/** The Tseitin clauses of a formula over numbered atoms; new atoms continue the numbering. */
function tseitinClauses(fs, names, number) {
  const fresh = new Map();
  const definitions = [];
  const clauses = [];
  const used = new Set(names.slice(1));
  let counter = 0;
  const newVar = (f) => {
    let name;
    do name = `_${++counter}`;
    while (used.has(name));
    names.push(name);
    definitions.push({ atom: name, formula: f });
    return names.length - 1;
  };
  const lit = (f) => {
    if (f.kind === "atom") return number(f.name);
    if (f.kind === "not") return -lit(f.arg);
    const had = fresh.get(f.key);
    if (had) return had;
    const a = lit(f.left);
    const b = lit(f.right);
    const x = newVar(f);
    fresh.set(f.key, x);
    const add = (...c) => {
      const t = tidyClause(c);
      if (t) clauses.push(t);
    };
    switch (f.kind) {
      case "and": add(-x, a); add(-x, b); add(x, -a, -b); break;
      case "or": add(x, -a); add(x, -b); add(-x, a, b); break;
      case "imp": add(x, a); add(x, -b); add(-x, -a, b); break;
      case "iff": add(-x, -a, b); add(-x, a, -b); add(x, a, b); add(x, -a, -b); break;
      default: add(-x, a, b); add(-x, -a, -b); add(x, -a, b); add(x, a, -b);
    }
    return x;
  };
  for (const f of fs) {
    if (f === TRUE) continue;
    if (f === FALSE) clauses.push([]);
    else clauses.push([lit(f)]);
  }
  return { clauses: dedupe(clauses), definitions };
}

const showLit = (names) => (l) => (l > 0 ? names[l] : "¬" + names[-l]);

/**
 * The Tseitin form: every compound subformula gets a new atom (_1, _2, …)
 * and three or four short clauses saying the atom means that subformula.
 * The result grows in step with the formula, where distribution can grow
 * exponentially, and it is satisfiable exactly when the formula is: a model
 * of the clauses, cut down to the original atoms, is a model of the formula.
 *
 *   { formula, clauses: [["¬_1", "p"], …], definitions: [{ atom, formula }], atoms }
 */
export function tseitin(input) {
  const f = foldConstants(formula(input));
  const { names, number } = numbering(f.atoms());
  const { clauses: cs, definitions } = tseitinClauses([f], names, number);
  return {
    formula: and(cs.map((c) => or(c.map(litFormula(names))))),
    clauses: cs.map((c) => c.map(showLit(names))),
    definitions,
    atoms: names.slice(1),
  };
}

/**
 * The clauses the solver works on, for a list of formulas taken together.
 * method "auto" distributes while that stays small and otherwise names
 * subformulas. Returns { clauses (numbered), names, method, definitions }.
 */
export function solverClauses(fs, { method = "auto", limit = 400 } = {}) {
  const folded = fs.map((f) => foldConstants(f));
  const all = new Set();
  for (const f of folded) for (const a of f.atoms()) all.add(a);
  const { names, number } = numbering([...all].sort(compareNames));
  if (method === "auto" || method === "distribute") {
    try {
      let cs = [];
      for (const f of folded) {
        cs.push(...distribute(nnf(f), number, method === "auto" ? limit : 20000));
        if (method === "auto" && cs.length > limit) refuse("too-large", "over the limit");
      }
      return { clauses: orderClauses(dedupe(cs)), names, method: "distribute", definitions: [] };
    } catch (e) {
      if (method !== "auto" || e.code !== "too-large") throw e;
    }
  } else if (method !== "tseitin") refuse("bad-argument", `unknown method ${method}`);
  const { clauses: cs, definitions } = tseitinClauses(folded, names, number);
  return { clauses: cs, names, method: "tseitin", definitions };
}

/**
 * A formula as a set of clauses, each a list of literals written as text:
 * clauses("(p -> q) & p") is [["¬p", "q"], ["p"]]. method: "distribute"
 * (default), "tseitin" or "auto".
 */
export function clauses(input, { method = "distribute" } = {}) {
  const r = solverClauses([formula(input)], { method });
  return r.clauses.map((c) => c.map(showLit(r.names)));
}

// ---- recognising the forms -------------------------------------------------------------------

const flat = (f, kind) => (f.kind === kind ? [...flat(f.left, kind), ...flat(f.right, kind)] : [f]);
const constant = (f) => f === TRUE || f === FALSE;
export function isNnf(input) {
  const go = (f) => f.isLiteral || constant(f) || ((f.kind === "and" || f.kind === "or") && go(f.left) && go(f.right));
  return go(formula(input));
}
export function isCnf(input) {
  const f = formula(input);
  return constant(f) || flat(f, "and").every((c) => flat(c, "or").every((l) => l.isLiteral));
}
export function isDnf(input) {
  const f = formula(input);
  return constant(f) || flat(f, "or").every((c) => flat(c, "and").every((l) => l.isLiteral));
}

export { showLit, numbering, litFormula };
