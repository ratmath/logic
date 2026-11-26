// Truth trees for predicate logic, with a budget. A tree that closes is a
// proof; a branch that stays open after every rule has been used (with every
// name on it) gives a finite countermodel, which is checked by evaluation
// before it is returned. Many invalid arguments need an infinite
// countermodel, and then the tree never stops growing: at the budget the
// answer is "unresolved", never a guess.

import { refuse } from "./formula.js";
import { FOFormula, Term, fo, foList, Structure, evaluate, countermodel } from "./predicate.js";

const N = (f) => new FOFormula("not", f);
const AND = (a, b) => new FOFormula("and", a, b);

/** How a formula is taken apart: { type: "alpha" | "beta" | "delta" | "gamma" | "literal", … } */
function shape(f) {
  if (f.kind === "and") return { type: "alpha", parts: [f.left, f.right] };
  if (f.kind === "or") return { type: "beta", parts: [f.left, f.right] };
  if (f.kind === "imp") return { type: "beta", parts: [N(f.left), f.right] };
  if (f.kind === "iff") return { type: "beta", parts: [AND(f.left, f.right), AND(N(f.left), N(f.right))] };
  if (f.kind === "xor") return { type: "beta", parts: [AND(f.left, N(f.right)), AND(N(f.left), f.right)] };
  if (f.kind === "ex") return { type: "delta", variable: f.variable, body: f.body };
  if (f.kind === "all") return { type: "gamma", variable: f.variable, body: f.body };
  if (f.kind === "not") {
    const g = f.arg;
    if (g.kind === "not") return { type: "alpha", parts: [g.arg] };
    if (g.kind === "or") return { type: "alpha", parts: [N(g.left), N(g.right)] };
    if (g.kind === "imp") return { type: "alpha", parts: [g.left, N(g.right)] };
    if (g.kind === "and") return { type: "beta", parts: [N(g.left), N(g.right)] };
    if (g.kind === "iff") return { type: "beta", parts: [AND(g.left, N(g.right)), AND(N(g.left), g.right)] };
    if (g.kind === "xor") return { type: "beta", parts: [AND(g.left, g.right), AND(N(g.left), N(g.right))] };
    if (g.kind === "all") return { type: "delta", variable: g.variable, body: N(g.body) };
    if (g.kind === "ex") return { type: "gamma", variable: g.variable, body: N(g.body) };
    if (g.kind === "top") return { type: "closed" };
    if (g.kind === "bot") return { type: "alpha", parts: [] };
  }
  if (f.kind === "bot") return { type: "closed" };
  return { type: "literal" };
}
const closedTerms = (f, out) => {
  const term = (t) => {
    if (t.kind === "var") return false;
    const ground = t.args.map(term).every(Boolean);
    if (ground) out.set(t.key, t);
    return ground;
  };
  const go = (g) => {
    if (g.kind === "pred") g.args.forEach(term);
    else if (g.kind === "eq") [g.left, g.right].forEach(term);
    else g.parts.forEach(go);
  };
  go(f);
  return out;
};

/**
 * Test an argument by a truth tree:
 *   foTableau(premises, conclusion, { budget })
 * Start with the premises and the negated conclusion. Returns
 *   { status: "valid", tree }                      every branch closed
 *   { status: "invalid", countermodel, tree }       an open, finished branch, checked
 *   { status: "unresolved", reason, budget }
 * `tree` is a nested record: { lines: [{ formula, why }], closed, open, branches }.
 */
export function foTableau(premises, conclusion, { budget = 20000 } = {}) {
  const start = [...foList(premises)];
  if (conclusion !== undefined && conclusion !== null) start.push(N(fo(conclusion)));
  for (const f of start) if (!f.isSentence) refuse("free-variable", `${f} has free variables: give sentences`);
  const names = new Set();
  start.forEach((f) => {
    const s = f.signature();
    s.constants.forEach((c) => names.add(c));
    s.functions.forEach((_, k) => names.add(k));
  });
  let steps = 0;
  let fresh = 0;
  const newName = () => {
    let n;
    do n = `c${++fresh}`;
    while (names.has(n));
    names.add(n);
    return n;
  };
  const out = { budgetHit: false };
  // a branch's state: its formulas, an index of them, the rules still to use, and the
  // universals with the terms each has been used with
  const fresh0 = () => ({ branch: [], keys: new Map(), alpha: [], delta: [], beta: [], gammas: [], used: new Map(), terms: new Map(), closed: null });
  const copy = (st) => ({ branch: [...st.branch], keys: new Map(st.keys), alpha: [...st.alpha], delta: [...st.delta], beta: [...st.beta], gammas: [...st.gammas], used: new Map([...st.used].map(([k, v]) => [k, new Set(v)])), terms: new Map(st.terms), closed: st.closed });
  const put = (st, f, lines, why) => {
    if (st.keys.has(f.key)) return;
    st.branch.push(f);
    st.keys.set(f.key, f);
    if (lines) lines.push({ formula: String(f), why });
    closedTerms(f, st.terms);
    const sh = shape(f);
    if (sh.type === "closed") st.closed ??= [String(f)];
    else if (f.kind === "not" && st.keys.has(f.arg.key)) st.closed ??= [String(f.arg), String(f)];
    else if (st.keys.has(N(f).key)) st.closed ??= [String(f), String(N(f))];
    else if (f.kind === "not" && f.arg.kind === "eq" && f.arg.left.key === f.arg.right.key) st.closed ??= [String(f)];
    if (sh.type === "alpha") st.alpha.push(f);
    else if (sh.type === "delta") st.delta.push(f);
    else if (sh.type === "beta") st.beta.push(f);
    else if (sh.type === "gamma") st.gammas.push(f);
  };
  const grow = (st, lines) => {
    const node = { lines, closed: null, open: false, branches: null };
    for (;;) {
      if (++steps > budget) {
        out.budgetHit = true;
        node.unfinished = true;
        return node;
      }
      if (st.closed) {
        node.closed = st.closed;
        return node;
      }
      if (st.alpha.length) {
        const a = st.alpha.shift();
        for (const p of shape(a).parts) put(st, p, lines, `from ${a}`);
        continue;
      }
      if (st.delta.length) {
        const d = st.delta.shift();
        const sh = shape(d);
        const c = new Term("const", newName());
        put(st, sh.body.substitute(sh.variable, c), lines, `from ${d}, with a new name ${c}`);
        continue;
      }
      if (st.beta.length) {
        const b = st.beta.shift();
        node.branches = shape(b).parts.map((p) => {
          const next = copy(st);
          const kid = [];
          put(next, p, kid, `from ${b}`);
          return grow(next, kid);
        });
        node.closed = node.branches.every((k) => k.closed) ? "below" : null;
        node.open = node.branches.some((k) => k.open);
        return node;
      }
      if (!st.terms.size && st.gammas.length) {
        const c = new Term("const", newName());
        st.terms.set(c.key, c);
      }
      let usedOne = false;
      // fairness: the oldest term first, so every universal meets every term in time
      for (const t of st.terms.values()) {
        for (const g of st.gammas) {
          const had = st.used.get(g.key) ?? new Set();
          if (had.has(t.key)) continue;
          had.add(t.key);
          st.used.set(g.key, had);
          const sh = shape(g);
          put(st, sh.body.substitute(sh.variable, t), lines, `from ${g}, with ${t}`);
          usedOne = true;
          break;
        }
        if (usedOne) break;
      }
      if (usedOne) continue;
      node.open = true;
      node.branch = st.branch;
      node.terms = st.terms.size ? st.terms : new Map([["c0", new Term("const", "c0")]]);
      return node;
    }
  };
  const root = fresh0();
  const rootLines = [];
  start.forEach((f, i) => put(root, f, rootLines, i < start.length - (conclusion == null ? 0 : 1) ? "premise" : "negated conclusion"));
  const tree = grow(root, rootLines);
  if (tree.closed) return { status: "valid", tree: strip(tree) };
  const openLeaf = findOpen(tree);
  if (openLeaf) {
    const model = modelFrom(openLeaf.branch, openLeaf.terms);
    if (model && start.every((f) => evaluate(f, model).value)) return { status: "invalid", countermodel: model, tree: strip(tree) };
  }
  return { status: "unresolved", reason: out.budgetHit ? `the tree was still growing after ${budget} steps` : "an open branch did not give a model that checks (identity or function symbols)", budget, tree: strip(tree) };
}
const findOpen = (n) => (n.open && !n.branches ? n : n.branches ? n.branches.map(findOpen).find(Boolean) : null);
const strip = (n) => ({ lines: n.lines, closed: n.closed, open: n.open && !n.branches, unfinished: n.unfinished ?? false, branches: n.branches ? n.branches.map(strip) : null });

/** The structure an open, finished branch describes: its closed terms, and the atoms it asserts. */
function modelFrom(branch, terms) {
  const list = [...terms.values()];
  if (!list.length) return null;
  const dom = list.map((t) => t.key);
  const constants = {};
  const functions = {};
  const preds = {};
  for (const t of list) {
    if (t.kind === "const") constants[t.name] = t.key;
    else {
      functions[t.name] ??= {};
    }
  }
  for (const t of list) if (t.kind === "fn") functions[t.name][t.args.map((a) => a.key).join(",")] = t.key;
  const sig = new Map();
  for (const f of branch) {
    const s = f.signature();
    for (const [k, v] of s.predicates) sig.set(k, v);
    for (const [k, v] of s.functions) if (!functions[k]) functions[k] = {};
  }
  for (const [p, k] of sig) preds[p] = k === 0 ? false : [];
  for (const f of branch) {
    if (f.kind !== "pred") continue;
    if (f.args.length === 0) preds[f.name] = true;
    else preds[f.name].push(f.args.length === 1 ? f.args[0].key : f.args.map((a) => a.key));
  }
  // functions on arguments the branch never mentions: send them to the first element
  const fnTable = {};
  for (const [name, table] of Object.entries(functions)) {
    fnTable[name] = (...xs) => table[xs.join(",")] ?? dom[0];
  }
  try {
    return new Structure({ domain: dom, constants, functions: fnTable, predicates: preds });
  } catch {
    return null;
  }
}

/** The tree as indented text, with × for a closed branch and ○ for an open one. */
export function showTableau(tree) {
  const out = [];
  const go = (n, depth) => {
    for (const l of n.lines) out.push(`${"  ".repeat(depth)}${l.formula}${l.why ? `    (${l.why})` : ""}`);
    if (n.branches) n.branches.forEach((b, i) => {
      out.push(`${"  ".repeat(depth)}${i === 0 ? "┌" : "└"} branch ${i + 1}`);
      go(b, depth + 1);
    });
    else if (n.closed) out.push(`${"  ".repeat(depth)}× closed: ${n.closed.join(" and ")}`);
    else if (n.open) out.push(`${"  ".repeat(depth)}○ open`);
    else if (n.unfinished) out.push(`${"  ".repeat(depth)}… unfinished`);
  };
  go(tree, 0);
  return out.join("\n");
}

/**
 * Does the conclusion follow from the premises? Both searches are run: a
 * finite countermodel up to maxSize (which settles "invalid") and a truth
 * tree within its budget (which settles "valid" when it closes, and
 * "invalid" when a branch stays open and finished).
 *   { status: "valid", tree } | { status: "invalid", countermodel } | { status: "unresolved", reason }
 */
export function foEntails(premises, conclusion, { maxSize = 4, budget = 5000 } = {}) {
  const quick = foTableau(premises, conclusion, { budget: Math.min(budget, 300) });
  if (quick.status !== "unresolved") return quick;
  const m = countermodel(premises, conclusion, { maxSize });
  if (m.status === "invalid") return m;
  const t = budget > 300 ? foTableau(premises, conclusion, { budget }) : quick;
  if (t.status !== "unresolved") return t;
  return { status: "unresolved", reason: `the truth tree was unfinished after ${budget} steps and there is no countermodel with at most ${maxSize} elements` };
}
