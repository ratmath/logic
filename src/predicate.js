// Predicate logic: terms and formulas with quantifiers, equality and function
// symbols; free and bound variables and substitution that never captures;
// prenex and Skolem forms; finite structures in which a sentence is
// evaluated with its reasons; and a search for a model (or a countermodel) up
// to a stated size, by grounding the sentences over a finite domain and
// handing them to the satisfiability solver. Any model found is checked by
// evaluating every sentence in it before it is returned. "No model up to
// size 4" is reported as exactly that, never as validity.

import { Formula, refuse, LogicError, TRUE, FALSE } from "./formula.js";
import { foldConstants } from "./normal.js";
import { satisfiable } from "./sat.js";

// ---- terms ------------------------------------------------------------------------------------

/** A term: a variable, a constant, or a function symbol applied to terms. */
export class Term {
  constructor(kind, name, args = []) {
    this.kind = kind; // "var" | "const" | "fn"
    this.name = name;
    this.args = args;
    this.key = kind === "fn" ? `${name}(${args.map((a) => a.key).join(",")})` : kind === "var" ? `${name}` : `${name}`;
    Object.freeze(this);
  }
  toString() {
    return this.kind === "fn" ? `${this.name}(${this.args.map(String).join(", ")})` : this.name;
  }
  equals(t) {
    return t instanceof Term && t.key === this.key && t.kind === this.kind;
  }
}
const V = (name) => new Term("var", name);
const C = (name) => new Term("const", name);
const termVars = (t, out = new Set()) => {
  if (t.kind === "var") out.add(t.name);
  else t.args.forEach((a) => termVars(a, out));
  return out;
};
const substTerm = (t, x, s) => (t.kind === "var" ? (t.name === x ? s : t) : t.kind === "fn" ? new Term("fn", t.name, t.args.map((a) => substTerm(a, x, s))) : t);
/** Is the name a variable when nothing binds it? u, v, w, x, y, z with digits or primes. */
export const isVariableName = (name) => /^[u-z][0-9]*'*$/.test(name);

// ---- formulas ---------------------------------------------------------------------------------

const BIN = new Set(["and", "or", "imp", "iff", "xor"]);
const SYM = {
  unicode: { not: "¬", and: "∧", or: "∨", imp: "→", iff: "↔", xor: "⊕", top: "⊤", bot: "⊥", all: "∀", ex: "∃", eq: "=", neq: "≠" },
  ascii: { not: "~", and: "&", or: "|", imp: "->", iff: "<->", xor: "xor", top: "true", bot: "false", all: "forall ", ex: "exists ", eq: "=", neq: "!=" },
  tex: { not: "\\lnot ", and: "\\land", or: "\\lor", imp: "\\to", iff: "\\leftrightarrow", xor: "\\oplus", top: "\\top", bot: "\\bot", all: "\\forall ", ex: "\\exists ", eq: "=", neq: "\\neq" },
};

/**
 * A first-order formula. kind: pred (name, args), eq (left, right terms),
 * top, bot, not (arg), and/or/imp/iff/xor (left, right), all/ex (variable,
 * body). Immutable; `key` is shared by exactly the formulas that are the same
 * tree (bound variables keep their names, so ∀x P(x) and ∀y P(y) differ;
 * `alphaEquals` treats them as the same).
 */
export class FOFormula {
  constructor(kind, a, b) {
    this.kind = kind;
    if (kind === "pred") {
      this.name = a;
      this.args = b ?? [];
      this.key = this.args.length ? `${a}(${this.args.map((t) => t.key).join(",")})` : a;
    } else if (kind === "eq") {
      this.left = a;
      this.right = b;
      this.key = `${a.key}=${b.key}`;
    } else if (kind === "top" || kind === "bot") this.key = SYM.unicode[kind];
    else if (kind === "not") {
      this.arg = a;
      this.key = "¬" + a.key;
    } else if (BIN.has(kind)) {
      this.left = a;
      this.right = b;
      this.key = "(" + a.key + SYM.unicode[kind] + b.key + ")";
    } else if (kind === "all" || kind === "ex") {
      this.variable = a;
      this.body = b;
      this.key = SYM.unicode[kind] + a + "." + b.key;
    } else throw new TypeError(`unknown kind of formula: ${kind}`);
    Object.freeze(this);
  }
  get isQuantifier() {
    return this.kind === "all" || this.kind === "ex";
  }
  get isAtomic() {
    return this.kind === "pred" || this.kind === "eq";
  }
  get parts() {
    return this.kind === "not" ? [this.arg] : BIN.has(this.kind) ? [this.left, this.right] : this.isQuantifier ? [this.body] : [];
  }
  equals(other) {
    return other instanceof FOFormula ? other.key === this.key : fo(other).key === this.key;
  }
  /** The same up to the names of bound variables. */
  alphaEquals(other) {
    return canonical(this).key === canonical(fo(other)).key;
  }
  /** Variables that occur free, in a steady order. */
  freeVariables() {
    const out = new Set();
    const go = (f, bound) => {
      if (f.kind === "pred") f.args.forEach((t) => termVars(t).forEach((v) => !bound.has(v) && out.add(v)));
      else if (f.kind === "eq") [f.left, f.right].forEach((t) => termVars(t).forEach((v) => !bound.has(v) && out.add(v)));
      else if (f.isQuantifier) go(f.body, new Set([...bound, f.variable]));
      else f.parts.forEach((p) => go(p, bound));
    };
    go(this, new Set());
    return [...out].sort();
  }
  /** A sentence has no free variables. */
  get isSentence() {
    return this.freeVariables().length === 0;
  }
  /** The symbols used: { predicates: Map(name → arity), functions: Map(name → arity), constants: [names] }. */
  signature() {
    const predicates = new Map();
    const functions = new Map();
    const constants = new Set();
    const term = (t) => {
      if (t.kind === "const") constants.add(t.name);
      if (t.kind === "fn") {
        functions.set(t.name, t.args.length);
        t.args.forEach(term);
      }
    };
    const go = (f) => {
      if (f.kind === "pred") {
        if (predicates.has(f.name) && predicates.get(f.name) !== f.args.length) refuse("arity", `${f.name} is used with ${predicates.get(f.name)} and with ${f.args.length} arguments`);
        predicates.set(f.name, f.args.length);
        f.args.forEach(term);
      } else if (f.kind === "eq") [f.left, f.right].forEach(term);
      else f.parts.forEach(go);
    };
    go(this);
    return { predicates, functions, constants: [...constants].sort() };
  }
  /**
   * Replace the free occurrences of variable x by a term. Bound variables are
   * renamed where they would capture a variable of the term.
   */
  substitute(x, term) {
    const t = typeof term === "string" ? parseTerm(term) : term;
    const tv = termVars(t);
    const go = (f) => {
      switch (f.kind) {
        case "pred": return new FOFormula("pred", f.name, f.args.map((a) => substTerm(a, x, t)));
        case "eq": return new FOFormula("eq", substTerm(f.left, x, t), substTerm(f.right, x, t));
        case "top": case "bot": return f;
        case "not": return new FOFormula("not", go(f.arg));
        case "all": case "ex": {
          if (f.variable === x) return f;
          if (!f.body.freeVariables().includes(x)) return f;
          if (tv.has(f.variable)) {
            const fresh = freshVariable(f.variable, new Set([...tv, ...f.body.freeVariables(), ...allVariables(f.body)]));
            return new FOFormula(f.kind, fresh, go(f.body.substitute(f.variable, V(fresh))));
          }
          return new FOFormula(f.kind, f.variable, go(f.body));
        }
        default: return new FOFormula(f.kind, go(f.left), go(f.right));
      }
    };
    return go(this);
  }
  toString({ style = "unicode" } = {}) {
    const s = SYM[style] ?? refuse("bad-argument", `unknown style ${style}`);
    const tm = (t) => (t.kind === "fn" ? `${t.name}(${t.args.map(tm).join(", ")})` : t.name);
    const tight = (f) => !BIN.has(f.kind);
    const show = (f) => {
      switch (f.kind) {
        case "pred": return f.args.length ? `${f.name}(${f.args.map(tm).join(", ")})` : f.name;
        case "eq": return `${tm(f.left)} ${s.eq} ${tm(f.right)}`;
        case "top": case "bot": return s[f.kind];
        case "not":
          if (f.arg.kind === "eq") return `${tm(f.arg.left)} ${s.neq} ${tm(f.arg.right)}`;
          return s.not + (tight(f.arg) && f.arg.kind !== "eq" ? show(f.arg) : `(${show(f.arg)})`);
        case "all": case "ex": {
          const b = f.body;
          return `${s[f.kind]}${f.variable}${style === "ascii" ? "." : " "}${tight(b) && b.kind !== "eq" ? show(b) : `(${show(b)})`}`;
        }
        default: {
          const chain = f.kind === "and" || f.kind === "or";
          const l = tight(f.left) || (chain && f.left.kind === f.kind) ? show(f.left) : `(${show(f.left)})`;
          const r = tight(f.right) ? show(f.right) : `(${show(f.right)})`;
          return `${l} ${s[f.kind]} ${r}`;
        }
      }
    };
    return show(this);
  }
  toTeX() {
    return this.toString({ style: "tex" });
  }
  toJSON() {
    return this.toString();
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `FOFormula(${this.toString()})`;
  }
}
const allVariables = (f, out = new Set()) => {
  if (f.kind === "pred") f.args.forEach((t) => termVars(t, out));
  else if (f.kind === "eq") [f.left, f.right].forEach((t) => termVars(t, out));
  else {
    if (f.isQuantifier) out.add(f.variable);
    f.parts.forEach((p) => allVariables(p, out));
  }
  return out;
};
function freshVariable(base, used) {
  const stem = base.replace(/[0-9']+$/, "");
  for (let i = 1; ; i++) if (!used.has(stem + i)) return stem + i;
}
/** Bound variables renamed v1, v2, … in order: equal keys mean alphabetic variants. */
function canonical(f) {
  let n = 0;
  const go = (g) => {
    if (g.isQuantifier) {
      const v = `_${++n}`;
      return new FOFormula(g.kind, v, go(g.body.substitute(g.variable, V(v))));
    }
    if (g.kind === "not") return new FOFormula("not", go(g.arg));
    if (BIN.has(g.kind)) return new FOFormula(g.kind, go(g.left), go(g.right));
    return g;
  };
  return go(f);
}

export const FTRUE = new FOFormula("top");
export const FFALSE = new FOFormula("bot");

// ---- the parser -------------------------------------------------------------------------------

const TOKENS = [
  ["<->", "iff"], ["<=>", "iff"], ["↔", "iff"], ["≡", "iff"], ["⇔", "iff"],
  ["->", "imp"], ["=>", "imp"], ["→", "imp"], ["⊃", "imp"], ["⇒", "imp"],
  ["/\\", "and"], ["&&", "and"], ["&", "and"], ["∧", "and"], ["^", "and"],
  ["\\/", "or"], ["||", "or"], ["|", "or"], ["∨", "or"],
  ["⊕", "xor"],
  ["!=", "neq"], ["≠", "neq"], ["/=", "neq"],
  ["=", "eq"],
  ["¬", "not"], ["~", "not"], ["!", "not"], ["∼", "not"],
  ["⊤", "top"], ["⊥", "bot"], ["_|_", "bot"],
  ["∀", "all"], ["∃", "ex"], ["\\A", "all"], ["\\E", "ex"],
  ["(", "("], [")", ")"], ["[", "("], ["]", ")"], [",", ","], [".", "."], [":", "."],
];
const WORDS = { not: "not", and: "and", or: "or", implies: "imp", iff: "iff", xor: "xor", true: "top", false: "bot", forall: "all", exists: "ex", all: "all", some: "ex" };

function lex(text) {
  const out = [];
  let i = 0;
  scan: while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    for (const [s, type] of TOKENS) {
      if (text.startsWith(s, i)) {
        out.push({ type, at: i, text: s });
        i += s.length;
        continue scan;
      }
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*'*/.exec(text.slice(i)) || /^[0-9]+/.exec(text.slice(i));
    if (m) {
      out.push(Object.hasOwn(WORDS, m[0]) ? { type: WORDS[m[0]], at: i, text: m[0] } : { type: "name", at: i, text: m[0] });
      i += m[0].length;
      continue;
    }
    refuse("syntax", `unexpected "${text[i]}" at position ${i + 1} in "${text}"`, { position: i });
  }
  return out;
}

/**
 * Read a first-order formula.
 *   ∀x P(x)   forall x. P(x)   \A x: P(x)      ∃x …   exists x …
 *   predicates start with a capital letter: P, Loves(a, b), Even(f(x))
 *   terms: variables (bound, or u–z when free), constants (a, b, c, 0, john),
 *   function symbols applied to terms: f(x), plus(x, y)
 *   equality t = s, t ≠ s (also !=)
 * Connectives as in propositional formulas. A quantifier binds as tightly as
 * ¬: ∀x P(x) → Q reads (∀x P(x)) → Q; write ∀x (P(x) → Q(x)) for the other.
 */
export function parseFO(text) {
  if (typeof text !== "string") throw new TypeError("parseFO takes text");
  const toks = lex(text);
  let pos = 0;
  const peek = (k = 0) => toks[pos + k]?.type;
  const fail = (what) => {
    const t = toks[pos];
    refuse("syntax", t ? `${what}, but found "${t.text}" at position ${t.at + 1} in "${text}"` : `${what}, but "${text}" ends`, { position: t ? t.at : text.length });
  };
  const expect = (type, what) => {
    if (peek() !== type) fail(what);
    return toks[pos++];
  };
  const term = (bound) => {
    const t = toks[pos];
    if (!t || t.type !== "name") fail("a term was expected");
    pos++;
    if (/^[A-Z]/.test(t.text)) refuse("syntax", `"${t.text}" starts with a capital letter, so it is a predicate, but a term was expected at position ${t.at + 1}`);
    if (peek() === "(") {
      pos++;
      const args = [term(bound)];
      while (peek() === ",") {
        pos++;
        args.push(term(bound));
      }
      expect(")", 'a ")" was expected');
      return new Term("fn", t.text, args);
    }
    return bound.has(t.text) || isVariableName(t.text) ? V(t.text) : C(t.text);
  };
  const level = (ops, next, right) => {
    const go = (bound) => {
      let left = next(bound);
      while (ops.includes(peek())) {
        const kind = toks[pos++].type;
        if (right) return new FOFormula(kind, left, go(bound));
        left = new FOFormula(kind, left, next(bound));
      }
      return left;
    };
    return go;
  };
  const unary = (bound) => {
    const t = toks[pos];
    if (!t) fail("a formula was expected");
    if (t.type === "not") {
      pos++;
      return new FOFormula("not", unary(bound));
    }
    if (t.type === "all" || t.type === "ex") {
      pos++;
      const v = expect("name", "a variable was expected after the quantifier");
      if (/^[A-Z]/.test(v.text)) refuse("syntax", `"${v.text}" cannot be a variable: it starts with a capital letter`);
      if (peek() === ".") pos++;
      return new FOFormula(t.type, v.text, unary(new Set([...bound, v.text])));
    }
    if (t.type === "top" || t.type === "bot") {
      pos++;
      return t.type === "top" ? FTRUE : FFALSE;
    }
    if (t.type === "(") {
      // a bracketed formula, or a bracketed term followed by = (rare); formulas first
      const save = pos;
      pos++;
      try {
        const inner = iffLevel(bound);
        if (peek() !== ")") fail('a ")" was expected');
        pos++;
        return inner;
      } catch (e) {
        if (!(e instanceof LogicError)) throw e;
        pos = save;
        throw e;
      }
    }
    if (t.type === "name") {
      if (/^[A-Z]/.test(t.text)) {
        pos++;
        const args = [];
        if (peek() === "(") {
          pos++;
          args.push(term(bound));
          while (peek() === ",") {
            pos++;
            args.push(term(bound));
          }
          expect(")", 'a ")" was expected');
        }
        return new FOFormula("pred", t.text, args);
      }
      const left = term(bound);
      const op = peek();
      if (op !== "eq" && op !== "neq") fail(`"${left}" is a term; a formula needs a predicate (capital letter) or = here`);
      pos++;
      const right = term(bound);
      const e = new FOFormula("eq", left, right);
      return op === "eq" ? e : new FOFormula("not", e);
    }
    return fail("a formula was expected");
  };
  const andLevel = level(["and"], unary);
  const xorLevel = level(["xor"], andLevel);
  const orLevel = level(["or"], xorLevel);
  const impLevel = level(["imp"], orLevel, true);
  const iffLevel = level(["iff"], impLevel);
  const result = iffLevel(new Set());
  if (pos < toks.length) fail("a connective was expected");
  return result;
}
/** A term from text: x, a, f(x, b). */
export function parseTerm(text) {
  const f = parseFO(`${text} = ${text}`);
  return f.left;
}
/** A first-order formula from a formula or text. */
export function fo(x) {
  if (x instanceof FOFormula) return x;
  if (typeof x === "string") return parseFO(x);
  throw new TypeError(`cannot read ${x} as a first-order formula`);
}
const fos = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x.map(fo) : typeof x === "string" ? (x.trim() ? splitTop(x).map(parseFO) : []) : [fo(x)]);
/** split "A, B; C" at commas that are not inside brackets */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if ((ch === "," || ch === ";") && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.filter((x) => x.trim());
}
export { fos as foList };

// ---- normal forms -------------------------------------------------------------------------------

/** Negation normal form: only ∧, ∨, quantifiers, and ¬ on atomic formulas. */
export function foNnf(input) {
  const go = (f, neg) => {
    switch (f.kind) {
      case "pred": case "eq": return neg ? new FOFormula("not", f) : f;
      case "top": return neg ? FFALSE : FTRUE;
      case "bot": return neg ? FTRUE : FFALSE;
      case "not": return go(f.arg, !neg);
      case "and": return new FOFormula(neg ? "or" : "and", go(f.left, neg), go(f.right, neg));
      case "or": return new FOFormula(neg ? "and" : "or", go(f.left, neg), go(f.right, neg));
      case "imp": return neg ? new FOFormula("and", go(f.left, false), go(f.right, true)) : new FOFormula("or", go(f.left, true), go(f.right, false));
      case "iff": {
        const [a, b] = [f.left, f.right];
        return neg
          ? new FOFormula("or", new FOFormula("and", go(a, false), go(b, true)), new FOFormula("and", go(a, true), go(b, false)))
          : new FOFormula("and", new FOFormula("or", go(a, true), go(b, false)), new FOFormula("or", go(a, false), go(b, true)));
      }
      case "xor": return go(new FOFormula("iff", f.left, f.right), !neg);
      default: return new FOFormula(neg ? (f.kind === "all" ? "ex" : "all") : f.kind, f.variable, go(f.body, neg));
    }
  };
  return go(fo(input), false);
}
/**
 * Prenex form: every quantifier moved to the front, after renaming bound
 * variables apart. Equivalent to the input.
 */
export function prenex(input) {
  const f0 = foNnf(input);
  const claimed = new Set(f0.freeVariables());
  const used = new Set([...allVariables(f0), ...claimed]);
  const rename = (f) => {
    if (f.isQuantifier) {
      let v = f.variable;
      if (claimed.has(v)) v = freshVariable(f.variable, used);
      claimed.add(v);
      used.add(v);
      return new FOFormula(f.kind, v, rename(f.body.substitute(f.variable, V(v))));
    }
    if (f.kind === "not") return new FOFormula("not", rename(f.arg));
    if (BIN.has(f.kind)) return new FOFormula(f.kind, rename(f.left), rename(f.right));
    return f;
  };
  const apart = rename(f0);
  const pull = (f) => {
    if (f.isQuantifier) {
      const inner = pull(f.body);
      return { prefix: [{ kind: f.kind, variable: f.variable }, ...inner.prefix], matrix: inner.matrix };
    }
    if (f.kind === "and" || f.kind === "or") {
      const l = pull(f.left);
      const r = pull(f.right);
      return { prefix: [...l.prefix, ...r.prefix], matrix: new FOFormula(f.kind, l.matrix, r.matrix) };
    }
    return { prefix: [], matrix: f };
  };
  const { prefix, matrix } = pull(apart);
  return prefix.reduceRight((body, q) => new FOFormula(q.kind, q.variable, body), matrix);
}
/**
 * Skolem form of a sentence: prenex, then each ∃ replaced by a new function
 * of the ∀ variables before it (a new constant when there are none).
 * Satisfiable exactly when the input is (not equivalent to it).
 */
export function skolemize(input) {
  const p = prenex(input);
  const sig = p.signature();
  const used = new Set([...sig.constants, ...sig.functions.keys()]);
  const universals = [];
  let f = p;
  let n = 0;
  const fresh = (base) => {
    let name;
    do name = `${base}${++n}`;
    while (used.has(name));
    used.add(name);
    return name;
  };
  const prefix = [];
  while (f.isQuantifier) {
    if (f.kind === "all") {
      universals.push(f.variable);
      prefix.push(f.variable);
      f = f.body;
    } else {
      const t = universals.length ? new Term("fn", fresh("sk"), universals.map(V)) : C(fresh("c"));
      f = f.body.substitute(f.variable, t);
    }
  }
  return prefix.reduceRight((body, v) => new FOFormula("all", v, body), f);
}

// ---- finite structures ---------------------------------------------------------------------------

const tupleKey = (xs) => xs.map(String).join(",");
/**
 * A finite structure (interpretation).
 *   structure({ domain: [1, 2, 3] or 3, constants: { a: 1 },
 *               functions: { f: (x) => …  or  { "1": 2, "2": 3, … } },
 *               predicates: { P: [1, 3]  or [[1, 2], [2, 3]]  or (x, y) => … } })
 * Predicates given as lists hold exactly for the elements (or tuples) listed;
 * a zero-place predicate (a sentence letter) is true or false.
 */
export class Structure {
  constructor({ domain, constants = {}, functions = {}, predicates = {} }) {
    this._spec = { functions, predicates };
    const D = typeof domain === "number" ? Array.from({ length: domain }, (_, i) => i) : [...domain];
    if (!D.length) refuse("bad-structure", "a domain is not empty");
    this.domain = D;
    this.index = new Map(D.map((d, i) => [String(d), i]));
    if (this.index.size !== D.length) refuse("bad-structure", "the domain lists an element twice");
    const inD = (x, what) => {
      if (!this.index.has(String(x))) refuse("bad-structure", `${what} is ${x}, which is not in the domain`);
      return D[this.index.get(String(x))];
    };
    this.constants = Object.fromEntries(Object.entries(constants).map(([k, v]) => [k, inD(v, `constant ${k}`)]));
    this.functions = Object.fromEntries(
      Object.entries(functions).map(([k, v]) => {
        if (typeof v === "function") return [k, (...xs) => inD(v(...xs), `${k}(${xs.join(", ")})`)];
        const table = new Map(Object.entries(v).map(([a, b]) => [a.replace(/\s/g, ""), b]));
        return [k, (...xs) => (table.has(tupleKey(xs)) ? inD(table.get(tupleKey(xs)), `${k}(${xs})`) : refuse("bad-structure", `${k}(${xs.join(", ")}) is not given`))];
      }),
    );
    this.predicates = Object.fromEntries(
      Object.entries(predicates).map(([k, v]) => {
        if (typeof v === "function") return [k, (...xs) => Boolean(v(...xs))];
        if (typeof v === "boolean") return [k, () => v];
        const set = new Set(v.map((t) => (Array.isArray(t) ? tupleKey(t) : String(t))));
        return [k, (...xs) => set.has(tupleKey(xs))];
      }),
    );
    this.size = D.length;
  }
  /** The value of a term under an assignment of variables. */
  term(t, env = {}) {
    if (t.kind === "var") {
      if (!(t.name in env)) refuse("free-variable", `${t.name} is free and has no value`);
      return env[t.name];
    }
    if (t.kind === "const") {
      if (t.name in this.constants) return this.constants[t.name];
      if (this.index.has(t.name)) return this.domain[this.index.get(t.name)];
      return refuse("bad-structure", `the structure does not interpret the constant ${t.name}`);
    }
    const fn = this.functions[t.name] ?? refuse("bad-structure", `the structure does not interpret the function ${t.name}`);
    return fn(...t.args.map((a) => this.term(a, env)));
  }
  /** Is the formula true here (with values for its free variables)? */
  holds(f, env = {}) {
    return evaluate(f, this, { assignment: env }).value;
  }
  /**
   * The structure as plain data: { domain, constants, functions, predicates },
   * with each function as a table ("1,2" → value) and each predicate as the
   * list of elements or tuples where it holds.
   */
  describe() {
    const D = this.domain;
    const tuples = (k) => (k === 0 ? [[]] : tuples(k - 1).flatMap((t) => D.map((d) => [...t, d])));
    const arity = (v, given) => (typeof v === "function" ? v.length : Array.isArray(given) ? (Array.isArray(given[0]) ? given[0].length : 1) : 0);
    const functions = {};
    for (const [k, v] of Object.entries(this._spec.functions)) {
      if (typeof v !== "function") functions[k] = { ...v };
      else functions[k] = Object.fromEntries(tuples(v.length).map((t) => [t.join(","), this.functions[k](...t)]));
    }
    const predicates = {};
    for (const [k, v] of Object.entries(this._spec.predicates)) {
      if (typeof v === "boolean") predicates[k] = v;
      else if (Array.isArray(v)) predicates[k] = v.map((t) => (Array.isArray(t) ? [...t] : t));
      else {
        const n = arity(v);
        predicates[k] = n === 0 ? this.predicates[k]() : tuples(n).filter((t) => this.predicates[k](...t)).map((t) => (n === 1 ? t[0] : t));
      }
    }
    return { domain: [...D], constants: { ...this.constants }, functions, predicates };
  }
  /** Alias of describe(). */
  get extensions() {
    return this.describe();
  }
}
export const structure = (spec) => (spec instanceof Structure ? spec : new Structure(spec));

/**
 * Evaluate a formula in a structure, with the reasons:
 *   { value, reason }  where reason explains the top-level answer: for ∀ that
 * fails, a counterexample; for ∃ that holds, a witness; for a connective, the
 * values of its parts. `explain: true` gives the full tree in `steps`.
 */
export function evaluate(input, struct, { assignment = {}, explain = false } = {}) {
  const f = fo(input);
  const M = structure(struct);
  const free = f.freeVariables().filter((v) => !(v in assignment));
  if (free.length) refuse("free-variable", `${free.join(", ")} ${free.length > 1 ? "are" : "is"} free; give values with { assignment }`);
  const show = (g, env) => {
    const names = Object.keys(env);
    return names.length ? `${g} with ${names.map((n) => `${n} = ${env[n]}`).join(", ")}` : String(g);
  };
  const go = (g, env, depth) => {
    const note = (value, why, kids = []) => ({ formula: g, env: { ...env }, value, why, kids });
    switch (g.kind) {
      case "top": return note(true, "⊤ is true");
      case "bot": return note(false, "⊥ is false");
      case "pred": {
        const p = M.predicates[g.name];
        if (!p) refuse("bad-structure", `the structure does not interpret the predicate ${g.name}`);
        const xs = g.args.map((t) => M.term(t, env));
        const v = p(...xs);
        return note(v, `${g.name}${xs.length ? `(${xs.join(", ")})` : ""} is ${v ? "in" : "not in"} the extension of ${g.name}`);
      }
      case "eq": {
        const [a, b] = [M.term(g.left, env), M.term(g.right, env)];
        const v = String(a) === String(b);
        return note(v, `${g.left} is ${a} and ${g.right} is ${b}`);
      }
      case "not": {
        const k = go(g.arg, env, depth + 1);
        return note(!k.value, `its part is ${k.value}`, [k]);
      }
      case "and": case "or": case "imp": case "iff": case "xor": {
        const l = go(g.left, env, depth + 1);
        const short = (g.kind === "and" && !l.value) || (g.kind === "or" && l.value) || (g.kind === "imp" && !l.value);
        if (short) return note(g.kind !== "and", `the left part is ${l.value}`, [l]);
        const r = go(g.right, env, depth + 1);
        const v = g.kind === "and" ? r.value : g.kind === "or" ? r.value : g.kind === "imp" ? r.value : g.kind === "iff" ? l.value === r.value : l.value !== r.value;
        return note(v, `the parts are ${l.value} and ${r.value}`, [l, r]);
      }
      default: {
        const kids = [];
        for (const d of M.domain) {
          const k = go(g.body, { ...env, [g.variable]: d }, depth + 1);
          if (explain) kids.push(k);
          if (g.kind === "all" && !k.value) return { ...note(false, `fails for ${g.variable} = ${d}`, explain ? kids : [k]), counterexample: d };
          if (g.kind === "ex" && k.value) return { ...note(true, `holds for ${g.variable} = ${d}`, explain ? kids : [k]), witness: d };
        }
        return note(g.kind === "all", g.kind === "all" ? `holds for every ${g.variable} in the domain` : `fails for every ${g.variable} in the domain`, kids);
      }
    }
  };
  const tree = go(f, assignment, 0);
  const steps = [];
  if (explain) {
    const walk = (n, depth) => {
      steps.push(`${"  ".repeat(depth)}${show(n.formula, n.env)}: ${n.value ? "true" : "false"} (${n.why})`);
      n.kids.forEach((k) => walk(k, depth + 1));
    };
    walk(tree, 0);
  }
  return { value: tree.value, reason: tree.why, witness: tree.witness, counterexample: tree.counterexample, steps: explain ? steps : undefined };
}

// ---- model search by grounding --------------------------------------------------------------------

/**
 * Ground sentences over the domain {0, …, n−1}: a propositional formula
 * whose atoms are "P(0,1)" for predicates, "f(0)=1" and "a=2" for functions
 * and constants (with exactly-one constraints).
 */
function ground(sentences, n, sig) {
  const D = Array.from({ length: n }, (_, i) => i);
  const ids = new Map();
  const A = (name) => {
    if (!ids.has(name)) ids.set(name, `g${ids.size}`);
    return new Formula("atom", ids.get(name));
  };
  const conj = (xs) => (xs.length ? xs.reduce((a, b) => new Formula("and", a, b)) : TRUE);
  const disj = (xs) => (xs.length ? xs.reduce((a, b) => new Formula("or", a, b)) : FALSE);
  const constraints = [];
  const exactlyOne = (names) => {
    constraints.push(disj(names.map(A)));
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) constraints.push(new Formula("not", new Formula("and", A(names[i]), A(names[j]))));
  };
  const tuples = (k) => (k === 0 ? [[]] : tuples(k - 1).flatMap((t) => D.map((d) => [...t, d])));
  for (const c of sig.constants) exactlyOne(D.map((d) => `${c}=${d}`));
  for (const [fn, k] of sig.functions) for (const t of tuples(k)) exactlyOne(D.map((d) => `${fn}(${t})=${d}`));
  // a term's possible values: [{ cond, value }]
  const termCases = (t, env) => {
    if (t.kind === "var") return [{ cond: TRUE, value: env[t.name] }];
    if (t.kind === "const") return D.map((d) => ({ cond: A(`${t.name}=${d}`), value: d }));
    const argCases = t.args.map((a) => termCases(a, env));
    const combos = argCases.reduce((acc, cs) => acc.flatMap((x) => cs.map((c) => [...x, c])), [[]]);
    return combos.flatMap((combo) => D.map((d) => ({ cond: conj([...combo.map((c) => c.cond).filter((c) => c.kind !== "top"), A(`${t.name}(${combo.map((c) => c.value)})=${d}`)]), value: d })));
  };
  const go = (f, env) => {
    switch (f.kind) {
      case "top": return TRUE;
      case "bot": return FALSE;
      case "pred": {
        const argCases = f.args.map((a) => termCases(a, env));
        const combos = argCases.reduce((acc, cs) => acc.flatMap((x) => cs.map((c) => [...x, c])), [[]]);
        return disj(combos.map((combo) => conj([...combo.map((c) => c.cond).filter((c) => c.kind !== "top"), A(f.args.length ? `${f.name}(${combo.map((c) => c.value)})` : f.name)])));
      }
      case "eq": {
        const L = termCases(f.left, env);
        const R = termCases(f.right, env);
        const out = [];
        for (const l of L) for (const r of R) if (l.value === r.value) out.push(conj([l.cond, r.cond].filter((c) => c.kind !== "top")));
        return disj(out);
      }
      case "not": return new Formula("not", go(f.arg, env));
      case "all": return conj(D.map((d) => go(f.body, { ...env, [f.variable]: d })));
      case "ex": return disj(D.map((d) => go(f.body, { ...env, [f.variable]: d })));
      default: return new Formula(f.kind, go(f.left, env), go(f.right, env));
    }
  };
  const out = [...constraints, ...sentences.map((s) => go(s, {}))].map(foldConstants);
  out.ids = ids;
  return out;
}
function decode(model, n, sig, ids) {
  const val = (name) => ids.has(name) && model[ids.get(name)] === true;
  const D = Array.from({ length: n }, (_, i) => i);
  const tuples = (k) => (k === 0 ? [[]] : tuples(k - 1).flatMap((t) => D.map((d) => [...t, d])));
  const constants = {};
  for (const c of sig.constants) constants[c] = D.find((d) => val(`${c}=${d}`)) ?? 0;
  const functions = {};
  for (const [fn, k] of sig.functions) {
    const table = {};
    for (const t of tuples(k)) table[t.join(",")] = D.find((d) => val(`${fn}(${t})=${d}`)) ?? 0;
    functions[fn] = table;
  }
  const predicates = {};
  for (const [p, k] of sig.predicates) {
    if (k === 0) predicates[p] = val(p);
    else predicates[p] = tuples(k).filter((t) => val(`${p}(${t})`)).map((t) => (k === 1 ? t[0] : t));
  }
  return new Structure({ domain: n, constants, functions, predicates });
}
const joinSig = (fs) => {
  const predicates = new Map();
  const functions = new Map();
  const constants = new Set();
  for (const f of fs) {
    const s = f.signature();
    for (const [k, v] of s.predicates) {
      if (predicates.has(k) && predicates.get(k) !== v) refuse("arity", `${k} is used with ${predicates.get(k)} and with ${v} arguments`);
      predicates.set(k, v);
    }
    for (const [k, v] of s.functions) functions.set(k, v);
    s.constants.forEach((c) => constants.add(c));
  }
  return { predicates, functions, constants: [...constants].sort() };
};

/**
 * Look for a finite structure in which every sentence is true, trying domain
 * sizes from minSize to maxSize.
 *   { status: "found", model, size }        the model is checked by evaluation
 *   { status: "none", upTo }                no model with at most upTo elements:
 *                                            this is not a proof that none exists
 *   { status: "unresolved", reason }        the solver stopped at its budget
 */
export function findModel(input, { minSize = 1, maxSize = 4, budget = 200000 } = {}) {
  const fs = fos(input);
  for (const f of fs) if (!f.isSentence) refuse("free-variable", `${f} has free variables ${f.freeVariables().join(", ")}: give sentences`);
  const sig = joinSig(fs);
  for (let n = minSize; n <= maxSize; n++) {
    const g = ground(fs, n, sig);
    const r = satisfiable([...g], { budget });
    if (r.status === "unresolved") return { status: "unresolved", size: n, reason: `the search stopped at its budget for domain size ${n}` };
    if (r.status === "satisfiable") {
      const model = decode(r.model, n, sig, g.ids);
      for (const f of fs) if (!evaluate(f, model).value) throw new Error(`internal: the model found does not satisfy ${f}`);
      return { status: "found", model, size: n };
    }
  }
  return { status: "none", upTo: maxSize };
}
/**
 * Does the conclusion follow from the premises? A countermodel (premises
 * true, conclusion false) up to maxSize settles it as invalid. Not finding
 * one is reported as unresolved, with the size searched: finite search
 * cannot show validity (use a proof or a closed tableau for that).
 */
export function countermodel(premises, conclusion, options = {}) {
  const ps = fos(premises);
  const c = fo(conclusion);
  const r = findModel([...ps, new FOFormula("not", c)], options);
  if (r.status === "found") return { status: "invalid", countermodel: r.model, size: r.size };
  if (r.status === "none") return { status: "unresolved", reason: `no countermodel with at most ${r.upTo} elements`, upTo: r.upTo };
  return r;
}
