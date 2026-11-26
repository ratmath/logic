// Propositional formulas: the syntax tree, a parser that reads the notations
// people actually type, and printing in Unicode, plain ASCII and TeX.

export class LogicError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.name = "LogicError";
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}
export const refuse = (code, message, extra) => {
  throw new LogicError(code, message, extra);
};

const BINARY = ["and", "or", "imp", "iff", "xor"];
const SYMBOL = {
  unicode: { not: "¬", and: "∧", or: "∨", imp: "→", iff: "↔", xor: "⊕", top: "⊤", bot: "⊥" },
  ascii: { not: "~", and: "&", or: "|", imp: "->", iff: "<->", xor: "xor", top: "true", bot: "false" },
  tex: { not: "\\lnot ", and: "\\land", or: "\\lor", imp: "\\to", iff: "\\leftrightarrow", xor: "\\oplus", top: "\\top", bot: "\\bot" },
  words: { not: "not ", and: "and", or: "or", imp: "implies", iff: "iff", xor: "xor", top: "true", bot: "false" },
};

/** Names in a steady order: letters first, then a trailing number by size (p2 before p10). */
export const compareNames = (a, b) => {
  const ma = /^(.*?)(\d*)$/.exec(a);
  const mb = /^(.*?)(\d*)$/.exec(b);
  if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
  const na = ma[2] === "" ? -1 : Number(ma[2]);
  const nb = mb[2] === "" ? -1 : Number(mb[2]);
  return na - nb || (a < b ? -1 : a > b ? 1 : 0);
};

/**
 * A formula. `kind` is one of atom, top, bot, not, and, or, imp, iff, xor.
 * Atoms have `name`; a negation has `arg`; the two-place connectives have
 * `left` and `right`. Formulas are immutable, and `key` is a text that two
 * formulas share exactly when they are the same tree.
 */
export class Formula {
  constructor(kind, a, b) {
    this.kind = kind;
    if (kind === "atom") {
      this.name = String(a);
      this.key = this.name;
    } else if (kind === "top" || kind === "bot") {
      this.key = SYMBOL.unicode[kind];
    } else if (kind === "not") {
      this.arg = a;
      this.key = "¬" + a.key;
    } else if (BINARY.includes(kind)) {
      this.left = a;
      this.right = b;
      this.key = "(" + a.key + SYMBOL.unicode[kind] + b.key + ")";
    } else throw new TypeError(`unknown kind of formula: ${kind}`);
    Object.freeze(this);
  }
  /** The immediate parts: none, one or two formulas. */
  get parts() {
    return this.kind === "not" ? [this.arg] : this.left ? [this.left, this.right] : [];
  }
  get isAtom() {
    return this.kind === "atom";
  }
  /** An atom or the negation of an atom. */
  get isLiteral() {
    return this.kind === "atom" || (this.kind === "not" && this.arg.kind === "atom");
  }
  equals(other) {
    return other instanceof Formula ? other.key === this.key : formula(other).key === this.key;
  }
  /** The names of the atoms, in a steady order. */
  atoms() {
    const seen = new Set();
    const walk = (f) => (f.kind === "atom" ? seen.add(f.name) : f.parts.forEach(walk));
    walk(this);
    return [...seen].sort(compareNames);
  }
  /** Every distinct subformula, parts before the wholes they are parts of; this formula last. */
  subformulas() {
    const seen = new Map();
    const walk = (f) => {
      if (seen.has(f.key)) return;
      f.parts.forEach(walk);
      seen.set(f.key, f);
    };
    walk(this);
    return [...seen.values()];
  }
  /** How many atoms, constants and connectives are written. */
  get size() {
    return 1 + this.parts.reduce((s, p) => s + p.size, 0);
  }
  get depth() {
    return this.parts.length ? 1 + Math.max(...this.parts.map((p) => p.depth)) : 0;
  }
  /**
   * The truth value under a valuation: an object or Map from atom names to
   * true/false (or 1/0). Every atom of the formula needs a value.
   */
  evaluate(valuation) {
    const get = valuation instanceof Map ? (n) => valuation.get(n) : (n) => valuation[n];
    const go = (f) => {
      switch (f.kind) {
        case "atom": {
          const v = get(f.name);
          if (v === undefined) refuse("no-value", `the valuation gives no value to ${f.name}`);
          return Boolean(v);
        }
        case "top": return true;
        case "bot": return false;
        case "not": return !go(f.arg);
        case "and": return go(f.left) && go(f.right);
        case "or": return go(f.left) || go(f.right);
        case "imp": return !go(f.left) || go(f.right);
        case "iff": return go(f.left) === go(f.right);
        default: return go(f.left) !== go(f.right);
      }
    };
    return go(this);
  }
  /** Replace atoms by formulas: substitute({ p: "q & r" }). */
  substitute(map) {
    const table = map instanceof Map ? map : new Map(Object.entries(map));
    const ready = new Map([...table].map(([k, v]) => [k, formula(v)]));
    const go = (f) => {
      if (f.kind === "atom") return ready.get(f.name) ?? f;
      if (f.kind === "not") return new Formula("not", go(f.arg));
      if (f.left) return new Formula(f.kind, go(f.left), go(f.right));
      return f;
    };
    return go(this);
  }
  /**
   * Text. style: "unicode" (default), "ascii" (reads back with any keyboard),
   * "words" or "tex". Brackets are kept wherever two different connectives
   * meet, so nothing depends on remembering precedence.
   */
  toString({ style = "unicode" } = {}) {
    const sym = SYMBOL[style] ?? refuse("bad-argument", `unknown style ${style}`);
    const wrap = (f, bare) => (bare ? show(f) : "(" + show(f) + ")");
    const show = (f) => {
      switch (f.kind) {
        case "atom": return style === "tex" ? texName(f.name) : f.name;
        case "top": case "bot": return sym[f.kind];
        case "not": return sym.not + wrap(f.arg, !f.arg.left);
        default: {
          const chain = f.kind === "and" || f.kind === "or";
          const l = wrap(f.left, !f.left.left || (chain && f.left.kind === f.kind));
          const r = wrap(f.right, !f.right.left);
          return `${l} ${sym[f.kind]} ${r}`;
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
    return `Formula(${this.toString()})`;
  }
}
const texName = (name) => {
  const m = /^([A-Za-z])(\d+)$/.exec(name);
  if (m) return `${m[1]}_{${m[2]}}`;
  return name.length === 1 ? name : `\\mathit{${name.replace(/_/g, "\\_")}}`;
};

export const TRUE = new Formula("top");
export const FALSE = new Formula("bot");

// ---- the parser --------------------------------------------------------------------------------

const SYMBOLS = [
  ["_|_", "bot"],
  ["<->", "iff"], ["<=>", "iff"], ["↔", "iff"], ["≡", "iff"], ["⇔", "iff"], ["⟷", "iff"],
  ["->", "imp"], ["=>", "imp"], ["→", "imp"], ["⊃", "imp"], ["⇒", "imp"], ["⟶", "imp"],
  ["/\\", "and"], ["&&", "and"], ["&", "and"], ["∧", "and"], ["^", "and"], ["·", "and"],
  ["\\/", "or"], ["||", "or"], ["|", "or"], ["∨", "or"],
  ["⊕", "xor"], ["⊻", "xor"],
  ["¬", "not"], ["~", "not"], ["!", "not"], ["∼", "not"],
  ["⊤", "top"], ["⊥", "bot"],
  ["(", "("], [")", ")"], ["[", "("], ["]", ")"],
];
const WORDS = {
  not: "not", and: "and", or: "or", implies: "imp", iff: "iff", xor: "xor", true: "top", false: "bot",
  NOT: "not", AND: "and", OR: "or", IMPLIES: "imp", IFF: "iff", XOR: "xor", TRUE: "top", FALSE: "bot",
};

function tokens(text) {
  const out = [];
  let i = 0;
  scan: while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    for (const [s, type] of SYMBOLS) {
      if (text.startsWith(s, i)) {
        out.push({ type, at: i, text: s });
        i += s.length;
        continue scan;
      }
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*'*/.exec(text.slice(i));
    if (m) {
      const word = m[0];
      out.push(Object.hasOwn(WORDS, word) ? { type: WORDS[word], at: i, text: word } : { type: "atom", at: i, text: word });
      i += word.length;
      continue;
    }
    if (ch === "1" || ch === "0") {
      out.push({ type: ch === "1" ? "top" : "bot", at: i, text: ch });
      i++;
      continue;
    }
    refuse("syntax", `unexpected "${ch}" at position ${i + 1} in "${text}"`, { position: i });
  }
  return out;
}

/**
 * Read a formula. Accepted spellings:
 *   not      ¬ ~ ! not          and   ∧ & && /\ ^ and        or   ∨ | || \/ or
 *   implies  → -> => ⊃ implies  iff   ↔ <-> <=> ≡ iff        xor  ⊕ xor
 *   true     ⊤ true 1           false ⊥ false 0
 * Without brackets, not binds tightest, then and, xor, or, implies (to the
 * right), iff.
 */
export function parse(text) {
  if (typeof text !== "string") throw new TypeError("parse takes text");
  const toks = tokens(text);
  let pos = 0;
  const peek = () => toks[pos]?.type;
  const fail = (what) => {
    const t = toks[pos];
    refuse("syntax", t ? `${what}, but found "${t.text}" at position ${t.at + 1} in "${text}"` : `${what}, but "${text}" ends`, { position: t ? t.at : text.length });
  };
  const level = (ops, next, rightAssoc) => {
    const go = () => {
      let left = next();
      while (ops.includes(peek())) {
        const kind = toks[pos++].type;
        if (rightAssoc) return new Formula(kind, left, go());
        left = new Formula(kind, left, next());
      }
      return left;
    };
    return go;
  };
  const unary = () => {
    const t = toks[pos];
    if (!t) fail("a formula was expected");
    if (t.type === "not") {
      pos++;
      return new Formula("not", unary());
    }
    if (t.type === "atom") {
      pos++;
      return new Formula("atom", t.text);
    }
    if (t.type === "top" || t.type === "bot") {
      pos++;
      return t.type === "top" ? TRUE : FALSE;
    }
    if (t.type === "(") {
      pos++;
      const inner = iffLevel();
      if (peek() !== ")") fail('a ")" was expected');
      pos++;
      return inner;
    }
    return fail("a formula was expected");
  };
  const andLevel = level(["and"], unary);
  const xorLevel = level(["xor"], andLevel);
  const orLevel = level(["or"], xorLevel);
  const impLevel = level(["imp"], orLevel, true);
  const iffLevel = level(["iff"], impLevel);
  const result = iffLevel();
  if (pos < toks.length) fail("a connective was expected");
  return result;
}

/** A Formula from a Formula or from text. */
export function formula(x) {
  if (x instanceof Formula) return x;
  if (typeof x === "string") return parse(x);
  throw new TypeError(`cannot read ${x} as a formula`);
}

// ---- building formulas in code --------------------------------------------------------------

export const atom = (name) => {
  if (!/^[^\s()]+$/.test(String(name))) refuse("bad-argument", `"${name}" cannot be the name of an atom`);
  return new Formula("atom", name);
};
export const not = (f) => new Formula("not", formula(f));
const fold = (kind, empty) => (...fs) => {
  const list = fs.flat().map(formula);
  return list.length ? list.reduce((a, b) => new Formula(kind, a, b)) : empty;
};
/** The conjunction of any number of formulas; of none, ⊤. */
export const and = fold("and", TRUE);
/** The disjunction of any number of formulas; of none, ⊥. */
export const or = fold("or", FALSE);
export const implies = (a, b) => new Formula("imp", formula(a), formula(b));
export const iff = (a, b) => new Formula("iff", formula(a), formula(b));
export const xor = (a, b) => new Formula("xor", formula(a), formula(b));

/** A formula, or a list of formulas (an array, or text with commas), as an array. */
export function formulas(x) {
  if (x === undefined || x === null) return [];
  if (Array.isArray(x)) return x.map(formula);
  if (typeof x === "string") {
    return x.trim() === "" ? [] : x.split(/[,;]/).map((s) => parse(s));
  }
  return [formula(x)];
}

// ---- schemas: formulas whose atoms stand for any formula ----------------------------------

/**
 * Match a schema against a formula. The atoms of the schema are places that
 * any formula may fill; `bind` (a Map) collects what fills them and is
 * extended in place. Returns true when the formula has the schema's shape.
 */
export function matchSchema(schema, f, bind) {
  if (schema.kind === "atom") {
    const had = bind.get(schema.name);
    if (had) return had.key === f.key;
    bind.set(schema.name, f);
    return true;
  }
  if (schema.kind !== f.kind) return false;
  if (schema.kind === "not") return matchSchema(schema.arg, f.arg, bind);
  if (schema.left) return matchSchema(schema.left, f.left, bind) && matchSchema(schema.right, f.right, bind);
  return true;
}
const GREEK = { A: "φ", B: "ψ", C: "χ", D: "θ" };
/** Fill a schema in; places with nothing bound are shown as φ, ψ, χ. */
export function fillSchema(schema, bind) {
  const go = (f) => {
    if (f.kind === "atom") return bind.get(f.name) ?? new Formula("atom", GREEK[f.name] ?? f.name);
    if (f.kind === "not") return new Formula("not", go(f.arg));
    if (f.left) return new Formula(f.kind, go(f.left), go(f.right));
    return f;
  };
  return go(schema);
}
