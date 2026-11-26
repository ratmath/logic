// Truth trees (analytic tableaux). A tree is built from a list of formulas;
// if every branch closes they cannot all be true, and an open branch that has
// been worked through to its atoms gives a valuation that makes them all
// true. A separate checker verifies a tree, built here or elsewhere.

import { Formula, formula, formulas, parse, matchSchema, compareNames } from "./formula.js";

/**
 * The rules, as data: a pattern and what each new branch receives. One list
 * of additions extends the branch; two lists split it.
 */
export const tableauRules = Object.freeze(
  [
    ["¬¬", "¬¬A", [["A"]]],
    ["∧", "A ∧ B", [["A", "B"]]],
    ["¬∨", "¬(A ∨ B)", [["¬A", "¬B"]]],
    ["¬→", "¬(A → B)", [["A", "¬B"]]],
    ["∨", "A ∨ B", [["A"], ["B"]]],
    ["¬∧", "¬(A ∧ B)", [["¬A"], ["¬B"]]],
    ["→", "A → B", [["¬A"], ["B"]]],
    ["↔", "A ↔ B", [["A", "B"], ["¬A", "¬B"]]],
    ["¬↔", "¬(A ↔ B)", [["A", "¬B"], ["¬A", "B"]]],
    ["⊕", "A ⊕ B", [["A", "¬B"], ["¬A", "B"]]],
    ["¬⊕", "¬(A ⊕ B)", [["A", "B"], ["¬A", "¬B"]]],
  ].map(([name, pattern, branches]) => Object.freeze({ name, pattern, branches })),
);
const compiledRules = tableauRules.map((r) => ({ ...r, schema: parse(r.pattern), adds: r.branches.map((b) => b.map((t) => parse(t))) }));

/** The rule that applies to a formula and what it adds, or null for a literal or a constant. */
function expansion(f) {
  for (const r of compiledRules) {
    const bind = new Map();
    if (matchSchema(r.schema, f, bind)) {
      return { name: r.name, branches: r.adds.map((b) => b.map((s) => s.substitute(bind))) };
    }
  }
  return null;
}
const closesAlone = (f) => f.kind === "bot" || (f.kind === "not" && f.arg.kind === "top");
const negationKey = (f) => (f.kind === "not" ? f.arg.key : "¬" + f.key);

/**
 * A finished tree. `root` is a node { lines, children, closed, open }:
 * lines are { n, formula, rule, from }, closed is the line or pair of lines
 * that close the branch, and open marks a finished branch that stays open.
 */
export class Tableau {
  constructor(root, info) {
    this.root = root;
    Object.assign(this, info);
  }
  check(options) {
    return checkTableau(this, options);
  }
  toString(options) {
    const out = [];
    const show = (node, prefix) => {
      for (const l of node.lines) out.push(`${prefix}${l.n}. ${l.formula.toString(options)}   ${l.rule}${l.from ? " " + l.from : ""}`);
      if (node.closed) out.push(`${prefix}✗ ${node.closed.join(", ")}`);
      else if (node.open) out.push(`${prefix}○ open`);
      else if (!node.children.length) out.push(`${prefix}⋯ not continued`);
      node.children.forEach((c, i) => {
        const last = i === node.children.length - 1;
        out.push(`${prefix}${last ? "└─" : "├─"}`);
        show(c, prefix + (last ? "   " : "│  "));
      });
    };
    show(this.root, "");
    return out.join("\n");
  }
}

/**
 * Build the tree for a list of formulas.
 *
 *   tableau(["p -> q", "p", "~q"])
 *
 * Returns a Tableau with closed (true when every branch closes), and, when
 * some branch stays open, model: a valuation, checked, that makes every one
 * of the formulas true. The build stops at the first open branch unless
 * { all: true }. A tree that outgrows `budget` lines is reported with
 * status "unresolved".
 */
export function tableau(input, { budget = 20000, all = false, labels } = {}) {
  const start = formulas(input);
  let count = 0;
  let model = null;
  let over = false;
  const names = [...new Set(start.flatMap((f) => f.atoms()))].sort(compareNames);
  const build = (node, onBranch, todo) => {
    // onBranch: key → line number, for everything above; todo: lines not yet worked on
    const addLine = (f, ruleName, from) => {
      const line = { n: ++count, formula: f, rule: ruleName, from };
      node.lines.push(line);
      if (node.closed) return;
      if (closesAlone(f)) node.closed = [line.n];
      else if (onBranch.has(negationKey(f))) node.closed = [onBranch.get(negationKey(f)), line.n];
      if (!onBranch.has(f.key)) {
        onBranch.set(f.key, line.n);
        todo.push(line);
      }
    };
    return { addLine };
  };
  const grow = (node, onBranch, todo) => {
    if (over || (model && !all)) return;
    while (!node.closed) {
      if (count > budget) {
        over = true;
        return;
      }
      // a rule that does not split, if there is one
      let at = todo.findIndex((l) => expansion(l.formula)?.branches.length === 1);
      if (at < 0) at = todo.findIndex((l) => expansion(l.formula));
      if (at < 0) {
        node.open = true;
        if (!model) {
          const m = Object.fromEntries(names.map((a) => [a, onBranch.has(a)]));
          /* c8 ignore next */
          if (!start.every((f) => f.evaluate(m))) throw new Error("internal error: the open branch does not give a model");
          model = m;
        }
        return;
      }
      const [line] = todo.splice(at, 1);
      const ex = expansion(line.formula);
      if (ex.branches.length === 1) {
        const { addLine } = build(node, onBranch, todo);
        for (const f of ex.branches[0]) addLine(f, ex.name, line.n);
      } else {
        for (const adds of ex.branches) {
          const child = { lines: [], children: [], closed: null, open: false };
          node.children.push(child);
          const branch = new Map(onBranch);
          const rest = [...todo];
          const { addLine } = build(child, branch, rest);
          for (const f of adds) addLine(f, ex.name, line.n);
          grow(child, branch, rest);
        }
        return;
      }
    }
  };
  const root = { lines: [], children: [], closed: null, open: false };
  const onBranch = new Map();
  const todo = [];
  const { addLine } = build(root, onBranch, todo);
  start.forEach((f, i) => addLine(f, labels?.[i] ?? "premise", null));
  grow(root, onBranch, todo);
  const leaves = [];
  const walk = (n) => (n.children.length ? n.children.forEach(walk) : leaves.push(n));
  walk(root);
  const closed = !over && leaves.every((l) => l.closed);
  return new Tableau(root, {
    formulas: start,
    status: over ? "unresolved" : closed ? "closed" : "open",
    closed,
    model: closed ? null : model,
    lines: count,
    branches: leaves.length,
    ...(over ? { reason: `the tree passed its budget of ${budget} lines` } : {}),
  });
}

/**
 * Check a tree: every line comes from an earlier line on its branch by a
 * rule, every split is the split its rule makes, every branch marked closed
 * holds the contradiction it names, and a branch marked open gives a
 * valuation that makes all the starting formulas true.
 *
 *   { ok, closed, errors: [{ line, rule, message }], model }
 */
export function checkTableau(t, { formulas: wanted } = {}) {
  const errors = [];
  const bad = (line, ruleName, message) => errors.push({ line, rule: ruleName, message: `line ${line}: ${message}` });
  const start = wanted ? formulas(wanted) : null;
  const premises = [];
  let allClosed = true;
  let model = null;
  const walk = (node, above, isRoot) => {
    const branch = new Map(above);
    let lead = true;
    for (const l of node.lines) {
      const f = formula(l.formula);
      if (l.from === null || l.from === undefined) {
        if (!isRoot) bad(l.n, l.rule, "only the lines at the top of the tree may be given without a source");
        else premises.push(f);
        lead = false;
      } else {
        const src = branch.get(l.from);
        if (!src) bad(l.n, l.rule, `it cites line ${l.from}, which is not above it on this branch`);
        else {
          const ex = expansion(src);
          if (!ex) bad(l.n, l.rule, `line ${l.from} reads "${src}", which no rule takes apart`);
          else if (ex.name !== l.rule && tableauRules.some((r) => r.name === l.rule)) bad(l.n, l.rule, `the rule for "${src}" is ${ex.name}, not ${l.rule}`);
          else if (ex.branches.length === 1) {
            if (!ex.branches[0].some((g) => g.key === f.key)) bad(l.n, l.rule, `${ex.name} on "${src}" gives ${ex.branches[0].map((g) => `"${g}"`).join(" and ")}, not "${f}"`);
          } else if (!lead || isRoot) bad(l.n, l.rule, `${ex.name} on "${src}" splits the branch, so what it gives must start a new branch`);
          else if (!ex.branches.some((b) => b.some((g) => g.key === f.key))) bad(l.n, l.rule, `${ex.name} on "${src}" gives ${ex.branches.map((b) => b.map((g) => `"${g}"`).join(" and ")).join(" on one branch, ")} on the other; "${f}" is neither`);
        }
        if (src && expansion(src)?.branches.length === 1) lead = false;
      }
      branch.set(l.n, f);
    }
    if (node.children.length) {
      // the children must together be the branches of one rule on one line
      const heads = node.children.map((c) => c.lines.filter((l) => l.from === c.lines[0]?.from));
      const from = node.children[0].lines[0]?.from;
      const src = branch.get(from);
      const ex = src && expansion(src);
      if (!ex || ex.branches.length !== node.children.length || !node.children.every((c) => c.lines[0]?.from === from)) {
        bad(node.children[0].lines[0]?.n ?? 0, "", "the branches that start here are not the two halves of one rule on one line");
      } else {
        const keys = (fs) => fs.map((g) => formula(g.formula ?? g).key).sort().join(",");
        const want = ex.branches.map(keys).sort();
        const got = heads.map(keys).sort();
        if (want.join(";") !== got.join(";")) bad(node.children[0].lines[0].n, ex.name, `${ex.name} on "${src}" must put ${ex.branches.map((b) => b.map((g) => `"${g}"`).join(" and ")).join(" on one branch and ")} on the other`);
      }
      node.children.forEach((c) => walk(c, branch, false));
      return;
    }
    if (node.closed) {
      const fs = node.closed.map((n) => branch.get(n));
      const at = node.lines[node.lines.length - 1]?.n ?? 0;
      if (fs.some((f) => !f)) bad(at, "close", `the branch is closed by line ${node.closed.find((n) => !branch.get(n))}, which is not on it`);
      else if (fs.length === 1 ? !closesAlone(fs[0]) : !(fs.length === 2 && (fs[0].key === "¬" + fs[1].key || fs[1].key === "¬" + fs[0].key))) {
        bad(at, "close", `lines ${node.closed.join(" and ")} (${fs.map((f) => `"${f}"`).join(" and ")}) do not contradict each other`);
      }
      return;
    }
    allClosed = false;
    if (node.open) {
      const fs = [...branch.values()];
      const atoms = new Set(fs.filter((f) => f.kind === "atom").map((f) => f.name));
      const base = start ?? premises;
      const names = [...new Set(base.flatMap((f) => f.atoms()))];
      const m = Object.fromEntries(names.sort(compareNames).map((a) => [a, atoms.has(a)]));
      if (base.every((f) => f.evaluate(m))) model = model ?? m;
      else bad(node.lines[node.lines.length - 1]?.n ?? 0, "open", "the branch is marked open, but making its atoms true does not make every starting formula true: some line on it still has to be worked on");
    }
  };
  walk(t.root, new Map(), true);
  if (start) {
    const have = new Set(premises.map((f) => f.key));
    const need = new Set(start.map((f) => f.key));
    if (have.size !== need.size || [...need].some((k) => !have.has(k))) bad(1, "premise", `the tree must start from ${start.map((f) => `"${f}"`).join(", ")}`);
  }
  const ok = errors.length === 0;
  return { ok, closed: ok && allClosed, errors, model: ok ? model : null };
}

/**
 * Test an argument by a tree: the premises with the negated conclusion.
 *
 *   { status: "valid", tableau }                  every branch closes
 *   { status: "invalid", countermodel, tableau }  an open branch, read off as a valuation
 *   { status: "unresolved", reason, tableau }
 */
export function tableauProof(premises, conclusion, options = {}) {
  const ps = formulas(premises);
  const c = formula(conclusion);
  const t = tableau([...ps, new Formula("not", c)], { ...options, labels: [...ps.map(() => "premise"), "negated conclusion"] });
  if (t.status === "unresolved") return { status: "unresolved", reason: t.reason, tableau: t };
  if (t.closed) return { status: "valid", tableau: t };
  return { status: "invalid", countermodel: t.model, tableau: t };
}
