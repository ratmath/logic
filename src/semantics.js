// Truth tables, and the table of a formula as one whole number whose bits are
// the rows. Rows are numbered the usual way: the first atom is the leading
// binary digit, so row 0 has every atom false and the last row has every atom
// true. A minterm number is a row number.

import { Formula, formula, refuse, and, or, not, atom, compareNames, TRUE, FALSE } from "./formula.js";

const TABLE_LIMIT = 22;

const atomsOf = (fs, given) => {
  if (given) return given.map(String);
  const seen = new Set();
  for (const f of fs) for (const a of f.atoms()) seen.add(a);
  return [...seen].sort(compareNames);
};

/** The column of atom j among n atoms, as bits over the 2^n rows. */
function atomColumn(j, n) {
  const h = 1n << BigInt(n - 1 - j);
  let m = ((1n << h) - 1n) << h;
  for (let len = 2n * h; len < 1n << BigInt(n); len *= 2n) m |= m << len;
  return m;
}

/**
 * The truth table of a formula as a BigInt: bit r is the value on row r.
 * `atoms` fixes the columns (default: the formula's own atoms, in order).
 */
export function tableBits(f, atoms) {
  const g = formula(f);
  const names = atomsOf([g], atoms);
  const n = names.length;
  if (n > TABLE_LIMIT) refuse("too-large", `a table over ${n} atoms has 2^${n} rows; use satisfiable() or valid() instead`);
  const all = (1n << (1n << BigInt(n))) - 1n;
  const cols = new Map(names.map((name, j) => [name, atomColumn(j, n)]));
  const memo = new Map();
  const go = (h) => {
    const had = memo.get(h.key);
    if (had !== undefined) return had;
    let v;
    switch (h.kind) {
      case "atom":
        v = cols.get(h.name);
        if (v === undefined) refuse("bad-argument", `the atom ${h.name} is not among the columns ${names.join(", ")}`);
        break;
      case "top": v = all; break;
      case "bot": v = 0n; break;
      case "not": v = all ^ go(h.arg); break;
      case "and": v = go(h.left) & go(h.right); break;
      case "or": v = go(h.left) | go(h.right); break;
      case "imp": v = (all ^ go(h.left)) | go(h.right); break;
      case "iff": v = all ^ go(h.left) ^ go(h.right); break;
      default: v = go(h.left) ^ go(h.right);
    }
    memo.set(h.key, v);
    return v;
  };
  return go(g);
}

const rowAssignment = (names, r) => Object.fromEntries(names.map((name, j) => [name, Boolean((r >> (names.length - 1 - j)) & 1)]));

/**
 * A truth table. Give one formula or several; with { subformulas: true } every
 * compound part gets a column of its own.
 *
 *   { atoms, columns: [Formula], rows: [{ index, assignment, values, value }],
 *     kind: "tautology" | "contradiction" | "contingent", trueRows, toString() }
 *
 * `value` is the last column. order "TF" (default) starts with all true, as
 * in most logic books; "FT" counts in binary from all false.
 */
export function truthTable(input, { atoms, subformulas = false, order = "TF" } = {}) {
  const fs = Array.isArray(input) ? input.map(formula) : [formula(input)];
  if (!fs.length) refuse("bad-argument", "a truth table needs a formula");
  const names = atomsOf(fs, atoms);
  const n = names.length;
  if (n > 16) refuse("too-large", `a table over ${n} atoms has ${2 ** n} rows, which is too many to write out; tableBits, countModels and satisfiable do not write them out`);
  let columns = fs;
  if (subformulas) {
    const seen = new Map();
    for (const f of fs) for (const s of f.subformulas()) if (s.kind !== "atom") seen.set(s.key, s);
    for (const f of fs) {
      seen.delete(f.key);
      seen.set(f.key, f);
    }
    columns = [...seen.values()];
  }
  const bits = columns.map((c) => tableBits(c, names));
  const total = 2 ** n;
  const rows = [];
  for (let i = 0; i < total; i++) {
    const r = order === "FT" ? i : total - 1 - i;
    const values = bits.map((b) => Boolean((b >> BigInt(r)) & 1n));
    rows.push({ index: r, assignment: rowAssignment(names, r), values, value: values[values.length - 1] });
  }
  const trueRows = rows.filter((r) => r.value).length;
  const kind = trueRows === total ? "tautology" : trueRows === 0 ? "contradiction" : "contingent";
  return {
    atoms: names,
    columns,
    rows,
    kind,
    trueRows,
    toString({ symbols = ["T", "F"], style = "unicode" } = {}) {
      const heads = [...names, ...columns.map((c) => c.toString({ style }))];
      const lines = [heads.join(" │ ")];
      lines.push(heads.map((h) => "─".repeat([...h].length)).join("─┼─"));
      for (const row of rows) {
        const cells = [...names.map((a) => row.assignment[a]), ...row.values].map((v) => (v ? symbols[0] : symbols[1]));
        lines.push(cells.map((c, i) => c.padEnd([...heads[i]].length)).join(" │ ").trimEnd());
      }
      return lines.join("\n");
    },
  };
}

const setBits = (b, limit = Infinity) => {
  const out = [];
  for (let r = 0; b > 0n && out.length < limit; r++, b >>= 1n) if (b & 1n) out.push(r);
  return out;
};

/** The row numbers where the formula is true. */
export function minterms(f, atoms) {
  return setBits(tableBits(f, atoms));
}
/** The row numbers where the formula is false. */
export function maxterms(f, atoms) {
  const g = formula(f);
  const names = atomsOf([g], atoms);
  return setBits(((1n << (1n << BigInt(names.length))) - 1n) ^ tableBits(g, names));
}
/** How many of the 2^n valuations make the formula true, as a BigInt. */
export function countModels(f, atoms) {
  let b = tableBits(f, atoms);
  let c = 0n;
  const hex = b.toString(16);
  for (const ch of hex) c += BigInt([0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4][parseInt(ch, 16)]);
  return c;
}
/** The valuations that make the formula true (at most `limit` of them). */
export function models(f, { atoms, limit = 1024 } = {}) {
  const g = formula(f);
  const names = atomsOf([g], atoms);
  return setBits(tableBits(g, names), limit).map((r) => rowAssignment(names, r));
}

const literalRow = (names, r, positive) =>
  names.map((name, j) => {
    const on = Boolean((r >> (names.length - 1 - j)) & 1);
    return on === positive ? atom(name) : not(atom(name));
  });
/** The formula in full disjunctive form that is true on exactly the given rows. */
export function fromMinterms(atoms, rows) {
  const names = atoms.map(String);
  return or(rows.map((r) => and(literalRow(names, r, true))));
}
/** The formula in full conjunctive form that is false on exactly the given rows. */
export function fromMaxterms(atoms, rows) {
  const names = atoms.map(String);
  return and(rows.map((r) => or(literalRow(names, r, false))));
}

export { atomsOf, rowAssignment, Formula, TRUE, FALSE };
