// Finite automata and regular expressions: run a word with its trace, turn
// an NFA into a DFA, minimise, decide equivalence with a shortest word that
// tells two languages apart, convert regular expressions to automata and
// back, and take complements, unions and intersections. Symbols are single
// characters; ε is written "ε" or "" (an empty label).

import { refuse } from "./formula.js";

const EPS = new Set(["", "ε", "eps", "epsilon", "λ"]);
const setKey = (s) => [...s].sort().join(",");

/**
 * An automaton:
 *   automaton({ states: ["q0", "q1"], alphabet: "ab", start: "q0", accept: ["q1"],
 *               delta: { q0: { a: "q1", b: "q0" }, q1: { a: ["q0", "q1"], ε: "q0" } } })
 * A transition may go to one state or a list; a missing transition rejects.
 * It is a DFA when every transition goes to at most one state and there are
 * no ε moves, otherwise an NFA.
 */
export class Automaton {
  constructor({ states, alphabet, start, accept = [], delta = {} }) {
    this.states = [...(states ?? Object.keys(delta))].map(String);
    const S = new Set(this.states);
    this.start = String(start ?? this.states[0]);
    if (!S.has(this.start)) refuse("bad-automaton", `the start state ${this.start} is not a state`);
    this.accept = new Set([...accept].map(String));
    for (const a of this.accept) if (!S.has(a)) refuse("bad-automaton", `the accepting state ${a} is not a state`);
    const symbols = new Set(alphabet ? [...(Array.isArray(alphabet) ? alphabet : String(alphabet))] : []);
    this.delta = new Map(this.states.map((q) => [q, new Map()]));
    for (const [q, row] of Object.entries(delta)) {
      if (!S.has(q)) refuse("bad-automaton", `the transition table has a row for ${q}, which is not a state`);
      for (const [a, to] of Object.entries(row)) {
        const sym = EPS.has(a) ? "" : a;
        if (sym.length > 1) refuse("bad-automaton", `symbols are single characters; "${a}" is not`);
        if (sym) symbols.add(sym);
        const targets = (Array.isArray(to) ? to : [to]).map(String);
        for (const t of targets) if (!S.has(t)) refuse("bad-automaton", `${q} --${a || "ε"}--> ${t}: ${t} is not a state`);
        this.delta.get(q).set(sym, new Set(targets));
      }
    }
    this.alphabet = [...symbols].sort();
  }
  get isDFA() {
    for (const row of this.delta.values()) for (const [a, ts] of row) if (a === "" || ts.size > 1) return false;
    return true;
  }
  /** Is every transition defined? */
  get isComplete() {
    return this.isDFA && this.states.every((q) => this.alphabet.every((a) => this.delta.get(q).has(a)));
  }
  closure(set) {
    const out = new Set(set);
    const stack = [...set];
    while (stack.length) {
      const q = stack.pop();
      for (const t of this.delta.get(q).get("") ?? []) if (!out.has(t)) {
        out.add(t);
        stack.push(t);
      }
    }
    return out;
  }
  step(set, a) {
    const out = new Set();
    for (const q of set) for (const t of this.delta.get(q).get(a) ?? []) out.add(t);
    return this.closure(out);
  }
  /** Run a word: { accepted, trace: [{ read, states }] } (the set of states after each symbol). */
  run(word) {
    let cur = this.closure([this.start]);
    const trace = [{ read: null, states: [...cur].sort() }];
    for (const a of String(word)) {
      if (!this.alphabet.includes(a)) return { accepted: false, trace, stuck: `"${a}" is not in the alphabet` };
      cur = this.step(cur, a);
      trace.push({ read: a, states: [...cur].sort() });
      if (!cur.size) return { accepted: false, trace, stuck: "no move" };
    }
    return { accepted: [...cur].some((q) => this.accept.has(q)), trace };
  }
  accepts(word) {
    return this.run(word).accepted;
  }
  /** The accepted words up to a length, shortest first, then in alphabet order. */
  words(maxLength = 4) {
    const out = [];
    let layer = [["", this.closure([this.start])]];
    for (let n = 0; n <= maxLength; n++) {
      for (const [w, s] of layer) if ([...s].some((q) => this.accept.has(q))) out.push(w);
      if (n === maxLength) break;
      layer = layer.flatMap(([w, s]) => this.alphabet.map((a) => [w + a, this.step(s, a)])).filter(([, s]) => s.size);
    }
    return out;
  }
  toString() {
    const lines = [`start ${this.start}; accept ${[...this.accept].join(", ") || "none"}`];
    for (const q of this.states) for (const [a, ts] of this.delta.get(q)) lines.push(`${q} --${a || "ε"}--> ${[...ts].join(", ")}`);
    return lines.join("\n");
  }
}
export const automaton = (spec) => (spec instanceof Automaton ? spec : new Automaton(spec));

/** The subset construction: a DFA with the same language. States are named by the sets they stand for. */
export function toDFA(input) {
  const A = automaton(input);
  const name = (s) => `{${setKey(s)}}`;
  const startSet = A.closure([A.start]);
  const seen = new Map([[name(startSet), startSet]]);
  const queue = [startSet];
  const delta = {};
  while (queue.length) {
    const s = queue.shift();
    const row = (delta[name(s)] = {});
    for (const a of A.alphabet) {
      const t = A.step(s, a);
      if (!t.size) continue;
      if (!seen.has(name(t))) {
        seen.set(name(t), t);
        queue.push(t);
      }
      row[a] = name(t);
    }
  }
  const states = [...seen.keys()];
  return new Automaton({ states, alphabet: A.alphabet, start: name(startSet), accept: states.filter((k) => [...seen.get(k)].some((q) => A.accept.has(q))), delta });
}
/** Every transition defined, with a dead state ∅ where there was none. */
export function complete(input, alphabet) {
  const A = toDFA(input);
  const sigma = [...new Set([...A.alphabet, ...(alphabet ? [...alphabet] : [])])].sort();
  const delta = {};
  let needDead = false;
  for (const q of A.states) {
    delta[q] = {};
    for (const a of sigma) {
      const t = A.delta.get(q).get(a);
      if (t) delta[q][a] = [...t][0];
      else {
        delta[q][a] = "∅";
        needDead = true;
      }
    }
  }
  if (needDead) delta["∅"] = Object.fromEntries(sigma.map((a) => [a, "∅"]));
  return new Automaton({ states: needDead ? [...A.states, "∅"] : A.states, alphabet: sigma, start: A.start, accept: [...A.accept], delta });
}
/**
 * The minimal DFA (Moore's partition refinement after removing unreachable
 * states). States are renamed q0, q1, … in the order a breadth-first walk
 * from the start meets them, so equal languages give identical automata.
 */
export function minimize(input) {
  const A = complete(input);
  // reachable states
  const reach = new Set([A.start]);
  const queue = [A.start];
  while (queue.length) for (const t of A.delta.get(queue.shift()).values()) for (const x of t) if (!reach.has(x)) {
    reach.add(x);
    queue.push(x);
  }
  const Q = A.states.filter((q) => reach.has(q));
  const go = (q, a) => [...A.delta.get(q).get(a)][0];
  let block = new Map(Q.map((q) => [q, A.accept.has(q) ? 1 : 0]));
  for (;;) {
    const sig = new Map(Q.map((q) => [q, `${block.get(q)}|${A.alphabet.map((a) => block.get(go(q, a))).join(",")}`]));
    const ids = new Map();
    const next = new Map(Q.map((q) => [q, ids.has(sig.get(q)) ? ids.get(sig.get(q)) : ids.set(sig.get(q), ids.size).get(sig.get(q))]));
    if (ids.size === new Set(block.values()).size) {
      block = next;
      break;
    }
    block = next;
  }
  // canonical names by breadth-first order
  const order = new Map();
  const bq = [block.get(A.start)];
  order.set(block.get(A.start), 0);
  const rep = new Map();
  for (const q of Q) if (!rep.has(block.get(q))) rep.set(block.get(q), q);
  while (bq.length) {
    const b = bq.shift();
    for (const a of A.alphabet) {
      const nb = block.get(go(rep.get(b), a));
      if (!order.has(nb)) {
        order.set(nb, order.size);
        bq.push(nb);
      }
    }
  }
  const nm = (b) => `q${order.get(b)}`;
  const delta = {};
  for (const [b, q] of rep) delta[nm(b)] = Object.fromEntries(A.alphabet.map((a) => [a, nm(block.get(go(q, a)))]));
  const states = [...order.keys()].sort((x, y) => order.get(x) - order.get(y)).map(nm);
  return new Automaton({ states, alphabet: A.alphabet, start: nm(block.get(A.start)), accept: [...rep].filter(([, q]) => A.accept.has(q)).map(([b]) => nm(b)), delta });
}
/**
 * Do two automata (or regular expressions) accept the same words?
 * { equivalent: true } or { equivalent: false, word, acceptedBy } with a
 * shortest word in one language and not the other, checked on both.
 */
export function equivalentAutomata(a, b) {
  const A0 = typeof a === "string" ? regexToNFA(a) : automaton(a);
  const B0 = typeof b === "string" ? regexToNFA(b) : automaton(b);
  const sigma = [...new Set([...A0.alphabet, ...B0.alphabet])].sort();
  const A = complete(A0, sigma);
  const B = complete(B0, sigma);
  const go = (M, q, x) => [...M.delta.get(q).get(x)][0];
  const seen = new Set([`${A.start}|${B.start}`]);
  const queue = [[A.start, B.start, ""]];
  while (queue.length) {
    const [p, q, w] = queue.shift();
    if (A.accept.has(p) !== B.accept.has(q)) {
      const inA = A0.accepts(w);
      if (inA === B0.accepts(w)) throw new Error("internal: the distinguishing word does not distinguish");
      return { equivalent: false, word: w, acceptedBy: inA ? "first" : "second" };
    }
    for (const x of sigma) {
      const k = `${go(A, p, x)}|${go(B, q, x)}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([go(A, p, x), go(B, q, x), w + x]);
      }
    }
  }
  return { equivalent: true };
}
/** The automaton for the words the given one rejects (over its alphabet, or a wider one). */
export function complement(input, alphabet) {
  const A = complete(input, alphabet);
  return new Automaton({ states: A.states, alphabet: A.alphabet, start: A.start, accept: A.states.filter((q) => !A.accept.has(q)), delta: Object.fromEntries(A.states.map((q) => [q, Object.fromEntries([...A.delta.get(q)].map(([a, t]) => [a, [...t][0]]))])) });
}
/** The product automaton: op "and" (intersection), "or" (union) or "minus". */
export function product(a, b, op = "and") {
  const A0 = automaton(a);
  const B0 = automaton(b);
  const sigma = [...new Set([...A0.alphabet, ...B0.alphabet])].sort();
  const A = complete(A0, sigma);
  const B = complete(B0, sigma);
  const nm = (p, q) => `(${p},${q})`;
  const delta = {};
  const accept = [];
  const seen = new Set([nm(A.start, B.start)]);
  const queue = [[A.start, B.start]];
  while (queue.length) {
    const [p, q] = queue.shift();
    const inA = A.accept.has(p);
    const inB = B.accept.has(q);
    if (op === "and" ? inA && inB : op === "or" ? inA || inB : op === "minus" ? inA && !inB : refuse("bad-argument", 'op is "and", "or" or "minus"')) accept.push(nm(p, q));
    delta[nm(p, q)] = {};
    for (const x of sigma) {
      const [p2, q2] = [[...A.delta.get(p).get(x)][0], [...B.delta.get(q).get(x)][0]];
      delta[nm(p, q)][x] = nm(p2, q2);
      if (!seen.has(nm(p2, q2))) {
        seen.add(nm(p2, q2));
        queue.push([p2, q2]);
      }
    }
  }
  return new Automaton({ states: [...seen], alphabet: sigma, start: nm(A.start, B.start), accept, delta });
}

// ---- regular expressions ------------------------------------------------------------------------

/**
 * Read a regular expression: letters and digits are symbols, | is union,
 * writing side by side is concatenation, * + ? are repetition, ( ) group,
 * ε (or eps) is the empty word and ∅ the empty language.
 * Returns a tree: { kind: "sym" | "eps" | "empty" | "cat" | "alt" | "star" | "plus" | "opt", … }.
 */
export function parseRegex(text) {
  const s = String(text).replace(/\s+/g, "").replace(/eps(ilon)?/g, "ε");
  let i = 0;
  const fail = (w) => refuse("syntax", `${w} at position ${i + 1} in "${text}"`);
  const alt = () => {
    let l = cat();
    while (s[i] === "|") {
      i++;
      l = { kind: "alt", left: l, right: cat() };
    }
    return l;
  };
  const cat = () => {
    const parts = [];
    while (i < s.length && s[i] !== "|" && s[i] !== ")") parts.push(post());
    if (!parts.length) return { kind: "eps" };
    return parts.reduce((a, b) => ({ kind: "cat", left: a, right: b }));
  };
  const post = () => {
    let x = atomR();
    while ("*+?".includes(s[i] ?? "#")) {
      const k = s[i++];
      x = { kind: k === "*" ? "star" : k === "+" ? "plus" : "opt", arg: x };
    }
    return x;
  };
  const atomR = () => {
    const c = s[i];
    if (c === undefined) fail("an expression was expected");
    if (c === "(") {
      i++;
      const x = alt();
      if (s[i] !== ")") fail('a ")" was expected');
      i++;
      return x;
    }
    if (c === "ε") {
      i++;
      return { kind: "eps" };
    }
    if (c === "∅") {
      i++;
      return { kind: "empty" };
    }
    if (/[A-Za-z0-9]/.test(c)) {
      i++;
      return { kind: "sym", symbol: c };
    }
    return fail(`"${c}" cannot start an expression`);
  };
  const tree = alt();
  if (i < s.length) fail(`unexpected "${s[i]}"`);
  return tree;
}
/** Thompson's construction: an NFA with ε moves for a regular expression. */
export function regexToNFA(input) {
  const t = typeof input === "string" ? parseRegex(input) : input;
  let n = 0;
  const delta = {};
  const symbols = new Set();
  const state = () => {
    const q = `s${n++}`;
    delta[q] = {};
    return q;
  };
  const edge = (p, a, q) => {
    const row = delta[p];
    const k = a === "" ? "ε" : a;
    row[k] = [...(row[k] ?? []), q];
  };
  const build = (x) => {
    const [i, f] = [state(), state()];
    switch (x.kind) {
      case "sym": symbols.add(x.symbol); edge(i, x.symbol, f); break;
      case "eps": edge(i, "", f); break;
      case "empty": break;
      case "cat": {
        const [a, b] = [build(x.left), build(x.right)];
        edge(i, "", a[0]); edge(a[1], "", b[0]); edge(b[1], "", f);
        break;
      }
      case "alt": {
        const [a, b] = [build(x.left), build(x.right)];
        edge(i, "", a[0]); edge(i, "", b[0]); edge(a[1], "", f); edge(b[1], "", f);
        break;
      }
      default: {
        const a = build(x.arg);
        edge(i, "", a[0]); edge(a[1], "", f);
        if (x.kind !== "plus") edge(i, "", f);
        if (x.kind !== "opt") edge(a[1], "", a[0]);
      }
    }
    return [i, f];
  };
  const [s0, f0] = build(t);
  return new Automaton({ states: Object.keys(delta), alphabet: [...symbols], start: s0, accept: [f0], delta });
}
/** A regular expression for an automaton's language, by eliminating states one at a time. */
export function toRegex(input) {
  const A = automaton(input);
  // edges as regex strings; "∅" absent
  const R = new Map();
  const get = (p, q) => R.get(`${p}→${q}`) ?? null;
  const union = (x, y) => (x === null ? y : y === null ? x : x === y ? x : `${x}|${y}`);
  const wrap = (x) => (x.length === 1 || /^\(.*\)$/.test(x) && balanced(x.slice(1, -1)) ? x : `(${x})`);
  const catR = (...xs) => {
    if (xs.some((x) => x === null)) return null;
    const ys = xs.filter((x) => x !== "ε");
    return ys.length ? ys.map((x) => (x.includes("|") ? `(${x})` : x)).join("") : "ε";
  };
  const starR = (x) => (x === null || x === "ε" ? "ε" : `${wrap(x)}*`);
  const set = (p, q, v) => (v === null ? R.delete(`${p}→${q}`) : R.set(`${p}→${q}`, v));
  const S = "⊢";
  const F = "⊣";
  set(S, A.start, "ε");
  for (const f of A.accept) set(f, F, union(get(f, F), "ε"));
  for (const [p, row] of A.delta) for (const [a, ts] of row) for (const q of ts) set(p, q, union(get(p, q), a === "" ? "ε" : a));
  const all = [S, ...A.states, F];
  for (const k of A.states) {
    const loop = starR(get(k, k));
    for (const p of all) {
      if (p === k) continue;
      const pk = get(p, k);
      if (pk === null) continue;
      for (const q of all) {
        if (q === k) continue;
        const kq = get(k, q);
        if (kq === null) continue;
        set(p, q, union(get(p, q), catR(pk, loop, kq)));
      }
    }
    for (const p of all) {
      R.delete(`${p}→${k}`);
      R.delete(`${k}→${p}`);
    }
  }
  return get(S, F) ?? "∅";
}
const balanced = (s) => {
  let d = 0;
  for (const c of s) {
    if (c === "(") d++;
    if (c === ")" && --d < 0) return false;
  }
  return d === 0;
};
