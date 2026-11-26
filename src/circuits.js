// Circuits of logic gates, Karnaugh maps, and the bridge between them and
// formulas. A circuit is a list of named gates; its outputs are formulas, so
// two circuits are compared by the satisfiability solver, and a difference
// comes with an input that shows it. A Karnaugh map lays a truth table of
// two to four atoms on a grid in Gray-code order and draws the groups the
// minimiser chose.

import { Formula, formula, refuse, atom, not, and, or } from "./formula.js";
import { equivalent } from "./sat.js";
import { minimize } from "./simplify.js";
import { minterms, fromMinterms } from "./semantics.js";

const GATES = {
  and: { min: 2, f: (xs) => xs.every(Boolean) },
  or: { min: 2, f: (xs) => xs.some(Boolean) },
  xor: { min: 2, f: (xs) => xs.filter(Boolean).length % 2 === 1 },
  nand: { min: 2, f: (xs) => !xs.every(Boolean) },
  nor: { min: 2, f: (xs) => !xs.some(Boolean) },
  xnor: { min: 2, f: (xs) => xs.filter(Boolean).length % 2 === 0 },
  not: { min: 1, max: 1, f: (xs) => !xs[0] },
  buf: { min: 1, max: 1, f: (xs) => Boolean(xs[0]) },
};

/**
 * A circuit:
 *   circuit({ inputs: ["a", "b", "cin"],
 *             gates: { s1: ["xor", "a", "b"], sum: ["xor", "s1", "cin"], … },
 *             outputs: ["sum", "cout"] })
 * Gate kinds: and, or, xor, nand, nor, xnor (two or more inputs), not, buf.
 * The wiring must not loop. A gate may feed any number of others.
 */
export class Circuit {
  constructor({ inputs, gates, outputs, name }) {
    this.name = name;
    this.inputs = [...inputs];
    this.gates = Object.fromEntries(Object.entries(gates).map(([k, g]) => [k, { kind: String(g[0]).toLowerCase(), from: g.slice(1).map(String) }]));
    this.outputs = [...(outputs ?? Object.keys(gates).slice(-1))];
    const known = new Set(this.inputs);
    for (const [k, g] of Object.entries(this.gates)) {
      if (known.has(k) && this.inputs.includes(k)) refuse("bad-circuit", `${k} is both an input and a gate`);
      const spec = GATES[g.kind] ?? refuse("bad-circuit", `gate ${k}: unknown kind ${g.kind}`);
      if (g.from.length < spec.min || (spec.max && g.from.length > spec.max)) refuse("bad-circuit", `gate ${k}: a ${g.kind} gate takes ${spec.max === 1 ? "one input" : `at least ${spec.min} inputs`}`);
    }
    for (const [k, g] of Object.entries(this.gates)) for (const s of g.from) if (!(s in this.gates) && !this.inputs.includes(s)) refuse("bad-circuit", `gate ${k} reads ${s}, which is neither an input nor a gate`);
    for (const o of this.outputs) if (!(o in this.gates) && !this.inputs.includes(o)) refuse("bad-circuit", `output ${o} is not a gate`);
    // a topological order, refusing loops
    const order = [];
    const state = new Map();
    const visit = (k, path) => {
      if (this.inputs.includes(k)) return;
      if (state.get(k) === 2) return;
      if (state.get(k) === 1) refuse("bad-circuit", `the wiring loops: ${[...path, k].join(" → ")}`);
      state.set(k, 1);
      for (const s of this.gates[k].from) visit(s, [...path, k]);
      state.set(k, 2);
      order.push(k);
    };
    for (const k of Object.keys(this.gates)) visit(k, []);
    this.order = order;
  }
  /** Output values for input values ({ a: 1, b: 0 } or [1, 0]). */
  evaluate(values) {
    const v = new Map();
    this.inputs.forEach((name, i) => {
      const x = Array.isArray(values) ? values[i] : values[name];
      if (x === undefined) refuse("no-value", `no value for input ${name}`);
      v.set(name, Boolean(x));
    });
    for (const k of this.order) v.set(k, GATES[this.gates[k].kind].f(this.gates[k].from.map((s) => v.get(s))));
    return Object.fromEntries(this.outputs.map((o) => [o, v.get(o) ? 1 : 0]));
  }
  /** One row per input combination: { inputs: [0/1 …], outputs: { name: 0/1 } }. */
  truthTable() {
    const n = this.inputs.length;
    if (n > 16) refuse("too-large", "a table over more than 16 inputs is too long to write out");
    const rows = [];
    for (let r = 0; r < 1 << n; r++) {
      const ins = this.inputs.map((_, j) => (r >> (n - 1 - j)) & 1);
      rows.push({ inputs: ins, outputs: this.evaluate(ins) });
    }
    return rows;
  }
  /** The formula an output computes, built gate by gate (shared gates are written out each time they are used). */
  formula(output = this.outputs[0]) {
    const memo = new Map();
    const go = (k) => {
      if (this.inputs.includes(k)) return atom(k);
      if (memo.has(k)) return memo.get(k);
      const g = this.gates[k];
      const xs = g.from.map(go);
      const fold = (kind) => xs.reduce((a, b) => new Formula(kind, a, b));
      let f;
      switch (g.kind) {
        case "and": f = fold("and"); break;
        case "or": f = fold("or"); break;
        case "xor": f = fold("xor"); break;
        case "nand": f = not(fold("and")); break;
        case "nor": f = not(fold("or")); break;
        case "xnor": f = not(fold("xor")); break;
        case "not": f = not(xs[0]); break;
        default: f = xs[0];
      }
      memo.set(k, f);
      return f;
    };
    return go(output);
  }
  /** How many gates, and the longest path from an input to an output (in gates). */
  get size() {
    return Object.keys(this.gates).length;
  }
  get depth() {
    const d = new Map(this.inputs.map((i) => [i, 0]));
    for (const k of this.order) d.set(k, 1 + Math.max(...this.gates[k].from.map((s) => d.get(s))));
    return Math.max(0, ...this.outputs.map((o) => d.get(o)));
  }
  /** Gates of each kind. */
  get counts() {
    const out = {};
    for (const g of Object.values(this.gates)) out[g.kind] = (out[g.kind] ?? 0) + 1;
    return out;
  }
}
export const circuit = (spec) => (spec instanceof Circuit ? spec : new Circuit(spec));

/**
 * Do two circuits (or a circuit and formulas) compute the same outputs?
 * Outputs are matched by position. Returns { status: "equivalent" } or
 * { status: "different", output, inputs, values } with an input that shows
 * the difference, checked by running both circuits on it.
 */
export function circuitsEquivalent(a, b) {
  const A = a instanceof Circuit ? a : null;
  const forms = (x) => (x instanceof Circuit ? x.outputs.map((o) => x.formula(o)) : (Array.isArray(x) ? x : [x]).map(formula));
  const fa = forms(a);
  const fb = forms(b);
  if (fa.length !== fb.length) refuse("bad-argument", `one side has ${fa.length} outputs and the other ${fb.length}`);
  for (let i = 0; i < fa.length; i++) {
    const r = equivalent(fa[i], fb[i]);
    if (r.status === "different") {
      const names = A ? A.inputs : [...new Set([...fa[i].atoms(), ...fb[i].atoms()])];
      const inputs = Object.fromEntries(names.map((n) => [n, r.witness[n] ? 1 : 0]));
      return { status: "different", output: A ? A.outputs[i] : i, inputs, values: r.values.map((v) => (v ? 1 : 0)) };
    }
    if (r.status !== "equivalent") return r;
  }
  return { status: "equivalent" };
}

/**
 * A circuit for a formula. gates: "standard" (and, or, not, xor as written),
 * "nand" or "nor" (only that gate: every connective rewritten in it).
 * Equal subformulas share one gate.
 */
export function circuitFrom(input, { gates = "standard", output = "out" } = {}) {
  const f = formula(input);
  const inputs = f.atoms();
  const table = {};
  const byKey = new Map();
  let n = 0;
  const gate = (kind, ...from) => {
    const key = `${kind}(${from.join(",")})`;
    if (byKey.has(key)) return byKey.get(key);
    const name = `g${++n}`;
    table[name] = [kind, ...from];
    byKey.set(key, name);
    return name;
  };
  // only-NAND and only-NOR translations of each connective; a negation of a
  // negation gives back what was negated, and gates left unused are dropped
  const negOf = (kind, x) => {
    const g = table[x];
    return g && g[0] === kind && g.length === 3 && g[1] === g[2] ? g[1] : gate(kind, x, x);
  };
  const NAND = {
    not: (x) => negOf("nand", x),
    and: (x, y) => NAND.not(gate("nand", x, y)),
    or: (x, y) => gate("nand", NAND.not(x), NAND.not(y)),
  };
  const NOR = {
    not: (x) => negOf("nor", x),
    or: (x, y) => NOR.not(gate("nor", x, y)),
    and: (x, y) => gate("nor", NOR.not(x), NOR.not(y)),
  };
  const kit = gates === "nand" ? NAND : gates === "nor" ? NOR : gates === "standard" ? null : refuse("bad-argument", 'gates is "standard", "nand" or "nor"');
  const go = (g) => {
    switch (g.kind) {
      case "atom": return g.name;
      case "top": case "bot": {
        // a constant from any input: x ∨ ¬x or x ∧ ¬x
        const x = inputs[0] ?? refuse("bad-argument", "a constant formula with no atoms has no inputs to build from");
        return go(g.kind === "top" ? or(atom(x), not(atom(x))) : and(atom(x), not(atom(x))));
      }
      case "not": return kit ? kit.not(go(g.arg)) : gate("not", go(g.arg));
      case "and": case "or": return kit ? kit[g.kind](go(g.left), go(g.right)) : gate(g.kind, go(g.left), go(g.right));
      case "imp": return go(or(not(g.left), g.right));
      case "iff": return go(or(and(g.left, g.right), and(not(g.left), not(g.right))));
      default: return kit ? go(or(and(g.left, not(g.right)), and(not(g.left), g.right))) : gate("xor", go(g.left), go(g.right));
    }
  };
  let top = go(f);
  const used = new Set();
  const mark = (x) => {
    if (used.has(x) || !table[x]) return;
    used.add(x);
    table[x].slice(1).forEach(mark);
  };
  mark(top);
  for (const k of Object.keys(table)) if (!used.has(k)) delete table[k];
  if (inputs.includes(top)) {
    table[output] = ["buf", top];
    top = output;
  } else {
    // rename the last gate to the output's name
    table[output] = table[top];
    delete table[top];
    for (const g of Object.values(table)) for (let i = 1; i < g.length; i++) if (g[i] === top) g[i] = output;
    top = output;
  }
  return new Circuit({ inputs, gates: table, outputs: [top] });
}

/** Adders, built from gates and checked against arithmetic in the tests. */
export const adders = Object.freeze({
  half: () => new Circuit({ inputs: ["a", "b"], gates: { sum: ["xor", "a", "b"], carry: ["and", "a", "b"] }, outputs: ["sum", "carry"], name: "half adder" }),
  full: () =>
    new Circuit({
      inputs: ["a", "b", "cin"],
      gates: { s1: ["xor", "a", "b"], sum: ["xor", "s1", "cin"], c1: ["and", "a", "b"], c2: ["and", "s1", "cin"], cout: ["or", "c1", "c2"] },
      outputs: ["sum", "cout"],
      name: "full adder",
    }),
  /** n-bit ripple-carry adder: inputs a{n-1}…a0, b{n-1}…b0; outputs s{n-1}…s0 and the carry out. */
  ripple(n) {
    if (!Number.isInteger(n) || n < 1 || n > 32) refuse("bad-argument", "n is a whole number of bits from 1 to 32");
    const g = {};
    const ins = [];
    for (let i = n - 1; i >= 0; i--) ins.push(`a${i}`);
    for (let i = n - 1; i >= 0; i--) ins.push(`b${i}`);
    let carry = null;
    for (let i = 0; i < n; i++) {
      const [a, b] = [`a${i}`, `b${i}`];
      if (carry === null) {
        g[`s${i}`] = ["xor", a, b];
        g[`c${i}`] = ["and", a, b];
      } else {
        g[`x${i}`] = ["xor", a, b];
        g[`s${i}`] = ["xor", `x${i}`, carry];
        g[`p${i}`] = ["and", a, b];
        g[`q${i}`] = ["and", `x${i}`, carry];
        g[`c${i}`] = ["or", `p${i}`, `q${i}`];
      }
      carry = `c${i}`;
    }
    const outs = [];
    for (let i = n - 1; i >= 0; i--) outs.push(`s${i}`);
    return new Circuit({ inputs: ins, gates: g, outputs: [carry, ...outs], name: `${n}-bit ripple-carry adder` });
  },
});

// ---- Karnaugh maps --------------------------------------------------------------------------------

const gray = (k) => Array.from({ length: 1 << k }, (_, i) => i ^ (i >> 1));
/**
 * A Karnaugh map of a formula (or { minterms, atoms, dontCares }) over two to
 * four atoms. The first half of the atoms label the rows and the rest the
 * columns, both in Gray-code order, so neighbouring cells differ in one atom
 * (and the edges wrap). `groups` are the prime implicants the minimiser
 * chose, each with the cells it covers; `formula` is the minimal sum of
 * products they give.
 */
export function karnaugh(input, { atoms, dontCares = [] } = {}) {
  let f;
  let names;
  let dc = [...dontCares];
  if (input && typeof input === "object" && !(input instanceof Formula) && Array.isArray(input.minterms)) {
    names = (input.atoms ?? refuse("bad-argument", "give the atoms with the minterms")).map(String);
    f = fromMinterms(names, input.minterms);
    dc = input.dontCares ?? dc;
  } else {
    f = formula(input);
    names = atoms ? atoms.map(String) : f.atoms();
  }
  const n = names.length;
  if (n < 2 || n > 4) refuse("bad-argument", "a Karnaugh map here has two to four atoms");
  const rowBits = n >> 1;
  const colBits = n - rowBits;
  const rowAtoms = names.slice(0, rowBits);
  const colAtoms = names.slice(rowBits);
  const on = new Set(minterms(f, names));
  const dcSet = new Set(dc.filter((r) => !on.has(r)));
  const m = minimize(f, { atoms: names, dontCare: dcSet.size ? fromMinterms(names, [...dcSet]) : undefined });
  const rows = gray(rowBits);
  const cols = gray(colBits);
  const cellRow = (r, c) => (rows[r] << colBits) | cols[c];
  const cells = rows.map((_, r) => cols.map((_, c) => {
    const row = cellRow(r, c);
    return on.has(row) ? 1 : dcSet.has(row) ? "x" : 0;
  }));
  const valuation = (row) => Object.fromEntries(names.map((name, j) => [name, (row >> (n - 1 - j)) & 1]));
  const groups = m.primes
    .filter((p) => p.chosen)
    .map((p) => {
      const at = [];
      rows.forEach((_, r) => cols.forEach((_, c) => p.formula.evaluate(valuation(cellRow(r, c))) && at.push([r, c])));
      return { formula: p.formula, cells: at, size: at.length, essential: p.essential };
    });
  const label = (bits, k) => bits.toString(2).padStart(k, "0");
  return {
    atoms: names,
    rowAtoms,
    colAtoms,
    rowLabels: rows.map((x) => label(x, rowBits)),
    colLabels: cols.map((x) => label(x, colBits)),
    cells,
    groups,
    formula: m.formula,
    /** the map as text */
    toString() {
      const head = `${rowAtoms.join("")}\\${colAtoms.join("")}`;
      const w = Math.max(head.length, rowBits) + 1;
      const lines = [head.padEnd(w) + this.colLabels.map((l) => l.padStart(4)).join("")];
      this.rowLabels.forEach((l, r) => lines.push(l.padEnd(w) + cells[r].map((v) => String(v).padStart(4)).join("")));
      return lines.join("\n");
    },
  };
}
