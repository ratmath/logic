// Modal logic: formulas with □ (necessarily) and ◇ (possibly), Kripke models
// in which they are evaluated world by world, validity on a finite frame,
// the frame conditions of the usual systems, and truth trees for K, T, S4
// and S5. A tree that closes is a proof; an open branch gives a Kripke model,
// which is checked (the formula fails at its first world and the frame has
// the system's properties) before it is returned as a countermodel.

import { refuse } from "./formula.js";

const BIN = new Set(["and", "or", "imp", "iff"]);
const SYM = {
  unicode: { not: "¬", and: "∧", or: "∨", imp: "→", iff: "↔", top: "⊤", bot: "⊥", box: "□", dia: "◇" },
  ascii: { not: "~", and: "&", or: "|", imp: "->", iff: "<->", top: "true", bot: "false", box: "[]", dia: "<>" },
  tex: { not: "\\lnot ", and: "\\land", or: "\\lor", imp: "\\to", iff: "\\leftrightarrow", top: "\\top", bot: "\\bot", box: "\\Box ", dia: "\\Diamond " },
};

/** A modal formula: kinds atom, top, bot, not, and, or, imp, iff, box, dia. */
export class ModalFormula {
  constructor(kind, a, b) {
    this.kind = kind;
    if (kind === "atom") {
      this.name = a;
      this.key = a;
    } else if (kind === "top" || kind === "bot") this.key = SYM.unicode[kind];
    else if (kind === "not" || kind === "box" || kind === "dia") {
      this.arg = a;
      this.key = SYM.unicode[kind] + a.key;
    } else if (BIN.has(kind)) {
      this.left = a;
      this.right = b;
      this.key = `(${a.key}${SYM.unicode[kind]}${b.key})`;
    } else throw new TypeError(`unknown kind ${kind}`);
    Object.freeze(this);
  }
  get parts() {
    return this.arg ? [this.arg] : this.left ? [this.left, this.right] : [];
  }
  atoms() {
    const s = new Set();
    const go = (f) => (f.kind === "atom" ? s.add(f.name) : f.parts.forEach(go));
    go(this);
    return [...s].sort();
  }
  /** The most nested boxes and diamonds on a path. */
  get modalDepth() {
    const inner = this.parts.length ? Math.max(...this.parts.map((p) => p.modalDepth)) : 0;
    return inner + (this.kind === "box" || this.kind === "dia" ? 1 : 0);
  }
  equals(o) {
    return modal(o).key === this.key;
  }
  toString({ style = "unicode" } = {}) {
    const s = SYM[style];
    const show = (f) => {
      switch (f.kind) {
        case "atom": return f.name;
        case "top": case "bot": return s[f.kind];
        case "not": case "box": case "dia": return s[f.kind] + (BIN.has(f.arg.kind) ? `(${show(f.arg)})` : show(f.arg));
        default: {
          const chain = f.kind === "and" || f.kind === "or";
          const l = !BIN.has(f.left.kind) || (chain && f.left.kind === f.kind) ? show(f.left) : `(${show(f.left)})`;
          const r = !BIN.has(f.right.kind) ? show(f.right) : `(${show(f.right)})`;
          return `${l} ${s[f.kind]} ${r}`;
        }
      }
    };
    return show(this);
  }
  toJSON() {
    return this.toString();
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `ModalFormula(${this})`;
  }
}

const TOK = [
  ["<->", "iff"], ["<=>", "iff"], ["↔", "iff"], ["->", "imp"], ["=>", "imp"], ["→", "imp"], ["⊃", "imp"],
  ["[]", "box"], ["□", "box"], ["◻", "box"], ["■", "box"], ["<>", "dia"], ["◇", "dia"], ["◊", "dia"], ["⋄", "dia"],
  ["&&", "and"], ["&", "and"], ["∧", "and"], ["/\\", "and"], ["||", "or"], ["|", "or"], ["∨", "or"], ["\\/", "or"],
  ["¬", "not"], ["~", "not"], ["!", "not"], ["⊤", "top"], ["⊥", "bot"], ["(", "("], [")", ")"],
];
const WORDS = { not: "not", and: "and", or: "or", implies: "imp", iff: "iff", true: "top", false: "bot", nec: "box", box: "box", poss: "dia", dia: "dia" };
/**
 * Read a modal formula: □ (also [], box, nec) and ◇ (also <>, dia, poss)
 * bind as tightly as ¬; the other connectives as in propositional formulas.
 */
export function parseModal(text) {
  const toks = [];
  let i = 0;
  scan: while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    for (const [s, t] of TOK) if (text.startsWith(s, i)) {
      toks.push({ type: t, text: s, at: i });
      i += s.length;
      continue scan;
    }
    const m = /^[A-Za-z_][A-Za-z0-9_]*'*/.exec(text.slice(i));
    if (m) {
      toks.push(Object.hasOwn(WORDS, m[0]) ? { type: WORDS[m[0]], text: m[0], at: i } : { type: "atom", text: m[0], at: i });
      i += m[0].length;
      continue;
    }
    refuse("syntax", `unexpected "${text[i]}" at position ${i + 1} in "${text}"`);
  }
  let pos = 0;
  const peek = () => toks[pos]?.type;
  const fail = (w) => refuse("syntax", toks[pos] ? `${w}, but found "${toks[pos].text}" at position ${toks[pos].at + 1} in "${text}"` : `${w}, but "${text}" ends`);
  const level = (ops, next, right) => {
    const go = () => {
      let l = next();
      while (ops.includes(peek())) {
        const k = toks[pos++].type;
        if (right) return new ModalFormula(k, l, go());
        l = new ModalFormula(k, l, next());
      }
      return l;
    };
    return go;
  };
  const unary = () => {
    const t = toks[pos];
    if (!t) fail("a formula was expected");
    if (t.type === "not" || t.type === "box" || t.type === "dia") {
      pos++;
      return new ModalFormula(t.type, unary());
    }
    if (t.type === "atom") {
      pos++;
      return new ModalFormula("atom", t.text);
    }
    if (t.type === "top" || t.type === "bot") {
      pos++;
      return new ModalFormula(t.type);
    }
    if (t.type === "(") {
      pos++;
      const f = iffL();
      if (peek() !== ")") fail('a ")" was expected');
      pos++;
      return f;
    }
    return fail("a formula was expected");
  };
  const andL = level(["and"], unary);
  const orL = level(["or"], andL);
  const impL = level(["imp"], orL, true);
  const iffL = level(["iff"], impL);
  const f = iffL();
  if (pos < toks.length) fail("a connective was expected");
  return f;
}
export const modal = (x) => (x instanceof ModalFormula ? x : typeof x === "string" ? parseModal(x) : refuse("bad-argument", `cannot read ${x} as a modal formula`));

// ---- Kripke models ------------------------------------------------------------------------------------

/**
 * A Kripke model: { worlds: ["w1", "w2"], access: [["w1", "w2"], …] (or
 * { w1: ["w2"] }), valuation: { p: ["w1"] } } — p is true exactly at the
 * worlds listed. A frame is the same without a valuation.
 */
export class Kripke {
  constructor({ worlds, access = [], valuation = {} }) {
    this.worlds = (typeof worlds === "number" ? Array.from({ length: worlds }, (_, i) => `w${i + 1}`) : worlds).map(String);
    if (!this.worlds.length) refuse("bad-model", "a model has at least one world");
    const W = new Set(this.worlds);
    const pairs = Array.isArray(access) ? access : Object.entries(access).flatMap(([w, vs]) => vs.map((v) => [w, v]));
    this.R = new Map(this.worlds.map((w) => [w, new Set()]));
    for (const [w, v] of pairs) {
      if (!W.has(String(w)) || !W.has(String(v))) refuse("bad-model", `the access ${w} → ${v} names a world that is not in the model`);
      this.R.get(String(w)).add(String(v));
    }
    this.valuation = Object.fromEntries(Object.entries(valuation).map(([p, ws]) => [p, new Set(ws.map(String))]));
  }
  sees(w) {
    return [...this.R.get(String(w))];
  }
  /** The model as plain data: { worlds, access: { w: [worlds it sees] }, valuation: { p: [worlds] } }. */
  describe() {
    return {
      worlds: [...this.worlds],
      access: Object.fromEntries(this.worlds.map((w) => [w, this.sees(w)])),
      valuation: Object.fromEntries(Object.entries(this.valuation).map(([p, ws]) => [p, [...ws]])),
    };
  }
  /** Is the formula true at world w? With explain, the reasons. */
  truthAt(input, w, { explain = false } = {}) {
    const f = modal(input);
    const steps = [];
    const go = (g, x, d) => {
      let v;
      let why = "";
      switch (g.kind) {
        case "atom": v = this.valuation[g.name]?.has(x) ?? false; why = `${g.name} is ${v ? "true" : "false"} at ${x}`; break;
        case "top": v = true; break;
        case "bot": v = false; break;
        case "not": v = !go(g.arg, x, d + 1); break;
        case "and": v = go(g.left, x, d + 1) && go(g.right, x, d + 1); break;
        case "or": v = go(g.left, x, d + 1) || go(g.right, x, d + 1); break;
        case "imp": v = !go(g.left, x, d + 1) || go(g.right, x, d + 1); break;
        case "iff": v = go(g.left, x, d + 1) === go(g.right, x, d + 1); break;
        case "box": {
          const bad = this.sees(x).find((y) => !go(g.arg, y, d + 1));
          v = bad === undefined;
          why = v ? `${g.arg} holds at every world ${x} sees (${this.sees(x).join(", ") || "none"})` : `${g.arg} fails at ${bad}, which ${x} sees`;
          break;
        }
        default: {
          const good = this.sees(x).find((y) => go(g.arg, y, d + 1));
          v = good !== undefined;
          why = v ? `${g.arg} holds at ${good}, which ${x} sees` : `${g.arg} holds at no world ${x} sees`;
        }
      }
      if (explain) steps.push({ depth: d, text: `${g} at ${x}: ${v}${why ? ` (${why})` : ""}` });
      return v;
    };
    const value = go(f, String(w), 0);
    return explain ? { value, steps: steps.reverse().map((s) => "  ".repeat(s.depth) + s.text) } : value;
  }
  /** The worlds where the formula is true. */
  trueAt(input) {
    return this.worlds.filter((w) => this.truthAt(input, w));
  }
  /** True at every world. */
  holds(input) {
    return this.trueAt(input).length === this.worlds.length;
  }
  /** Which of the frame properties hold. */
  properties() {
    const W = this.worlds;
    const R = (a, b) => this.R.get(a).has(b);
    return {
      reflexive: W.every((w) => R(w, w)),
      symmetric: W.every((w) => W.every((v) => !R(w, v) || R(v, w))),
      transitive: W.every((w) => W.every((v) => !R(w, v) || W.every((u) => !R(v, u) || R(w, u)))),
      serial: W.every((w) => W.some((v) => R(w, v))),
      euclidean: W.every((w) => W.every((v) => !R(w, v) || W.every((u) => !R(w, u) || R(v, u)))),
    };
  }
}
export const kripke = (spec) => (spec instanceof Kripke ? spec : new Kripke(spec));

/** The frame conditions of each system. */
export const SYSTEMS = Object.freeze({
  K: [],
  D: ["serial"],
  T: ["reflexive"],
  B: ["reflexive", "symmetric"],
  S4: ["reflexive", "transitive"],
  S5: ["reflexive", "symmetric", "transitive"],
});
/**
 * Is the formula valid on the frame (true at every world under every
 * valuation)? Tries all 2^(atoms × worlds) valuations, up to 2^20.
 * Returns { valid } or { valid: false, valuation, world } as a countermodel.
 */
export function validOnFrame(input, frame) {
  const f = modal(input);
  const F = kripke(frame);
  const atoms = f.atoms();
  const n = atoms.length * F.worlds.length;
  if (n > 20) refuse("too-large", `${atoms.length} atoms on ${F.worlds.length} worlds is 2^${n} valuations; the limit is 2^20`);
  for (let mask = 0; mask < 1 << n; mask++) {
    const valuation = Object.fromEntries(atoms.map((p, i) => [p, F.worlds.filter((_, j) => (mask >> (i * F.worlds.length + j)) & 1)]));
    const M = new Kripke({ worlds: F.worlds, access: [...F.R].flatMap(([w, vs]) => [...vs].map((v) => [w, v])), valuation });
    const w = F.worlds.find((x) => !M.truthAt(f, x));
    if (w !== undefined) return { valid: false, valuation, world: w, model: M };
  }
  return { valid: true };
}

// ---- truth trees --------------------------------------------------------------------------------------

const N = (f) => new ModalFormula("not", f);
const A = (a, b) => new ModalFormula("and", a, b);
function shape(f) {
  switch (f.kind) {
    case "and": return { t: "alpha", parts: [f.left, f.right] };
    case "or": return { t: "beta", parts: [f.left, f.right] };
    case "imp": return { t: "beta", parts: [N(f.left), f.right] };
    case "iff": return { t: "beta", parts: [A(f.left, f.right), A(N(f.left), N(f.right))] };
    case "box": return { t: "nu", body: f.arg };
    case "dia": return { t: "pi", body: f.arg };
    case "bot": return { t: "closed" };
    case "not": {
      const g = f.arg;
      if (g.kind === "not") return { t: "alpha", parts: [g.arg] };
      if (g.kind === "or") return { t: "alpha", parts: [N(g.left), N(g.right)] };
      if (g.kind === "imp") return { t: "alpha", parts: [g.left, N(g.right)] };
      if (g.kind === "and") return { t: "beta", parts: [N(g.left), N(g.right)] };
      if (g.kind === "iff") return { t: "beta", parts: [A(g.left, N(g.right)), A(N(g.left), g.right)] };
      if (g.kind === "box") return { t: "pi", body: N(g.arg) };
      if (g.kind === "dia") return { t: "nu", body: N(g.arg) };
      if (g.kind === "top") return { t: "closed" };
      return { t: "lit" };
    }
    default: return { t: "lit" };
  }
}

/**
 * Is the formula valid in the system (K, D, T, B, S4 or S5)? A labelled
 * truth tree starts from its negation at world w1.
 *   { status: "valid", tree }                          every branch closed
 *   { status: "invalid", countermodel, world: "w1" }   checked, on a frame of the system
 *   { status: "unresolved", reason }                   the budget ran out
 * S4 and S5 trees can grow without end; a world whose formulas are all
 * already at an earlier world is not given new successors (it points back to
 * that world instead), which keeps the trees finite.
 */
export function modalValid(input, { system = "K", budget = 20000 } = {}) {
  const f = modal(input);
  const props = SYSTEMS[system] ?? refuse("bad-argument", `system is one of ${Object.keys(SYSTEMS).join(", ")}`);
  const refl = props.includes("reflexive");
  const trans = props.includes("transitive");
  const symm = props.includes("symmetric");
  const serial = props.includes("serial");
  let steps = 0;
  let hit = false;
  let worldCount = 1;
  // state: worlds list, edges, facts: Map world → Map key → formula, queues
  const copy = (st) => ({
    worlds: [...st.worlds],
    edges: st.edges.map((e) => [...e]),
    facts: new Map([...st.facts].map(([w, m]) => [w, new Map(m)])),
    done: new Set(st.done),
    parent: new Map(st.parent),
    blocked: new Map(st.blocked),
    closed: st.closed,
    log: [],
  });
  const access = (st) => {
    // the relation the system's rules see: edges, closed under the frame conditions
    const W = st.worlds;
    const R = new Map(W.map((w) => [w, new Set()]));
    for (const [a, b] of st.edges) R.get(a).add(b);
    for (const [a, b] of st.blocked) R.get(a).add(b);
    let changed = true;
    while (changed) {
      changed = false;
      const addE = (a, b) => {
        if (!R.get(a).has(b)) {
          R.get(a).add(b);
          changed = true;
        }
      };
      for (const w of W) {
        if (refl) addE(w, w);
        for (const v of [...R.get(w)]) {
          if (symm) addE(v, w);
          if (trans) for (const u of [...R.get(v)]) addE(w, u);
        }
      }
    }
    return R;
  };
  const put = (st, w, g, why) => {
    const m = st.facts.get(w);
    if (m.has(g.key)) return false;
    m.set(g.key, g);
    st.log.push({ world: w, formula: String(g), why });
    if (shape(g).t === "closed") st.closed ??= `${g} at ${w}`;
    else if (g.kind === "not" && m.has(g.arg.key)) st.closed ??= `${g.arg} and ${g} at ${w}`;
    else if (m.has(N(g).key)) st.closed ??= `${g} and ${N(g)} at ${w}`;
    return true;
  };
  const grow = (st) => {
    const node = { lines: st.log, closed: null, open: false, branches: null };
    for (;;) {
      if (++steps > budget) {
        hit = true;
        node.unfinished = true;
        return node;
      }
      if (st.closed) {
        node.closed = st.closed;
        return node;
      }
      st.log = node.lines;
      let acted = false;
      // alpha
      for (const w of st.worlds) {
        for (const g of st.facts.get(w).values()) {
          const id = `${w}|${g.key}`;
          const s = shape(g);
          if (s.t === "alpha" && !st.done.has(id)) {
            st.done.add(id);
            for (const p of s.parts) put(st, w, p, `from ${g}`);
            acted = true;
            break;
          }
        }
        if (acted) break;
      }
      if (acted) continue;
      // nu: □A at w gives A at every world w reaches
      const R = access(st);
      for (const w of st.worlds) {
        for (const g of st.facts.get(w).values()) {
          const s = shape(g);
          if (s.t !== "nu") continue;
          for (const v of R.get(w)) if (put(st, v, s.body, `from ${g} at ${w}`)) acted = true;
        }
      }
      if (acted) continue;
      // beta
      for (const w of st.worlds) {
        for (const g of st.facts.get(w).values()) {
          const id = `${w}|${g.key}`;
          const s = shape(g);
          if (s.t === "beta" && !st.done.has(id)) {
            st.done.add(id);
            node.branches = s.parts.map((p) => {
              const next = copy(st);
              put(next, w, p, `from ${g}`);
              return grow(next);
            });
            node.closed = node.branches.every((b) => b.closed) ? "below" : null;
            node.open = node.branches.some((b) => b.open);
            return node;
          }
        }
      }
      // pi: ◇A at w makes a new world, unless w is blocked
      const isBlocked = (w) => {
        if (!(trans || symm) || w === "w1") return null;
        const mine = [...st.facts.get(w).keys()];
        // an earlier world (on the path back to w1, or any earlier world in S5) with all of w's formulas
        const candidates = symm && trans ? st.worlds.slice(0, st.worlds.indexOf(w)) : ancestors(st, w);
        return candidates.find((u) => mine.every((k) => st.facts.get(u).has(k))) ?? null;
      };
      for (const w of st.worlds) {
        if (st.blocked.has(w)) continue;
        for (const g of st.facts.get(w).values()) {
          const id = `${w}|${g.key}`;
          const s = shape(g);
          if (s.t !== "pi" || st.done.has(id)) continue;
          const b = isBlocked(w);
          if (b) {
            st.blocked.set(w, b);
            acted = true;
            break;
          }
          st.done.add(id);
          const v = `w${++worldCount}`;
          st.worlds.push(v);
          st.facts.set(v, new Map());
          st.edges.push([w, v]);
          st.parent.set(v, w);
          st.log.push({ world: v, formula: `${w} sees ${v}`, why: `for ${g} at ${w}` });
          put(st, v, s.body, `from ${g} at ${w}`);
          acted = true;
          break;
        }
        if (acted) break;
      }
      if (acted) continue;
      // seriality: a world with no successor gets one
      if (serial) {
        const R2 = access(st);
        const lonely = st.worlds.find((w) => R2.get(w).size === 0);
        if (lonely) {
          // a world with no □ to pass on may see itself; otherwise it gets a new successor
          if (![...st.facts.get(lonely).values()].some((g) => shape(g).t === "nu")) {
            st.edges.push([lonely, lonely]);
            continue;
          }
          const v = `w${++worldCount}`;
          st.worlds.push(v);
          st.facts.set(v, new Map());
          st.edges.push([lonely, v]);
          st.parent.set(v, lonely);
          st.log.push({ world: v, formula: `${lonely} sees ${v}`, why: "every world sees some world (D)" });
          continue;
        }
      }
      node.open = true;
      node.state = st;
      return node;
    }
  };
  const ancestors = (st, w) => {
    const out = [];
    let x = st.parent.get(w);
    while (x) {
      out.push(x);
      x = st.parent.get(x);
    }
    return out;
  };
  const root = { worlds: ["w1"], edges: [], facts: new Map([["w1", new Map()]]), done: new Set(), parent: new Map(), blocked: new Map(), closed: null, log: [] };
  put(root, "w1", N(f), "the formula is assumed false at w1");
  const tree = grow(root);
  const strip = (n) => ({ lines: n.lines.map((l) => `${l.world}: ${l.formula}${l.why ? `    (${l.why})` : ""}`), closed: n.closed, open: n.open && !n.branches, branches: n.branches ? n.branches.map(strip) : null, unfinished: n.unfinished ?? false });
  if (tree.closed) return { status: "valid", system, tree: strip(tree) };
  const leaf = (n) => (n.open && !n.branches ? n : n.branches ? n.branches.map(leaf).find(Boolean) : null);
  const open = leaf(tree);
  if (open) {
    const st = open.state;
    const R = access(st);
    const atoms = f.atoms();
    const valuation = Object.fromEntries(atoms.map((p) => [p, st.worlds.filter((w) => st.facts.get(w).has(p))]));
    const M = new Kripke({ worlds: st.worlds, access: [...R].flatMap(([w, vs]) => [...vs].map((v) => [w, v])), valuation });
    const p = M.properties();
    if (!M.truthAt(f, "w1") && props.every((x) => p[x])) return { status: "invalid", system, countermodel: M, world: "w1", tree: strip(tree) };
  }
  return { status: "unresolved", system, reason: hit ? `the tree was still growing after ${budget} steps` : "an open branch did not give a model that checks", tree: strip(tree) };
}

/** The tree as indented text. */
export function showModalTree(tree) {
  const out = [];
  const go = (n, d) => {
    n.lines.forEach((l) => out.push("  ".repeat(d) + l));
    if (n.branches) n.branches.forEach((b, i) => {
      out.push(`${"  ".repeat(d)}${i ? "└" : "┌"} branch ${i + 1}`);
      go(b, d + 1);
    });
    else out.push("  ".repeat(d) + (n.closed ? `× closed: ${n.closed}` : n.open ? "○ open" : "… unfinished"));
  };
  go(tree, 0);
  return out.join("\n");
}
