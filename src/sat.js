// Satisfiability with evidence. A satisfiable answer carries a model that has
// been checked against the formulas; an unsatisfiable one carries a resolution
// refutation that a separate, much simpler checker accepts; and a search that
// runs out of its budget says so instead of guessing.

import { Formula, formula, formulas, refuse, compareNames } from "./formula.js";
import { solverClauses, tidyClause, showLit } from "./normal.js";

const BUDGET = Symbol("budget");
const SAT = -1;

/**
 * DPLL on numbered clauses. Returns { sat: true, value } with value[v] ∈ {1, −1},
 * or { sat: false, steps } where steps is a resolution refutation:
 * each step is { clause, from: null | [i, j], pivot, input }.
 */
function dpll(nVars, clauses, budget) {
  const val = new Int8Array(nVars + 1);
  const steps = [];
  const inputAt = new Map();
  let nodes = 0;
  const inputStep = (ci) => {
    let s = inputAt.get(ci);
    if (s === undefined) {
      s = steps.push({ clause: clauses[ci], from: null, pivot: 0, input: ci }) - 1;
      inputAt.set(ci, s);
    }
    return s;
  };
  const resolveSteps = (a, b, v) => {
    const clause = tidyClause([...steps[a].clause, ...steps[b].clause].filter((l) => l !== v && l !== -v));
    return steps.push({ clause, from: [a, b], pivot: v, input: -1 }) - 1;
  };
  const solve = () => {
    if (++nodes > budget) throw BUDGET;
    let unit = -1;
    let unitLit = 0;
    const weight = new Map();
    for (let ci = 0; ci < clauses.length; ci++) {
      const c = clauses[ci];
      let open = 0;
      let last = 0;
      let satisfied = false;
      for (const l of c) {
        const v = l > 0 ? val[l] : -val[-l];
        if (v === 1) {
          satisfied = true;
          break;
        }
        if (v === 0) {
          open++;
          last = l;
        }
      }
      if (satisfied) continue;
      if (open === 0) return inputStep(ci);
      if (open === 1) {
        if (unit < 0) {
          unit = ci;
          unitLit = last;
        }
      } else if (unit < 0) {
        const w = open === 2 ? 4 : 1;
        for (const l of c) {
          const x = Math.abs(l);
          if (val[x] === 0) weight.set(x, (weight.get(x) ?? 0) + w);
        }
      }
    }
    if (unit >= 0) {
      const x = Math.abs(unitLit);
      val[x] = unitLit > 0 ? 1 : -1;
      const r = solve();
      if (r === SAT) return SAT;
      val[x] = 0;
      if (!steps[r].clause.includes(-unitLit)) return r;
      return resolveSteps(r, inputStep(unit), x);
    }
    let pick = 0;
    let best = 0;
    for (const [x, w] of weight) if (w > best || (w === best && x < pick)) [pick, best] = [x, w];
    if (!pick) return SAT;
    val[pick] = 1;
    const r1 = solve();
    if (r1 === SAT) return SAT;
    if (!steps[r1].clause.includes(-pick)) {
      val[pick] = 0;
      return r1;
    }
    val[pick] = -1;
    const r2 = solve();
    if (r2 === SAT) return SAT;
    val[pick] = 0;
    if (!steps[r2].clause.includes(pick)) return r2;
    return resolveSteps(r1, r2, pick);
  };
  let root;
  try {
    root = solve();
  } catch (e) {
    if (e === BUDGET) return { unresolved: true, nodes };
    throw e;
  }
  if (root === SAT) {
    for (let v = 1; v <= nVars; v++) if (val[v] === 0) val[v] = -1;
    return { sat: true, value: val, nodes };
  }
  // keep only the steps the empty clause depends on: premises first, then the rest in order
  const need = new Set();
  const mark = (i) => {
    if (need.has(i)) return;
    need.add(i);
    if (steps[i].from) steps[i].from.forEach(mark);
  };
  mark(root);
  const kept = [...need].sort((a, b) => {
    const ia = steps[a].from ? 1 : 0;
    const ib = steps[b].from ? 1 : 0;
    return ia - ib || (ia ? a - b : steps[a].input - steps[b].input);
  });
  const renumber = new Map(kept.map((old, i) => [old, i + 1]));
  return {
    sat: false,
    nodes,
    steps: kept.map((old) => {
      const s = steps[old];
      return { n: renumber.get(old), clause: s.clause, from: s.from ? s.from.map((i) => renumber.get(i)) : null, pivot: s.pivot };
    }),
  };
}

// ---- resolution proofs as data ---------------------------------------------------------------

const NEG = /^(¬|~|!|-|∼|not\s+)\s*/;
/** A literal as text, in the house spelling: "p" or "¬p". */
export function literal(text) {
  let s = String(text).trim();
  let positive = true;
  for (let m; (m = NEG.exec(s)); s = s.slice(m[0].length)) positive = !positive;
  if (!/^[A-Za-z_][A-Za-z0-9_]*'*$/.test(s)) refuse("syntax", `"${text}" is not a literal: write an atom, or an atom with ¬ or ~ in front`);
  return positive ? s : "¬" + s;
}
const flip = (lit) => (lit.startsWith("¬") ? lit.slice(1) : "¬" + lit);
const litOrder = (a, b) => compareNames(a.replace("¬", ""), b.replace("¬", "")) || (a < b ? -1 : a > b ? 1 : 0);
/**
 * A clause as a sorted list of literals. Text may be "p | ~q | r", "p ∨ ¬q",
 * "{p, ~q}" or "p, ~q"; the empty clause is "[]", "{}", "□" or "⊥".
 */
export function clause(input) {
  let lits;
  if (Array.isArray(input)) lits = input.map(literal);
  else {
    const s = String(input).trim().replace(/^[{[(]|[})\]]$/g, "").trim();
    lits = s === "" || s === "□" || s === "⊥" || s === "false" ? [] : s.split(/\s*(?:\\\/|\|\||\||∨|,|\bor\b)\s*/).map(literal);
  }
  return [...new Set(lits)].sort(litOrder);
}
export const showClause = (c) => (c.length ? c.join(" ∨ ") : "□");

/**
 * The resolvent of two clauses on an atom: one must hold the atom and the
 * other its negation. Without an atom, the one atom they clash on is used.
 * Returns the clause, or null when they do not clash (on that atom).
 */
export function resolve(c1, c2, pivot) {
  const a = clause(c1);
  const b = clause(c2);
  let p = pivot === undefined || pivot === null ? null : literal(pivot).replace("¬", "");
  if (p === null) {
    const clash = a.filter((l) => b.includes(flip(l))).map((l) => l.replace("¬", ""));
    if (clash.length !== 1) return null;
    p = clash[0];
  }
  const [pos, neg] = a.includes(p) && b.includes("¬" + p) ? [a, b] : b.includes(p) && a.includes("¬" + p) ? [b, a] : [null, null];
  if (!pos) return null;
  return clause([...pos.filter((l) => l !== p), ...neg.filter((l) => l !== "¬" + p)]);
}

const sameClause = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);

/**
 * A resolution proof: numbered lines, each a premise clause or the resolvent
 * of two earlier lines. Read one from text with parseResolution, or take the
 * one a solver verdict carries.
 */
export class ResolutionProof {
  constructor(steps, extra = {}) {
    this.steps = steps;
    Object.assign(this, extra);
  }
  /** Does every line follow, and does the last line read □? See checkResolution. */
  check(options) {
    return checkResolution(this, options);
  }
  toString() {
    const width = Math.max(...this.steps.map((s) => showClause(s.clause).length), 1);
    const digits = String(this.steps.length).length;
    return this.steps
      .map((s) => `${String(s.n).padStart(digits)}. ${showClause(s.clause).padEnd(width)}   ${s.from ? `resolve ${s.from.join(", ")}${s.pivot ? ` on ${s.pivot}` : ""}` : "premise"}`)
      .join("\n");
  }
}

/**
 * Read a resolution proof from text, one line each:
 *
 *   1. p | q        premise
 *   2. ~p | q       premise
 *   3. q            res 1, 2
 *
 * Line numbers are optional; "resolve", "res" or just the two numbers will do.
 */
export function parseResolution(text) {
  const steps = [];
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/(#|\/\/).*$/, "").trim();
    if (!line) continue;
    const n = steps.length + 1;
    const num = /^(\d+)\s*[.):]\s*/.exec(line);
    const rest = num ? line.slice(num[0].length) : line;
    const m = /^(.*?)\s+((?:premise|given|res\w*)\b.*|\d+\s*[, ]\s*\d+.*)$/i.exec(rest) ?? [rest, rest, ""];
    if (num && Number(num[1]) !== n) refuse("syntax", `line ${n} of the proof is numbered ${num[1]}; number the lines 1, 2, 3, … or not at all`);
    const why = m[2].trim();
    const cites = [...why.matchAll(/\d+/g)].map((x) => Number(x[0]));
    const on = /\bon\s+(\S+)/i.exec(why);
    let c;
    try {
      c = clause(m[1]);
    } catch (e) {
      refuse("syntax", `line ${n}: ${e.message}`);
    }
    if (on) cites.length = Math.min(cites.length, 2);
    steps.push({ n, clause: c, from: cites.length ? cites : null, pivot: on ? literal(on[1]).replace("¬", "") : null });
  }
  return new ResolutionProof(steps);
}

/**
 * Check a resolution proof line by line. With { premises } (clauses, or
 * formulas whose clauses they must be) every premise line must be one of
 * them. Returns
 *
 *   { ok, refutation, errors: [{ line, rule, message }] }
 *
 * where ok says every line follows and refutation says the last line is the
 * empty clause as well.
 */
export function checkResolution(proof, { premises } = {}) {
  const p = typeof proof === "string" ? parseResolution(proof) : proof;
  const allowed = premises ? premises.map(clause) : null;
  const errors = [];
  const bad = (line, rule, message) => errors.push({ line, rule, message: `line ${line}: ${message}` });
  p.steps.forEach((s, i) => {
    const n = i + 1;
    const c = clause(s.clause);
    if (!s.from) {
      if (allowed && !allowed.some((a) => sameClause(a, c))) bad(n, "premise", `${showClause(c)} is marked as a premise but is not one of the given clauses`);
      return;
    }
    if (s.from.length !== 2) return bad(n, "resolve", `resolution takes two earlier lines; ${s.from.length} given`);
    const wrong = s.from.find((j) => !(Number.isInteger(j) && j >= 1 && j < n));
    if (wrong !== undefined) return bad(n, "resolve", `it cites line ${wrong}, which is not an earlier line`);
    const [a, b] = s.from.map((j) => clause(p.steps[j - 1].clause));
    if (s.pivot) {
      const r = resolve(a, b, s.pivot);
      if (!r) return bad(n, "resolve", `lines ${s.from.join(" and ")} do not clash on ${s.pivot}: one must contain ${s.pivot} and the other ¬${s.pivot}`);
      if (!sameClause(r, c)) return bad(n, "resolve", `resolving lines ${s.from.join(" and ")} on ${s.pivot} gives ${showClause(r)}, not ${showClause(c)}`);
      return;
    }
    const clash = a.filter((l) => b.includes(flip(l))).map((l) => l.replace("¬", ""));
    if (!clash.length) return bad(n, "resolve", `lines ${s.from.join(" and ")} have no literal that appears positive in one and negated in the other`);
    const results = clash.map((x) => resolve(a, b, x));
    if (!results.some((r) => sameClause(r, c))) return bad(n, "resolve", `resolving lines ${s.from.join(" and ")} gives ${results.map(showClause).join(" or ")}, not ${showClause(c)}`);
  });
  const last = p.steps[p.steps.length - 1];
  const ok = errors.length === 0;
  return { ok, refutation: ok && Boolean(last) && clause(last.clause).length === 0, errors };
}

// ---- verdicts ----------------------------------------------------------------------------------

const DEFAULT_BUDGET = 200000;

function run(fs, { budget = DEFAULT_BUDGET, method = "auto" } = {}) {
  const prepared = solverClauses(fs, { method });
  const r = dpll(prepared.names.length - 1, prepared.clauses, budget);
  if (r.unresolved) return { status: "unresolved", budget, reason: `the search used its budget of ${budget} steps without an answer` };
  if (r.sat) {
    const model = {};
    const all = new Set();
    for (const f of fs) for (const a of f.atoms()) all.add(a);
    for (const a of [...all].sort(compareNames)) model[a] = false;
    for (let v = 1; v < prepared.names.length; v++) if (Object.hasOwn(model, prepared.names[v])) model[prepared.names[v]] = r.value[v] === 1;
    /* c8 ignore next */
    if (!fs.every((f) => f.evaluate(model))) throw new Error("internal error: the model found does not satisfy the formulas");
    return { status: "satisfiable", model, steps: r.nodes };
  }
  const show = showLit(prepared.names);
  const proof = new ResolutionProof(
    r.steps.map((s) => ({ n: s.n, clause: clause(s.clause.map(show)), from: s.from, pivot: s.pivot ? prepared.names[s.pivot] : null })),
    {
      method: prepared.method,
      premises: prepared.clauses.map((c) => clause(c.map(show))),
      definitions: prepared.definitions,
    },
  );
  /* c8 ignore next 2 */
  const checked = checkResolution(proof, { premises: proof.premises });
  if (!checked.refutation) throw new Error("internal error: the refutation found does not check: " + checked.errors.map((e) => e.message).join("; "));
  return { status: "unsatisfiable", refutation: proof, steps: r.nodes };
}

const list = (x) => (x instanceof Formula ? [x] : formulas(x));

/**
 * Can the formula (or all the formulas of a list at once) be true?
 *
 *   { status: "satisfiable", model }            the model has been checked
 *   { status: "unsatisfiable", refutation }     a resolution proof of □, checked
 *   { status: "unresolved", budget, reason }    the search stopped at its budget
 *
 * Options: budget (search steps, default 200000), method ("auto",
 * "distribute" or "tseitin": how the clauses are made).
 */
export function satisfiable(input, options) {
  return run(list(input), options);
}

/**
 * Is the formula true under every valuation?
 *
 *   { status: "valid", refutation }      a refutation of its negation
 *   { status: "invalid", countermodel }  a valuation that makes it false, checked
 *   { status: "unresolved", … }
 */
export function valid(input, options) {
  return entails([], input, options);
}

/**
 * Do the premises force the conclusion? Same three answers as valid; the
 * countermodel makes every premise true and the conclusion false.
 */
export function entails(premises, conclusion, options) {
  const ps = list(premises);
  const c = formula(conclusion);
  const r = run([...ps, new Formula("not", c)], options);
  if (r.status === "satisfiable") return { status: "invalid", countermodel: r.model, steps: r.steps };
  if (r.status === "unsatisfiable") return { status: "valid", refutation: r.refutation, steps: r.steps };
  return r;
}

/**
 * Do two formulas have the same truth table?
 *
 *   { status: "equivalent", refutation }
 *   { status: "different", witness, values: [a, b] }   a valuation where they differ
 *   { status: "unresolved", … }
 */
export function equivalent(a, b, options) {
  const f = formula(a);
  const g = formula(b);
  const r = run([new Formula("xor", f, g)], options);
  if (r.status === "satisfiable") return { status: "different", witness: r.model, values: [f.evaluate(r.model), g.evaluate(r.model)], steps: r.steps };
  if (r.status === "unsatisfiable") return { status: "equivalent", refutation: r.refutation, steps: r.steps };
  return r;
}

/**
 * "tautology", "contradiction" or "contingent", with the evidence:
 * { kind, trueUnder, falseUnder } gives a valuation for each side that
 * exists. kind is "unresolved" when the search stops at its budget.
 */
export function classify(input, options) {
  const f = formula(input);
  const s = run([f], options);
  if (s.status === "unresolved") return { kind: "unresolved", ...s };
  if (s.status === "unsatisfiable") return { kind: "contradiction", refutation: s.refutation };
  const v = run([new Formula("not", f)], options);
  if (v.status === "unresolved") return { kind: "unresolved", ...v };
  if (v.status === "unsatisfiable") return { kind: "tautology", trueUnder: s.model, refutation: v.refutation };
  return { kind: "contingent", trueUnder: s.model, falseUnder: v.model };
}

/**
 * The solver on clauses given directly: satisfiableClauses(["p | q", "~p", "~q"]).
 * Same answers as satisfiable.
 */
export function satisfiableClauses(input, { budget = DEFAULT_BUDGET } = {}) {
  const cs = input.map(clause);
  const names = [null, ...[...new Set(cs.flat().map((l) => l.replace("¬", "")))].sort(compareNames)];
  const index = new Map(names.map((n, i) => [n, i]));
  const numbered = cs.map((c) => tidyClause(c.map((l) => (l.startsWith("¬") ? -index.get(l.slice(1)) : index.get(l))))).filter(Boolean);
  const r = dpll(names.length - 1, numbered, budget);
  if (r.unresolved) return { status: "unresolved", budget, reason: `the search used its budget of ${budget} steps without an answer` };
  if (r.sat) return { status: "satisfiable", model: Object.fromEntries(names.slice(1).map((n, i) => [n, r.value[i + 1] === 1])), steps: r.nodes };
  const show = showLit(names);
  const proof = new ResolutionProof(
    r.steps.map((s) => ({ n: s.n, clause: clause(s.clause.map(show)), from: s.from, pivot: s.pivot ? names[s.pivot] : null })),
    { premises: cs },
  );
  return { status: "unsatisfiable", refutation: proof, steps: r.nodes };
}
