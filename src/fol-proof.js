// Natural deduction for predicate logic. The propositional rules are the
// ones from the Fitch checker, applied to first-order formulas by treating
// each atomic or quantified part as a single letter. To them are added the
// quantifier rules and the rules for identity, in the style of forall x:
//
//   ∀E  from ∀x A(x), any instance A(t)
//   ∃I  from A(t), ∃x A(x) (some or all of the t's replaced by x)
//   ∀I  from A(c), ∀x A(x), when c occurs in no premise or open assumption,
//       and not in ∀x A(x)
//   ∃E  from ∃x A(x) and a subproof assuming A(c) and ending with B, B, when
//       c is new: not in ∃x A(x), not in B, in no premise or open assumption
//   =I  t = t anywhere
//   =E  from a = b and a line, the line with some a's written b (or b's a)
//   CQ  (derived) ¬∀x A ⟺ ∃x ¬A and ¬∃x A ⟺ ∀x ¬A
//
// A failed check names the line, the rule and the condition that failed.

import { Formula } from "./formula.js";
import { rules as propRules, ruleSet, applyRule, checkProof, parseProof } from "./fitch.js";
import { FOFormula, Term, fo, foList } from "./predicate.js";

const q = (f) => `"${f}"`;

// ---- propositional rules on first-order formulas -------------------------------------------------

function abstraction() {
  const back = new Map();
  const abs = (f) => {
    if (f.kind === "not") return new Formula("not", abs(f.arg));
    if (["and", "or", "imp", "iff", "xor"].includes(f.kind)) return new Formula(f.kind, abs(f.left), abs(f.right));
    if (f.kind === "top" || f.kind === "bot") return new Formula(f.kind);
    const name = `⟦${f.key}⟧`;
    back.set(name, String(f));
    return new Formula("atom", name);
  };
  const pretty = (text) => {
    let out = text;
    for (const [k, v] of back) out = out.split(k).join(back.size && /[∧∨→↔⊕¬]/.test(v) ? `(${v})` : v);
    return out;
  };
  return { abs, pretty };
}
const lifted = (r) => ({
  ...r,
  check(target, lineCites, subCites) {
    const { abs, pretty } = abstraction();
    const m = applyRule(
      r,
      abs(target),
      lineCites.map((c) => ({ ...c, formula: abs(c.formula) })),
      subCites.map((s) => ({ ...s, assume: abs(s.assume), reach: abs(s.reach) })),
    );
    if (m === null) return null;
    // quoted propositional renderings of first-order parts read back as the parts themselves
    return pretty(m);
  },
});

// ---- terms in formulas ---------------------------------------------------------------------------

const termNames = (t, out) => {
  if (t.kind !== "var") out.add(t.name);
  t.args.forEach((a) => termNames(a, out));
  return out;
};
/** constant and function names that occur in a formula */
function namesIn(f, out = new Set()) {
  if (f.kind === "pred") f.args.forEach((t) => termNames(t, out));
  else if (f.kind === "eq") [f.left, f.right].forEach((t) => termNames(t, out));
  else f.parts.forEach((p) => namesIn(p, out));
  return out;
}
/**
 * Is `inst` the formula `body` with the free occurrences of x replaced by one
 * term t? Returns { term } (term null when x does not occur free), or null.
 */
function instanceTerm(body, x, inst) {
  let found = null;
  let ok = true;
  const tm = (s, t, bound) => {
    if (s.kind === "var" && s.name === x && !bound.has(x)) {
      for (const v of varsOf(t)) if (bound.has(v)) ok = false; // would be captured
      if (found && found.key !== t.key) ok = false;
      found = found ?? t;
      return;
    }
    if (s.kind !== t.kind || s.name !== t.name || s.args.length !== t.args.length) {
      ok = false;
      return;
    }
    s.args.forEach((a, i) => tm(a, t.args[i], bound));
  };
  const go = (a, b, bound) => {
    if (!ok) return;
    if (a.kind !== b.kind) return (ok = false);
    switch (a.kind) {
      case "pred":
        if (a.name !== b.name || a.args.length !== b.args.length) return (ok = false);
        return a.args.forEach((s, i) => tm(s, b.args[i], bound));
      case "eq":
        tm(a.left, b.left, bound);
        return tm(a.right, b.right, bound);
      case "top": case "bot": return;
      case "not": return go(a.arg, b.arg, bound);
      case "all": case "ex":
        if (a.variable !== b.variable) return (ok = false);
        return go(a.body, b.body, new Set([...bound, a.variable]));
      default:
        go(a.left, b.left, bound);
        return go(a.right, b.right, bound);
    }
  };
  go(body, inst, new Set());
  return ok ? { term: found } : null;
}
const varsOf = (t, out = new Set()) => {
  if (t.kind === "var") out.add(t.name);
  t.args.forEach((a) => varsOf(a, out));
  return out;
};
/**
 * Do a and b differ only where one has s and the other has t (in either
 * direction)? A replacement counts only where it is free: no variable of s
 * or t may be bound by a quantifier above that place, or the replacement
 * would capture it (from x = a and ∀x P(a), ∀x P(x) does not follow).
 */
function sameUpTo(a, b, s, t) {
  const sv = varsOf(s);
  const tv = varsOf(t);
  const tm = (x, y, bound) => {
    if (x.key === y.key && x.kind === y.kind) return true;
    if ((x.key === s.key && y.key === t.key) || (x.key === t.key && y.key === s.key)) {
      for (const v of [...sv, ...tv]) if (bound.has(v)) return false;
      return true;
    }
    if (x.kind !== y.kind || x.name !== y.name || x.args.length !== y.args.length) return false;
    return x.args.every((z, i) => tm(z, y.args[i], bound));
  };
  const go = (f, g, bound) => {
    if (f.kind !== g.kind) return false;
    switch (f.kind) {
      case "pred": return f.name === g.name && f.args.length === g.args.length && f.args.every((z, i) => tm(z, g.args[i], bound));
      case "eq": return tm(f.left, g.left, bound) && tm(f.right, g.right, bound);
      case "top": case "bot": return true;
      case "not": return go(f.arg, g.arg, bound);
      case "all": case "ex": return f.variable === g.variable && go(f.body, g.body, new Set([...bound, f.variable]));
      default: return go(f.left, g.left, bound) && go(f.right, g.right, bound);
    }
  };
  return go(a, b, new Set());
}

// ---- the quantifier and identity rules ----------------------------------------------------------

const qrule = (name, aliases, about, check) => ({ name, aliases, about, forms: [], check });
const needs = (name, lines, subs, lc, sc) => (lc.length !== lines || sc.length !== subs ? `${name} cites ${lines ? `${lines === 1 ? "one line" : `${lines} lines`}` : ""}${lines && subs ? " and " : ""}${subs ? "one subproof" : ""}${!lines && !subs ? "nothing" : ""}; here it is given ${lc.length} line${lc.length === 1 ? "" : "s"}${sc.length ? ` and ${sc.length} subproof${sc.length === 1 ? "" : "s"}` : ""}` : null);

const QUANT = [
  qrule("∀E", ["UI", "universal instantiation", "forall E", "AE", "∀ elim"], "from ∀x A(x), any instance A(t)", (target, lc, sc) => {
    const n = needs("∀E", 1, 0, lc, sc);
    if (n) return n;
    const src = lc[0].formula;
    if (src.kind !== "all") return `∀E needs a line that starts with ∀; line ${lc[0].n} reads ${q(src)}`;
    if (!instanceTerm(src.body, src.variable, target)) return `${q(target)} is not an instance of ${q(src)}: replace every free ${src.variable} in ${q(src.body)} by one and the same term`;
    return null;
  }),
  qrule("∃I", ["EG", "existential generalization", "existential generalisation", "exists I", "∃ intro"], "from A(t), ∃x A(x)", (target, lc, sc) => {
    const n = needs("∃I", 1, 0, lc, sc);
    if (n) return n;
    if (target.kind !== "ex") return `∃I gives a formula that starts with ∃; ${q(target)} does not`;
    if (!instanceTerm(target.body, target.variable, lc[0].formula)) return `line ${lc[0].n} (${q(lc[0].formula)}) is not an instance of ${q(target.body)} for ${target.variable}`;
    return null;
  }),
  qrule("∀I", ["UG", "universal generalization", "universal generalisation", "forall I", "∀ intro"], "from A(c) for a c assumed nothing about, ∀x A(x)", (target, lc, sc, ctx) => {
    const n = needs("∀I", 1, 0, lc, sc);
    if (n) return n;
    if (target.kind !== "all") return `∀I gives a formula that starts with ∀; ${q(target)} does not`;
    const src = lc[0].formula;
    const m = instanceTerm(target.body, target.variable, src);
    if (!m) return `line ${lc[0].n} (${q(src)}) is not an instance of ${q(target.body)} for ${target.variable}`;
    if (m.term === null) return null;
    const c = m.term;
    if (c.kind !== "const") return `∀I generalises on a name; line ${lc[0].n} has ${c} in place of ${target.variable}, which is not a constant`;
    if (namesIn(target).has(c.name)) return `${c} still occurs in ${q(target)}: ∀I must replace every ${c}`;
    const where = [...ctx.premises.map((p) => ["premise", p]), ...ctx.open.map((a) => ["open assumption", a])].find(([, f]) => namesIn(f).has(c.name));
    if (where) return `${c} occurs in the ${where[0]} ${q(where[1])}, so what holds of ${c} need not hold of everything`;
    return null;
  }),
  qrule("∃E", ["EI", "existential instantiation", "exists E", "∃ elim"], "from ∃x A(x) and a subproof from A(c) to B with c new, B", (target, lc, sc, ctx) => {
    const n = needs("∃E", 1, 1, lc, sc);
    if (n) return n;
    const ex = lc[0].formula;
    const s = sc[0];
    if (ex.kind !== "ex") return `∃E needs a line that starts with ∃; line ${lc[0].n} reads ${q(ex)}`;
    if (s.reach.key !== target.key) return `the subproof ${s.first}-${s.last} ends with ${q(s.reach)}, not ${q(target)}`;
    const m = instanceTerm(ex.body, ex.variable, s.assume);
    if (!m) return `the subproof ${s.first}-${s.last} must assume an instance of ${q(ex.body)}; it assumes ${q(s.assume)}`;
    if (m.term === null) return null;
    const c = m.term;
    if (c.kind !== "const") return `the subproof must assume ${q(ex.body)} with a new name for ${ex.variable}; it uses ${c}`;
    if (namesIn(ex).has(c.name)) return `${c} already occurs in ${q(ex)}; the name for the witness must be new`;
    if (namesIn(target).has(c.name)) return `${c} occurs in ${q(target)}, so the conclusion would say something about the witness`;
    const where = [...ctx.premises.map((p) => ["premise", p]), ...ctx.open.map((a) => ["open assumption", a])].find(([, f]) => namesIn(f).has(c.name));
    if (where) return `${c} occurs in the ${where[0]} ${q(where[1])}; the name for the witness must be new`;
    return null;
  }),
  qrule("=I", ["identity introduction", "reflexivity", "refl", "= intro"], "t = t may be written anywhere", (target, lc, sc) => {
    const n = needs("=I", 0, 0, lc, sc);
    if (n) return n;
    if (target.kind !== "eq" || target.left.key !== target.right.key) return `=I gives t = t, the same term on both sides; ${q(target)} is not of that form`;
    return null;
  }),
  qrule("=E", ["identity elimination", "LL", "leibniz", "substitution of identicals", "indiscernibility", "= elim"], "from a = b and a line, the line with some a's written b (or b's written a)", (target, lc, sc) => {
    const n = needs("=E", 2, 0, lc, sc);
    if (n) return n;
    for (const [e, other] of [[lc[0], lc[1]], [lc[1], lc[0]]]) {
      if (e.formula.kind !== "eq") continue;
      if (sameUpTo(other.formula, target, e.formula.left, e.formula.right)) return null;
    }
    if (lc[0].formula.kind !== "eq" && lc[1].formula.kind !== "eq") return `=E needs an identity a = b among the lines it cites`;
    return `${q(target)} is not the other line with some free occurrences of one side of the identity written as the other (a replacement under a quantifier that binds one of its variables would capture it)`;
  }),
];
const CQ = qrule("CQ", ["quantifier negation", "QN", "conversion of quantifiers"], "¬∀x A and ∃x ¬A, and ¬∃x A and ∀x ¬A, each from the other", (target, lc, sc) => {
  const n = needs("CQ", 1, 0, lc, sc);
  if (n) return n;
  const pairs = (a, b) =>
    (a.kind === "not" && a.arg.kind === "all" && b.kind === "ex" && b.variable === a.arg.variable && b.body.kind === "not" && b.body.arg.key === a.arg.body.key) ||
    (a.kind === "not" && a.arg.kind === "ex" && b.kind === "all" && b.variable === a.arg.variable && b.body.kind === "not" && b.body.arg.key === a.arg.body.key);
  const src = lc[0].formula;
  return pairs(src, target) || pairs(target, src) ? null : `CQ turns ¬∀x A into ∃x ¬A, ¬∃x A into ∀x ¬A, or back; ${q(src)} and ${q(target)} are not such a pair`;
});

const make = (name, base, extra, logic) => {
  const set = ruleSet(name, [...base.rules.map(lifted), ...QUANT, ...extra], { logic });
  return Object.freeze({ ...set, read: fo, readList: foList });
};
/**
 * Rule sets for first-order natural deduction:
 *   foRules.intuitionistic, foRules.classical (default), foRules.derived (with CQ)
 */
export const foRules = Object.freeze({
  intuitionistic: make("intuitionistic first-order natural deduction", propRules.intuitionistic, [], "intuitionistic"),
  classical: make("classical first-order natural deduction", propRules.classical, [], "classical"),
  derived: make("classical first-order natural deduction with derived rules", propRules.derived, [CQ], "classical"),
});

/** Read a first-order Fitch proof from text (the same layout as parseProof). */
export const parseFOProof = (text, { rules = foRules.derived } = {}) => parseProof(text, { rules });
/**
 * Check a first-order proof: the same report as checkProof, with the
 * quantifier and identity rules and their conditions on names.
 */
export const checkFOProof = (input, { rules = foRules.classical, premises, conclusion } = {}) => checkProof(input, { rules, premises, conclusion });

export { FOFormula, Term };
