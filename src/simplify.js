// Shortest forms by the Quine–McCluskey method: find every prime implicant,
// take the essential ones, and choose the fewest of the rest that cover the
// table.

import { formula, refuse, and, or, not, atom } from "./formula.js";
import { tableBits, atomsOf } from "./semantics.js";

const LIMIT = 14;
const popcount = (x) => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};

/** Prime implicants of the rows `on` ∪ `dc` over n atoms, each { value, mask } (mask bits are the atoms left out). */
function primes(n, rows) {
  let level = new Map(rows.map((r) => [`0:${r}`, { value: r, mask: 0 }]));
  const out = [];
  while (level.size) {
    const next = new Map();
    const used = new Set();
    const byMask = new Map();
    for (const [key, t] of level) {
      if (!byMask.has(t.mask)) byMask.set(t.mask, []);
      byMask.get(t.mask).push([key, t]);
    }
    for (const group of byMask.values()) {
      const have = new Map(group.map(([key, t]) => [t.value, key]));
      for (const [key, t] of group) {
        for (let b = 0; b < n; b++) {
          const bit = 1 << b;
          if (t.mask & bit || t.value & bit) continue;
          const other = have.get(t.value | bit);
          if (other === undefined) continue;
          used.add(key);
          used.add(other);
          const merged = { value: t.value, mask: t.mask | bit };
          next.set(`${merged.mask}:${merged.value}`, merged);
        }
      }
    }
    for (const [key, t] of level) if (!used.has(key)) out.push(t);
    level = next;
  }
  return out;
}
const covers = (t, r) => (r & ~t.mask) === t.value;

/** Fewest primes covering every row of `need`; ties go to fewer literals. Exact unless the budget runs out. */
function cover(n, list, need) {
  const cost = (t) => n - popcount(t.mask);
  const chosen = [];
  let left = new Set(need);
  // essential primes: the only one covering some row
  const essential = new Set();
  for (const r of need) {
    const who = list.filter((t) => covers(t, r));
    if (who.length === 1) essential.add(who[0]);
  }
  for (const t of essential) {
    chosen.push(t);
    for (const r of [...left]) if (covers(t, r)) left.delete(r);
  }
  let rest = list.filter((t) => !essential.has(t) && [...left].some((r) => covers(t, r)));
  let exact = true;
  let best = null;
  let bestCost = Infinity;
  let budget = 200000;
  const search = (uncovered, picked, literals) => {
    if (budget-- <= 0) {
      exact = false;
      return;
    }
    const score = picked.length * 1000 + literals;
    if (score >= bestCost) return;
    if (!uncovered.length) {
      best = [...picked];
      bestCost = score;
      return;
    }
    // branch on the row with the fewest primes that cover it
    let pick = null;
    for (const r of uncovered) {
      const who = rest.filter((t) => covers(t, r));
      if (!pick || who.length < pick.length) pick = who;
      if (who.length <= 1) break;
    }
    pick.sort((a, b) => uncovered.filter((r) => covers(b, r)).length - uncovered.filter((r) => covers(a, r)).length || cost(a) - cost(b));
    for (const t of pick) {
      picked.push(t);
      search(uncovered.filter((r) => !covers(t, r)), picked, literals + cost(t));
      picked.pop();
      if (!exact) return;
    }
  };
  // a greedy cover first, as the bound to beat and the answer if the budget runs out
  {
    let unc = [...left];
    const picked = [];
    let literals = 0;
    while (unc.length) {
      let top = null;
      let topCount = -1;
      for (const t of rest) {
        const c = unc.filter((r) => covers(t, r)).length;
        if (c > topCount || (c === topCount && cost(t) < cost(top))) [top, topCount] = [t, c];
      }
      picked.push(top);
      literals += cost(top);
      unc = unc.filter((r) => !covers(top, r));
    }
    best = picked;
    bestCost = picked.length * 1000 + literals + 1;
  }
  search([...left], [], 0);
  return { chosen: [...chosen, ...best], essential, exact };
}

const termLiterals = (names, t, flip) => {
  const n = names.length;
  const lits = [];
  names.forEach((name, j) => {
    const bit = 1 << (n - 1 - j);
    if (t.mask & bit) return;
    const positive = Boolean(t.value & bit) !== flip;
    lits.push(positive ? atom(name) : not(atom(name)));
  });
  return lits;
};
const rowsOf = (bits, n) => {
  const out = [];
  for (let r = 0; r < 1 << n; r++) if ((bits >> BigInt(r)) & 1n) out.push(r);
  return out;
};
const sortTerms = (ts) => [...ts].sort((a, b) => popcount(b.mask) - popcount(a.mask) || b.value - a.value);

/**
 * The shortest sum of products (form "dnf") or product of sums (form "cnf")
 * with the formula's truth table.
 *
 *   { formula, form, terms, literals, exact,
 *     primes: [{ formula, rows, essential, chosen }] }
 *
 * dontCare is a formula that is true on the rows whose value does not
 * matter. `exact` is false only if the final choice among primes had to stop
 * at its budget, in which case the answer is correct but perhaps not the
 * shortest. For form "cnf" the primes are those of the negation, each shown
 * as the clause it becomes.
 */
export function minimize(input, { form = "dnf", dontCare, atoms } = {}) {
  if (form !== "dnf" && form !== "cnf") refuse("bad-argument", `form is "dnf" or "cnf", not ${form}`);
  const f = formula(input);
  const dc = dontCare === undefined ? null : formula(dontCare);
  const names = atomsOf(dc ? [f, dc] : [f], atoms);
  const n = names.length;
  if (n > LIMIT) refuse("too-large", `minimising over ${n} atoms is out of reach of the table method (the limit is ${LIMIT})`);
  const all = (1n << BigInt(1 << n)) - 1n;
  const dcBits = dc ? tableBits(dc, names) : 0n;
  let onBits = tableBits(f, names);
  if (form === "cnf") onBits = all ^ onBits;
  onBits &= all ^ dcBits;
  const on = rowsOf(onBits, n);
  const list = primes(n, rowsOf(onBits | dcBits, n)).filter((t) => on.some((r) => covers(t, r)));
  const { chosen, essential, exact } = cover(n, list, on);
  const flip = form === "cnf";
  const build = (t) => (flip ? or(termLiterals(names, t, true)) : and(termLiterals(names, t, false)));
  const picked = sortTerms(chosen);
  const result = flip ? and(picked.map(build)) : or(picked.map(build));
  return {
    formula: result,
    form,
    atoms: names,
    terms: picked.length,
    literals: picked.reduce((s, t) => s + n - popcount(t.mask), 0),
    exact,
    primes: sortTerms(list).map((t) => ({
      formula: build(t),
      rows: on.filter((r) => covers(t, r)),
      essential: essential.has(t),
      chosen: chosen.includes(t),
    })),
  };
}

/** The prime implicants of a formula, as conjunctions of literals. */
export function primeImplicants(input, options = {}) {
  return minimize(input, { ...options, form: "dnf" }).primes.map((p) => p.formula);
}

/**
 * A shortest equivalent formula in two levels. form "dnf", "cnf", or "auto"
 * (default): whichever of the two is shorter. Options as for minimize.
 */
export function simplify(input, { form = "auto", ...rest } = {}) {
  if (form !== "auto") return minimize(input, { ...rest, form }).formula;
  const d = minimize(input, { ...rest, form: "dnf" });
  const c = minimize(input, { ...rest, form: "cnf" });
  return c.literals + c.terms < d.literals + d.terms ? c.formula : d.formula;
}
