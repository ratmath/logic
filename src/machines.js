// Grammars, pushdown automata, Turing machines and recursive functions.
// Context-free grammars generate their words and decide membership by the
// CYK method, with a parse tree as the evidence; a pushdown automaton and a
// Turing machine are run with a step budget, so a machine that has not
// halted is reported as running, never as rejecting.

import { refuse } from "./formula.js";

const EPS = new Set(["ε", "eps", "epsilon", "λ", ""]);

// ---- context-free grammars ------------------------------------------------------------------------

/**
 * A grammar from text, one rule per line ("S -> a S b | ε"), or
 * { start, rules: { S: ["aSb", "ε"] } }. Nonterminals are capital letters
 * (optionally with digits or primes); every other character is a terminal.
 * In text, symbols may be separated by spaces or written together.
 */
export class Grammar {
  constructor(input) {
    let rules = {};
    let start;
    if (typeof input === "string") {
      for (const raw of input.split(/\n|;/)) {
        const line = raw.trim();
        if (!line) continue;
        const m = /^([A-Z][0-9']*)\s*(?:->|→|::=|=)\s*(.*)$/.exec(line);
        if (!m) refuse("syntax", `"${line}" is not a rule of the form A -> …`);
        start ??= m[1];
        rules[m[1]] = [...(rules[m[1]] ?? []), ...m[2].split("|").map((s) => s.trim())];
      }
    } else {
      rules = input.rules;
      start = input.start ?? Object.keys(rules)[0];
    }
    this.start = start;
    this.rules = new Map();
    for (const [A, alts] of Object.entries(rules)) this.rules.set(A, alts.map((alt) => symbols(alt)));
    for (const alts of this.rules.values()) for (const alt of alts) for (const s of alt) if (isNT(s) && !this.rules.has(s)) refuse("bad-grammar", `${s} is used but has no rules`);
    this.terminals = [...new Set([...this.rules.values()].flat(2).filter((s) => !isNT(s)))].sort();
  }
  get nonterminals() {
    return [...this.rules.keys()];
  }
  /** The words of the language up to a length, shortest first. */
  words(maxLength = 6, { budget = 200000 } = {}) {
    const out = new Set();
    let frontier = [[this.start]];
    const seen = new Set([this.start]);
    const minLen = this._minLengths();
    let steps = 0;
    while (frontier.length) {
      const next = [];
      for (const form of frontier) {
        if (++steps > budget) return { words: sortWords([...out]), complete: false };
        const i = form.findIndex(isNT);
        if (i < 0) {
          out.add(form.join(""));
          continue;
        }
        for (const alt of this.rules.get(form[i])) {
          const f = [...form.slice(0, i), ...alt, ...form.slice(i + 1)];
          const least = f.reduce((s, x) => s + (isNT(x) ? minLen.get(x) : 1), 0);
          if (least > maxLength) continue;
          const k = f.join(" ");
          if (!seen.has(k)) {
            seen.add(k);
            next.push(f);
          }
        }
      }
      frontier = next;
    }
    return { words: sortWords([...out]), complete: true };
  }
  _minLengths() {
    const m = new Map(this.nonterminals.map((A) => [A, Infinity]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const [A, alts] of this.rules) for (const alt of alts) {
        const l = alt.reduce((s, x) => s + (isNT(x) ? m.get(x) : 1), 0);
        if (l < m.get(A)) {
          m.set(A, l);
          changed = true;
        }
      }
    }
    return m;
  }
  /** An equivalent grammar in Chomsky normal form (A → BC, A → a, and S0 → ε when ε is in the language). */
  toCNF() {
    const used = new Set(this.rules.keys());
    const fresh = (base) => {
      let k = 0;
      while (used.has(`${base}${k}`)) k++;
      used.add(`${base}${k}`);
      return `${base}${k}`;
    };
    const R = new Map([...this.rules].map(([A, alts]) => [A, alts.map((a) => [...a])]));
    const S0 = fresh("S");
    R.set(S0, [[this.start]]);
    // remove ε rules
    const nullable = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const [A, alts] of R) if (!nullable.has(A) && alts.some((alt) => alt.every((s) => nullable.has(s)))) {
        nullable.add(A);
        changed = true;
      }
    }
    for (const [A, alts] of R) {
      const out = new Map();
      for (const alt of alts) {
        const idx = alt.map((s, i) => (nullable.has(s) ? i : -1)).filter((i) => i >= 0);
        for (let mask = 0; mask < 1 << idx.length; mask++) {
          const keep = alt.filter((s, i) => !idx.includes(i) || ((mask >> idx.indexOf(i)) & 1) === 0);
          if (keep.length || A === S0) out.set(keep.join(" "), keep);
        }
      }
      R.set(A, [...out.values()].filter((a) => a.length || A === S0));
    }
    // remove unit rules
    for (const A of R.keys()) {
      const units = new Set([A]);
      const stack = [A];
      while (stack.length) for (const alt of R.get(stack.pop())) if (alt.length === 1 && isNT(alt[0]) && !units.has(alt[0])) {
        units.add(alt[0]);
        stack.push(alt[0]);
      }
      const out = new Map();
      for (const B of units) for (const alt of R.get(B)) if (!(alt.length === 1 && isNT(alt[0]))) out.set(alt.join(" "), alt);
      R.set(A, [...out.values()]);
    }
    // terminals in long rules, then binarise
    const termVar = new Map();
    const tv = (a) => {
      if (!termVar.has(a)) termVar.set(a, fresh("T"));
      return termVar.get(a);
    };
    const final = new Map();
    const pairVar = new Map();
    for (const [A, alts] of R) {
      final.set(A, []);
      for (let alt of alts) {
        if (alt.length >= 2) alt = alt.map((s) => (isNT(s) ? s : tv(s)));
        while (alt.length > 2) {
          const key = alt.slice(-2).join(" ");
          if (!pairVar.has(key)) {
            const V = fresh("X");
            pairVar.set(key, V);
            final.set(V, [alt.slice(-2)]);
          }
          alt = [...alt.slice(0, -2), pairVar.get(key)];
        }
        final.get(A).push(alt);
      }
    }
    for (const [a, V] of termVar) final.set(V, [[a]]);
    const g = new Grammar({ start: S0, rules: Object.fromEntries([...final].map(([A, alts]) => [A, alts.map((x) => (x.length ? x.join(" ") : "ε"))])) });
    return g;
  }
  /**
   * Is the word in the language? CYK on the Chomsky normal form decides it;
   * when accepted, a parse tree ({ symbol, children }) in the grammar as
   * written is found by a chart over the original rules, and cnfTree is the
   * tree in the normal form.
   */
  parse(word) {
    const g = this.toCNF();
    const w = [...String(word)];
    const n = w.length;
    if (n === 0) {
      const accepted = g.rules.get(g.start).some((a) => a.length === 0);
      return { accepted, tree: accepted ? this._chart(w) : null, cnfTree: null };
    }
    const table = Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => new Map()));
    for (let i = 0; i < n; i++) for (const [A, alts] of g.rules) for (const alt of alts) if (alt.length === 1 && alt[0] === w[i]) table[i][1].set(A, { symbol: A, children: [{ symbol: w[i] }] });
    for (let len = 2; len <= n; len++) for (let i = 0; i + len <= n; i++) for (let k = 1; k < len; k++) {
      for (const [A, alts] of g.rules) {
        if (table[i][len].has(A)) continue;
        for (const alt of alts) {
          if (alt.length !== 2) continue;
          const L = table[i][k].get(alt[0]);
          const Rr = table[i + k][len - k].get(alt[1]);
          if (L && Rr) {
            table[i][len].set(A, { symbol: A, children: [L, Rr] });
            break;
          }
        }
      }
    }
    const cnfTree = table[0][n].get(g.start) ?? null;
    return { accepted: Boolean(cnfTree), tree: cnfTree ? this._chart(w) : null, cnfTree };
  }
  /** A parse tree in this grammar for an accepted word: grow a chart of (A, i, j) until the whole word is covered. */
  _chart(w) {
    const n = w.length;
    const chart = new Map();
    const match = (alt, k, i, j) => {
      if (k === alt.length) return i === j ? [] : null;
      const s = alt[k];
      if (!isNT(s)) {
        if (w[i] !== s) return null;
        const rest = match(alt, k + 1, i + 1, j);
        return rest && [{ symbol: s }, ...rest];
      }
      for (let m = i; m <= j; m++) {
        const t = chart.get(`${s}|${i}|${m}`);
        if (!t) continue;
        const rest = match(alt, k + 1, m, j);
        if (rest) return [t, ...rest];
      }
      return null;
    };
    for (let changed = true; changed; ) {
      changed = false;
      for (let len = 0; len <= n; len++) for (let i = 0; i + len <= n; i++) for (const [A, alts] of this.rules) {
        const key = `${A}|${i}|${i + len}`;
        if (chart.has(key)) continue;
        for (const alt of alts) {
          const kids = match(alt, 0, i, i + len);
          if (kids) {
            chart.set(key, { symbol: A, children: kids.length ? kids : [{ symbol: "ε" }] });
            changed = true;
            break;
          }
        }
      }
      if (chart.has(`${this.start}|0|${n}`)) break;
    }
    return chart.get(`${this.start}|0|${n}`) ?? null;
  }
  accepts(word) {
    return this.parse(word).accepted;
  }
  toString() {
    return [...this.rules].map(([A, alts]) => `${A} → ${alts.map((a) => (a.length ? a.join(" ") : "ε")).join(" | ")}`).join("\n");
  }
}
const isNT = (s) => /^[A-Z][0-9']*$/.test(s);
function symbols(alt) {
  const s = alt.trim();
  if (EPS.has(s)) return [];
  if (/\s/.test(s)) return s.split(/\s+/).filter((x) => !EPS.has(x));
  const out = [];
  for (let i = 0; i < s.length; ) {
    const m = /^[A-Z][0-9']*/.exec(s.slice(i));
    if (m) {
      out.push(m[0]);
      i += m[0].length;
    } else if (s[i] === "ε") i++;
    else out.push(s[i++]);
  }
  return out;
}
const sortWords = (ws) => ws.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
export const grammar = (x) => (x instanceof Grammar ? x : new Grammar(x));
/** Show a parse tree as a bracketed string: S(a S(…) b). */
export const showTree = (t) => (t.children ? `${t.symbol}(${t.children.map(showTree).join(" ")})` : t.symbol);

// ---- pushdown automata -----------------------------------------------------------------------------

/**
 * A pushdown automaton, accepting by final state:
 *   pda({ start: "q0", accept: ["q2"], stackStart: "Z",
 *         moves: [["q0", "a", "Z", "q0", "AZ"], …] })
 * A move is [state, symbol read (or ε), top of stack popped (or ε), new state,
 * string pushed (its first character on top; ε for nothing)].
 * run(word, { budget }) searches the computations breadth first:
 *   { status: "accepted", trace } | { status: "rejected" } | { status: "unresolved" }.
 */
export class PDA {
  constructor({ start, accept = [], stackStart = "Z", moves }) {
    this.start = start;
    this.accept = new Set(accept);
    this.stackStart = stackStart;
    this.moves = moves.map(([q, a, X, p, push]) => ({ q, a: EPS.has(a) ? "" : a, X: EPS.has(X) ? "" : X, p, push: EPS.has(push) ? "" : push }));
  }
  run(word, { budget = 100000 } = {}) {
    const w = String(word);
    const startC = { q: this.start, i: 0, stack: this.stackStart, prev: null, move: null };
    const queue = [startC];
    const seen = new Set();
    let steps = 0;
    while (queue.length) {
      if (++steps > budget) return { status: "unresolved", reason: `still searching after ${budget} configurations` };
      const c = queue.shift();
      const key = `${c.q}|${c.i}|${c.stack}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (c.i === w.length && this.accept.has(c.q)) {
        const trace = [];
        for (let x = c; x; x = x.prev) trace.unshift({ state: x.q, read: w.slice(0, x.i), stack: x.stack || "ε" });
        return { status: "accepted", trace };
      }
      if (c.stack.length > 2 * w.length + 20) continue; // a stack this tall cannot shrink back in time without ε loops
      for (const m of this.moves) {
        if (m.q !== c.q) continue;
        if (m.a && w[c.i] !== m.a) continue;
        if (m.X && c.stack[0] !== m.X) continue;
        queue.push({ q: m.p, i: c.i + (m.a ? 1 : 0), stack: m.push + c.stack.slice(m.X ? 1 : 0), prev: c, move: m });
      }
    }
    return { status: "rejected" };
  }
  accepts(word, options) {
    return this.run(word, options).status === "accepted";
  }
}
export const pda = (spec) => new PDA(spec);

// ---- Turing machines ----------------------------------------------------------------------------------

/**
 * A one-tape Turing machine:
 *   turing({ start: "q0", accept: "qa", reject: "qr", blank: "_",
 *            delta: { "q0,0": ["q1", "1", "R"], … } })
 * A transition reads (state, symbol) and gives (new state, symbol written,
 * move L, R or S). With no transition the machine halts without accepting.
 */
export class TuringMachine {
  constructor({ start = "q0", accept = "accept", reject = "reject", blank = "_", delta }) {
    Object.assign(this, { start, accept, reject, blank });
    this.delta = new Map();
    for (const [k, v] of Object.entries(delta)) {
      const [q, a] = k.split(",").map((s) => s.trim());
      if (!["L", "R", "S", "N"].includes(v[2])) refuse("bad-machine", `${k}: the move is L, R or S, not ${v[2]}`);
      this.delta.set(`${q},${a}`, { q: v[0], write: v[1], move: v[2] });
    }
  }
  /**
   * Run on an input with a step budget.
   * { status: "accepted" | "rejected" | "halted" | "running", steps, tape,
   *   head, state, trace? }  — "running" means the budget ran out, not that
   * the machine never halts.
   */
  run(input = "", { budget = 100000, trace = false } = {}) {
    const tape = new Map([...String(input)].map((c, i) => [i, c]));
    let head = 0;
    let q = this.start;
    let steps = 0;
    const log = [];
    const snap = () => {
      const keys = [...tape.keys(), head];
      const lo = Math.min(...keys);
      const hi = Math.max(...keys);
      let s = "";
      for (let i = lo; i <= hi; i++) s += i === head ? `[${tape.get(i) ?? this.blank}]` : tape.get(i) ?? this.blank;
      return `${q}: ${s}`;
    };
    for (;;) {
      if (trace && log.length < 1000) log.push(snap());
      if (q === this.accept || q === this.reject) break;
      const t = this.delta.get(`${q},${tape.get(head) ?? this.blank}`);
      if (!t) break;
      if (steps >= budget) return { status: "running", steps, state: q, head, tape: this._contents(tape), trace: trace ? log : undefined };
      tape.set(head, t.write);
      head += t.move === "L" ? -1 : t.move === "R" ? 1 : 0;
      q = t.q;
      steps++;
    }
    const status = q === this.accept ? "accepted" : q === this.reject ? "rejected" : "halted";
    return { status, steps, state: q, head, tape: this._contents(tape), trace: trace ? log : undefined };
  }
  _contents(tape) {
    const keys = [...tape.keys()].filter((k) => tape.get(k) !== this.blank);
    if (!keys.length) return "";
    let s = "";
    for (let i = Math.min(...keys); i <= Math.max(...keys); i++) s += tape.get(i) ?? this.blank;
    return s;
  }
}
export const turing = (spec) => new TuringMachine(spec);

// ---- recursive functions ------------------------------------------------------------------------------

/**
 * Primitive recursive functions built from the basic ones, on BigInt.
 *   recursive.zero, recursive.succ, recursive.proj(i, n)
 *   recursive.compose(f, [g1, …, gk])
 *   recursive.primrec(g, h): f(0, ys) = g(ys), f(x+1, ys) = h(x, f(x, ys), ys)
 *   recursive.mu(f, { budget }): the least x with f(x, ys) = 0 (general recursive; may not exist)
 * Each is { arity, name, at(...args) }; `examples` has add, mult, pred,
 * monus, power, factorial, built only from these.
 */
const fn = (arity, name, at) => Object.freeze({ arity, name, at: (...xs) => {
  if (xs.length !== arity) refuse("bad-argument", `${name} takes ${arity} argument${arity === 1 ? "" : "s"}`);
  const ys = xs.map((x) => {
    const b = BigInt(x);
    if (b < 0n) refuse("bad-argument", "recursive functions take natural numbers");
    return b;
  });
  return at(...ys);
} });
const zero = fn(1, "Z", () => 0n);
const succ = fn(1, "S", (x) => x + 1n);
const proj = (i, n) => {
  if (!(i >= 1 && i <= n)) refuse("bad-argument", "proj(i, n) needs 1 ≤ i ≤ n");
  return fn(n, `P${i}^${n}`, (...xs) => xs[i - 1]);
};
const compose = (f, gs) => {
  if (gs.length !== f.arity) refuse("bad-argument", `${f.name} takes ${f.arity} arguments; ${gs.length} functions given`);
  const n = gs[0].arity;
  if (gs.some((g) => g.arity !== n)) refuse("bad-argument", "the inner functions must all take the same number of arguments");
  return fn(n, `${f.name}∘(${gs.map((g) => g.name).join(",")})`, (...xs) => f.at(...gs.map((g) => g.at(...xs))));
};
const primrec = (g, h, name) => {
  if (h.arity !== g.arity + 2) refuse("bad-argument", `h takes ${g.arity + 2} arguments when g takes ${g.arity}`);
  return fn(g.arity + 1, name ?? `R(${g.name},${h.name})`, (x, ...ys) => {
    let v = g.at(...ys);
    for (let k = 0n; k < x; k++) v = h.at(k, v, ...ys);
    return v;
  });
};
const mu = (f, { budget = 100000 } = {}) =>
  fn(f.arity - 1, `μ(${f.name})`, (...ys) => {
    for (let x = 0n; x < BigInt(budget); x++) if (f.at(x, ...ys) === 0n) return x;
    return refuse("budget", `no zero found below ${budget}: the search may never end`);
  });
const constFn = (c, n) => {
  // the constant c with n arguments, from Z, S and projections
  let f = n === 0 ? null : compose(zero, [proj(1, n)]);
  for (let k = 0; k < c; k++) f = compose(succ, [f]);
  return f;
};
const add = primrec(proj(1, 1), compose(succ, [proj(2, 3)]), "add");
const mult = primrec(compose(zero, [proj(1, 1)]), compose(add, [proj(2, 3), proj(3, 3)]), "mult");
// pred(x) = R(0, P1) with one dummy argument, then fixed
const predWithDummy = primrec(compose(zero, [proj(1, 1)]), proj(1, 3));
const pred = compose(predWithDummy, [proj(1, 1), proj(1, 1)]);
const monusRev = primrec(proj(1, 1), compose(pred, [proj(2, 3)])); // monusRev(y, x) = x ∸ y
const monus = compose(monusRev, [proj(2, 2), proj(1, 2)]);
const powRev = primrec(constFn(1, 1), compose(mult, [proj(2, 3), proj(3, 3)])); // powRev(y, x) = x^y
const power = compose(powRev, [proj(2, 2), proj(1, 2)]);
const factWithDummy = primrec(constFn(1, 1), compose(mult, [compose(succ, [proj(1, 3)]), proj(2, 3)]));
const factorial = compose(factWithDummy, [proj(1, 1), proj(1, 1)]);
const named = (f, name) => Object.freeze({ ...f, name });
export const recursive = Object.freeze({
  zero, succ, proj, compose, primrec, mu, constant: constFn,
  examples: Object.freeze({
    add: named(add, "add"), mult: named(mult, "mult"), pred: named(pred, "pred"), monus: named(monus, "monus"), power: named(power, "power"), factorial: named(factorial, "factorial"),
  }),
});

// ---- Gödel-free helper: a machine that adds one in binary, used in the docs and tests ---------------
export const binaryIncrement = () =>
  new TuringMachine({
    start: "right",
    accept: "done",
    delta: {
      "right,0": ["right", "0", "R"], "right,1": ["right", "1", "R"], "right,_": ["carry", "_", "L"],
      "carry,1": ["carry", "0", "L"], "carry,0": ["done", "1", "S"], "carry,_": ["done", "1", "S"],
    },
  });
