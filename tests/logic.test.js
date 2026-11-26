import { describe, expect, test } from "bun:test";
import * as L from "../index.js";

const S = (x) => String(x);

// a small generator of formulas, the same on every run
function maker(start) {
  let seed = start;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const names = ["p", "q", "r", "s"];
  const gen = (d, atoms = 3) => {
    const x = rnd();
    if (d === 0 || x < 0.25) return rnd() < 0.05 ? (rnd() < 0.5 ? L.TRUE : L.FALSE) : L.atom(names[Math.floor(rnd() * atoms)]);
    if (x < 0.42) return L.not(gen(d - 1, atoms));
    const k = ["and", "or", "implies", "iff", "xor", "and", "or", "implies"][Math.floor(rnd() * 8)];
    return L[k](gen(d - 1, atoms), gen(d - 1, atoms));
  };
  return gen;
}

describe("formulas", () => {
  test("the parser reads every spelling of the connectives", () => {
    const want = L.parse("¬p ∧ q → (r ∨ s ↔ ⊤)");
    for (const text of ["~p & q -> (r | s <-> true)", "!p && q => (r || s <=> 1)", "not p and q implies (r or s iff true)", "~p /\\ q -> (r \\/ s <-> ⊤)", "¬p ^ q ⊃ [r ∨ s ≡ ⊤]"]) {
      expect(L.parse(text).key).toBe(want.key);
    }
    expect(S(L.parse("p xor q ⊕ r"))).toBe("(p ⊕ q) ⊕ r");
    expect(L.parse("_|_").kind).toBe("bot");
    expect(L.parse("0 | false | ⊥").atoms()).toEqual([]);
  });
  test("precedence and association", () => {
    expect(S(L.parse("p -> q -> r"))).toBe("p → (q → r)");
    expect(S(L.parse("p & q | r & s"))).toBe("(p ∧ q) ∨ (r ∧ s)");
    expect(S(L.parse("p | q xor r & s"))).toBe("p ∨ (q ⊕ (r ∧ s))");
    expect(S(L.parse("~~p & q & r"))).toBe("¬¬p ∧ q ∧ r");
    expect(S(L.parse("p <-> q -> r"))).toBe("p ↔ (q → r)");
    expect(S(L.parse("p & (q & r)"))).toBe("p ∧ (q ∧ r)");
  });
  test("printing reads back in every style", () => {
    const f = L.parse("(p1 -> ~q) <-> (rate xor true) | ~(a & false)");
    for (const style of ["unicode", "ascii", "words"]) expect(L.parse(f.toString({ style })).key).toBe(f.key);
    expect(f.toTeX()).toBe("(p_{1} \\to \\lnot q) \\leftrightarrow ((\\mathit{rate} \\oplus \\top) \\lor \\lnot (a \\land \\bot))");
    expect(JSON.stringify({ f: L.parse("p & q") })).toBe('{"f":"p ∧ q"}');
    expect(() => f.toString({ style: "morse" })).toThrow(L.LogicError);
  });
  test("syntax errors say where", () => {
    expect(() => L.parse("p & ")).toThrow(/a formula was expected, but "p & " ends/);
    expect(() => L.parse("p q")).toThrow(/a connective was expected, but found "q" at position 3/);
    expect(() => L.parse("(p | q")).toThrow(/a "\)" was expected/);
    expect(() => L.parse("p $ q")).toThrow(/unexpected "\$" at position 3/);
    expect(() => L.parse(")")).toThrow(L.LogicError);
    expect(() => L.parse(3)).toThrow(TypeError);
    expect(() => L.formula(3)).toThrow(TypeError);
    try {
      L.parse("p & & q");
    } catch (e) {
      expect(e.code).toBe("syntax");
      expect(e.position).toBe(4);
    }
  });
  test("building formulas in code", () => {
    const f = L.implies(L.and("p", "q", "r"), L.or(L.not("p"), L.iff("q", L.xor("r", L.atom("s")))));
    expect(S(f)).toBe("(p ∧ q ∧ r) → (¬p ∨ (q ↔ (r ⊕ s)))");
    expect(L.and()).toBe(L.TRUE);
    expect(L.or()).toBe(L.FALSE);
    expect(S(L.and(["p", "q"]))).toBe("p ∧ q");
    expect(() => L.atom("a b")).toThrow(L.LogicError);
    expect(L.formulas("p, q -> r; s").map(S)).toEqual(["p", "q → r", "s"]);
    expect(L.formulas("")).toEqual([]);
    expect(L.formulas(undefined)).toEqual([]);
    expect(L.formulas(L.TRUE)).toEqual([L.TRUE]);
  });
  test("atoms, subformulas, size, evaluation, substitution", () => {
    const f = L.parse("(p10 -> p2) & ~(q | p2)");
    expect(f.atoms()).toEqual(["p2", "p10", "q"]);
    expect(f.subformulas().map(S)).toEqual(["p10", "p2", "p10 → p2", "q", "q ∨ p2", "¬(q ∨ p2)", "(p10 → p2) ∧ ¬(q ∨ p2)"]);
    expect(f.size).toBe(8);
    expect(f.depth).toBe(3);
    expect(f.evaluate({ p10: false, p2: false, q: false })).toBe(true);
    expect(f.evaluate(new Map([["p10", 1], ["p2", 0], ["q", 0]]))).toBe(false);
    expect(() => f.evaluate({ p2: true })).toThrow(/gives no value to p10/);
    expect(S(f.substitute({ p2: "a & b", q: L.FALSE }))).toBe("(p10 → (a ∧ b)) ∧ ¬(⊥ ∨ (a ∧ b))");
    expect(f.equals("(p10 -> p2) & ~(q | p2)")).toBe(true);
    expect(f.equals(L.parse("p"))).toBe(false);
    expect(L.parse("~p").isLiteral && L.parse("p").isAtom && !L.parse("~~p").isLiteral).toBe(true);
    expect(L.parse("p xor (q <-> true)").evaluate({ p: true, q: true })).toBe(false);
  });
});

describe("truth tables", () => {
  test("the table of a conditional, in both row orders", () => {
    const t = L.truthTable("p -> q");
    expect(t.rows.map((r) => r.value)).toEqual([true, false, true, true]);
    expect(t.rows[1].assignment).toEqual({ p: true, q: false });
    expect(t.kind).toBe("contingent");
    expect(t.toString()).toBe("p │ q │ p → q\n──┼───┼──────\nT │ T │ T\nT │ F │ F\nF │ T │ T\nF │ F │ T");
    expect(L.truthTable("p -> q", { order: "FT" }).rows.map((r) => r.value)).toEqual([true, true, false, true]);
    expect(L.truthTable("p & q").toString({ symbols: ["1", "0"], style: "ascii" }).split("\n")[2]).toBe("1 │ 1 │ 1");
  });
  test("columns for subformulas and for several formulas", () => {
    const t = L.truthTable("(p | q) & ~p", { subformulas: true });
    expect(t.columns.map(S)).toEqual(["p ∨ q", "¬p", "(p ∨ q) ∧ ¬p"]);
    expect(t.rows[2].values).toEqual([true, true, true]);
    const two = L.truthTable(["p -> q", "~q -> ~p"]);
    expect(two.rows.every((r) => r.values[0] === r.values[1])).toBe(true);
    expect(L.truthTable("p | ~p").kind).toBe("tautology");
    expect(L.truthTable("p & ~p").kind).toBe("contradiction");
    expect(L.truthTable("p", { atoms: ["p", "q"] }).rows.length).toBe(4);
  });
  test("minterms, maxterms and counting", () => {
    expect(L.minterms("p xor q")).toEqual([1, 2]);
    expect(L.maxterms("p xor q")).toEqual([0, 3]);
    expect(L.minterms("p", ["p", "q"])).toEqual([2, 3]);
    expect(L.countModels("p | q | r")).toBe(7n);
    expect(L.countModels(L.or(...Array.from({ length: 20 }, (_, i) => `x${i}`)))).toBe(2n ** 20n - 1n);
    expect(L.models("p & ~q")).toEqual([{ p: true, q: false }]);
    expect(L.models("p | q", { limit: 2 }).length).toBe(2);
    expect(S(L.fromMinterms(["p", "q"], [1, 2]))).toBe("(¬p ∧ q) ∨ (p ∧ ¬q)");
    expect(S(L.fromMaxterms(["p", "q"], [0, 3]))).toBe("(p ∨ q) ∧ (¬p ∨ ¬q)");
    expect(L.tableBits("true")).toBe(1n);
    expect(L.tableBits("p & false")).toBe(0n);
  });
  test("limits are stated", () => {
    const big = L.and(...Array.from({ length: 23 }, (_, i) => `x${i}`));
    expect(() => L.tableBits(big)).toThrow(/2\^23 rows/);
    expect(() => L.truthTable(L.and(...Array.from({ length: 17 }, (_, i) => `x${i}`)))).toThrow(/too many to write out/);
    expect(() => L.tableBits("p & q", ["p"])).toThrow(/not among the columns/);
    expect(() => L.truthTable([])).toThrow(L.LogicError);
  });
});

describe("normal forms", () => {
  test("negation normal form", () => {
    expect(S(L.nnf("~(p & (q | ~r))"))).toBe("¬p ∨ (¬q ∧ r)");
    expect(S(L.nnf("~(p -> q)"))).toBe("p ∧ ¬q");
    expect(S(L.nnf("p <-> q"))).toBe("(¬p ∨ q) ∧ (p ∨ ¬q)");
    expect(S(L.nnf("p xor q"))).toBe("(p ∨ q) ∧ (¬p ∨ ¬q)");
    expect(S(L.nnf("~true"))).toBe("⊥");
  });
  test("conjunctive and disjunctive forms", () => {
    expect(S(L.cnf("(p & q) | r"))).toBe("(p ∨ r) ∧ (q ∨ r)");
    expect(S(L.dnf("(p | q) & r"))).toBe("(p ∧ r) ∨ (q ∧ r)");
    expect(S(L.cnf("p -> (q & r)"))).toBe("(¬p ∨ q) ∧ (¬p ∨ r)");
    expect(S(L.cnf("p | ~p"))).toBe("⊤");
    expect(S(L.dnf("p & ~p"))).toBe("⊥");
    expect(S(L.cnf("(p | q) & (p | q | r)"))).toBe("p ∨ q");
    expect(S(L.cnf("p <-> q", { method: "table" }))).toBe("(p ∨ ¬q) ∧ (¬p ∨ q)");
    expect(S(L.dnf("p <-> q", { method: "table" }))).toBe("(¬p ∧ ¬q) ∨ (p ∧ q)");
    expect(() => L.cnf("p", { method: "magic" })).toThrow(L.LogicError);
    expect(() => L.dnf("p", { method: "tseitin" })).toThrow(L.LogicError);
  });
  test("distribution refuses when it explodes, and Tseitin does not", () => {
    const parts = Array.from({ length: 16 }, (_, i) => `(a${i} & b${i})`).join(" | ");
    expect(() => L.cnf(parts)).toThrow(/tseitin/);
    const t = L.tseitin(parts);
    expect(t.clauses.length).toBeLessThan(120);
    expect(t.definitions.length).toBe(31);
    expect(L.isCnf(t.formula)).toBe(true);
    expect(L.isCnf(L.cnf(parts, { method: "tseitin" }))).toBe(true);
  });
  test("the Tseitin form says what its new atoms mean", () => {
    const t = L.tseitin("(p & q) | ~r");
    expect(t.definitions.map((d) => `${d.atom} = ${d.formula}`)).toEqual(["_1 = p ∧ q", "_2 = (p ∧ q) ∨ ¬r"]);
    expect(t.clauses).toContainEqual(["_2"]);
    expect(L.tseitin("_1 & p").definitions[0].atom).toBe("_2");
    expect(S(L.tseitin("p | true").formula)).toBe("⊤");
    expect(L.tseitin("p & false").clauses).toEqual([[]]);
  });
  test("clauses and recognising forms", () => {
    expect(L.clauses("(p -> q) & p & ~q")).toEqual([["p"], ["¬p", "q"], ["¬q"]]);
    expect(L.clauses("p | q", { method: "tseitin" }).length).toBe(4);
    expect(() => L.clauses("p", { method: "x" })).toThrow(L.LogicError);
    expect(L.isNnf("p & (~q | r)") && !L.isNnf("~(p & q)") && !L.isNnf("p -> q")).toBe(true);
    expect(L.isCnf("(p | ~q) & r") && !L.isCnf("(p & q) | r") && L.isCnf("true")).toBe(true);
    expect(L.isDnf("(p & ~q) | r") && !L.isDnf("(p | q) & r") && L.isDnf("false")).toBe(true);
    expect(S(L.foldConstants("(p & true) -> (q | false)"))).toBe("p → q");
    expect(S(L.foldConstants("(p xor true) <-> (false -> q)"))).toBe("¬p");
    expect(S(L.foldConstants("(p -> false) & (true xor q) & (false <-> r) & (q xor false) & (true <-> p)"))).toBe("¬p ∧ ¬q ∧ ¬r ∧ q ∧ p");
  });
});

describe("satisfiability with evidence", () => {
  test("a valid formula comes with a refutation that checks", () => {
    const v = L.valid("((p -> q) & (q -> r)) -> (p -> r)");
    expect(v.status).toBe("valid");
    expect(v.refutation.toString().split("\n").pop()).toMatch(/□ +resolve \d+, \d+ on \w/);
    expect(v.refutation.check()).toEqual({ ok: true, refutation: true, errors: [] });
    expect(v.refutation.check({ premises: v.refutation.premises }).refutation).toBe(true);
  });
  test("an invalid formula comes with a countermodel", () => {
    const v = L.valid("(p -> q) -> (q -> p)");
    expect(v.status).toBe("invalid");
    expect(L.parse("(p -> q) -> (q -> p)").evaluate(v.countermodel)).toBe(false);
    const e = L.entails(["p -> q", "q"], "p");
    expect(e).toMatchObject({ status: "invalid", countermodel: { p: false, q: true } });
    expect(L.entails("p -> q, p", "q").status).toBe("valid");
  });
  test("satisfiable, equivalent, classify", () => {
    expect(L.satisfiable("p & (p -> q) & ~q").status).toBe("unsatisfiable");
    expect(L.satisfiable(["p | q", "~p"])).toMatchObject({ status: "satisfiable", model: { p: false, q: true } });
    expect(L.satisfiable("(p | true) & q").model).toEqual({ p: false, q: true });
    expect(L.equivalent("p -> q", "~q -> ~p").status).toBe("equivalent");
    expect(L.equivalent("p -> q", "q -> p")).toMatchObject({ status: "different", values: [false, true] });
    expect(L.classify("p | ~p").kind).toBe("tautology");
    expect(L.classify("p & ~p").kind).toBe("contradiction");
    const c = L.classify("p -> q");
    expect(c.kind).toBe("contingent");
    expect(L.parse("p -> q").evaluate(c.trueUnder) && !L.parse("p -> q").evaluate(c.falseUnder)).toBe(true);
  });
  test("a search that runs out says so", () => {
    // five pigeons, four holes
    const P = (i, j) => `p${i}_${j}`;
    const cs = [];
    for (let i = 0; i < 5; i++) cs.push(Array.from({ length: 4 }, (_, j) => P(i, j)));
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) for (let k = i + 1; k < 5; k++) cs.push(["~" + P(i, j), "~" + P(k, j)]);
    const short = L.satisfiableClauses(cs, { budget: 20 });
    expect(short.status).toBe("unresolved");
    expect(short.reason).toMatch(/budget of 20 steps/);
    const full = L.satisfiableClauses(cs);
    expect(full.status).toBe("unsatisfiable");
    expect(full.refutation.check({ premises: cs }).refutation).toBe(true);
    const f = L.and(cs.map((c) => L.or(c.map((l) => (l.startsWith("~") ? L.not(l.slice(1)) : l)))));
    expect(L.satisfiable(f, { budget: 20 }).status).toBe("unresolved");
    expect(L.valid(L.not(f), { budget: 20 }).status).toBe("unresolved");
    expect(L.equivalent(f, "false", { budget: 20 }).status).toBe("unresolved");
    expect(L.classify(f, { budget: 20 }).kind).toBe("unresolved");
    expect(L.classify(L.not(f), { budget: 30 }).kind).toBe("unresolved");
    expect(L.satisfiableClauses(["p | q", "~p"]).model).toEqual({ p: false, q: true });
    expect(L.satisfiable(f, { method: "tseitin" }).status).toBe("unsatisfiable");
    expect(L.satisfiable(f, { method: "distribute" }).status).toBe("unsatisfiable");
    expect(() => L.satisfiable(f, { method: "none" })).toThrow(L.LogicError);
  });
  test("large formulas go through named subformulas", () => {
    const parts = Array.from({ length: 30 }, (_, i) => `(a${i} <-> b${i})`);
    const f = L.parse(parts.join(" & "));
    const r = L.satisfiable(f);
    expect(r.status).toBe("satisfiable");
    expect(f.evaluate(r.model)).toBe(true);
    const chain = L.parse(Array.from({ length: 40 }, (_, i) => `(x${i} xor x${i + 1})`).join(" & ") + " & (x0 <-> x40) & x0");
    const u = L.satisfiable(chain);
    expect(u.status).toBe("satisfiable");
    const odd = L.parse(Array.from({ length: 41 }, (_, i) => `(x${i} xor x${i + 1})`).join(" & ") + " & (x0 <-> x41)");
    const w = L.satisfiable(odd);
    expect(w.status).toBe("unsatisfiable");
    expect(w.refutation.method).toBe("distribute");
    const deep = L.valid(L.implies(Array.from({ length: 12 }, (_, i) => L.iff(`a${i}`, L.xor(`b${i}`, `c${i}`))).reduce((a, b) => L.xor(a, b)), "z"));
    expect(deep.status).toBe("invalid");
  });
});

describe("resolution proofs", () => {
  test("clauses and resolvents", () => {
    expect(L.clause("q | ~p | q")).toEqual(["¬p", "q"]);
    expect(L.clause("{p, !q}")).toEqual(["p", "¬q"]);
    expect(L.clause("p ∨ ¬q or r")).toEqual(["p", "¬q", "r"]);
    expect(L.clause("[]")).toEqual([]);
    expect(L.clause("□")).toEqual([]);
    expect(L.literal("~~p")).toBe("p");
    expect(L.literal("not q")).toBe("¬q");
    expect(() => L.literal("p & q")).toThrow(/not a literal/);
    expect(L.resolve("p | q", "~p | r")).toEqual(["q", "r"]);
    expect(L.resolve("~p | r", "p | q", "p")).toEqual(["q", "r"]);
    expect(L.resolve("p | q", "p | r")).toBe(null);
    expect(L.resolve("p | q", "~p | ~q")).toBe(null);
    expect(L.resolve("p | q", "~p | ~q", "q")).toEqual(["p", "¬p"]);
    expect(L.resolve("p", "q", "p")).toBe(null);
  });
  test("a proof written by hand is checked line by line", () => {
    const text = `1. p | q     premise
2. ~p | q    premise
3. ~q        premise
4. q         res 1, 2
5. []        res 4, 3`;
    const proof = L.parseResolution(text);
    expect(proof.check()).toEqual({ ok: true, refutation: true, errors: [] });
    expect(proof.toString()).toContain("4. q        resolve 1, 2");
    expect(L.checkResolution(text, { premises: ["p | q", "~p | q", "~q"] }).refutation).toBe(true);
    expect(L.checkResolution(text, { premises: ["p | q", "~q"] }).errors[0].message).toMatch(/line 2: ¬p ∨ q is marked as a premise but is not one of the given clauses/);
    expect(L.checkResolution("p | q\n~p | q\nq  1, 2").refutation).toBe(false);
    expect(L.checkResolution("p | q\n~p | q\nq  1, 2").ok).toBe(true);
  });
  test("what is wrong is named", () => {
    const errs = (t) => L.checkResolution(t).errors.map((e) => e.message);
    expect(errs("p | q premise\n~p premise\nq | r  res 1, 2")).toEqual(["line 3: resolving lines 1 and 2 gives q, not q ∨ r"]);
    expect(errs("p | q\nr\nq  res 1, 2")).toEqual(["line 3: lines 1 and 2 have no literal that appears positive in one and negated in the other"]);
    expect(errs("p | q\n~p\nq  res 1, 2 on q")).toEqual(["line 3: lines 1 and 2 do not clash on q: one must contain q and the other ¬q"]);
    expect(errs("p | q\n~p | r\nq  res 1, 2 on p")).toEqual(["line 3: resolving lines 1 and 2 on p gives q ∨ r, not q"]);
    expect(errs("p\n~p\n[]  res 1, 2, 2")).toEqual(["line 3: resolution takes two earlier lines; 3 given"]);
    expect(errs("p\n[]  res 1, 5")).toEqual(["line 2: it cites line 5, which is not an earlier line"]);
    expect(() => L.parseResolution("1. p\n3. q")).toThrow(/numbered 3/);
    expect(() => L.parseResolution("p & q  premise")).toThrow(/line 1/);
    expect(L.parseResolution("# nothing\n\n p // one\n").steps.length).toBe(1);
  });
});

describe("simplification", () => {
  test("textbook cases", () => {
    expect(S(L.simplify("(p & q) | (p & ~q)"))).toBe("p");
    expect(S(L.simplify("(a & b) | (~a & c) | (b & c)"))).toBe("(a ∧ b) ∨ (¬a ∧ c)");
    expect(S(L.simplify("(p -> q) & (q -> r)", { form: "cnf" }))).toBe("(¬p ∨ q) ∧ (¬q ∨ r)");
    expect(S(L.simplify("(p -> q) & (q -> r)", { form: "dnf" }))).toBe("(q ∧ r) ∨ (¬p ∧ ¬q)");
    expect(S(L.simplify("~(p <-> q) | (p & r)"))).toBe("(p ∨ q) ∧ (¬p ∨ ¬q ∨ r)");
    expect(S(L.simplify("p | ~p"))).toBe("⊤");
    expect(S(L.simplify("p & ~p"))).toBe("⊥");
  });
  test("prime implicants, essential ones, and the choice among the rest", () => {
    const f = L.fromMinterms(["a", "b", "c"], [0, 1, 2, 5, 6, 7]);
    const m = L.minimize(f);
    expect(m.primes.length).toBe(6);
    expect(m.primes.every((p) => !p.essential)).toBe(true);
    expect(m.terms).toBe(3);
    expect(m.literals).toBe(6);
    expect(m.exact).toBe(true);
    expect(L.equivalent(f, m.formula).status).toBe("equivalent");
    expect(L.primeImplicants("(p & q) | (p & ~q) | (~p & q)").map(S)).toEqual(["p", "q"]);
    const e = L.minimize("(p & q) | (~p & r)");
    expect(e.primes.filter((p) => p.essential).map((p) => S(p.formula))).toEqual(["p ∧ q", "¬p ∧ r"]);
    expect(e.primes.find((p) => S(p.formula) === "q ∧ r").chosen).toBe(false);
  });
  test("rows that do not matter", () => {
    const names = ["a", "b", "c", "d"];
    const f = L.fromMinterms(names, [4, 8, 10, 11, 12, 15]);
    const dc = L.fromMinterms(names, [9, 14]);
    const m = L.minimize(f, { dontCare: dc });
    expect(m.terms).toBe(3);
    expect(m.literals).toBe(7);
    // right on every row that matters
    const got = L.tableBits(m.formula, names);
    const want = L.tableBits(f, names);
    const free = L.tableBits(dc, names);
    expect((got ^ want) & ~free).toBe(0n);
    expect(L.minimize(f, { form: "cnf", dontCare: dc }).form).toBe("cnf");
  });
  test("limits", () => {
    expect(() => L.minimize(L.and(...Array.from({ length: 15 }, (_, i) => `x${i}`)))).toThrow(/limit is 14/);
    expect(() => L.minimize("p", { form: "anf" })).toThrow(L.LogicError);
    const wide = L.minimize(L.parse(Array.from({ length: 10 }, (_, i) => `x${i}`).join(" xor ")));
    expect(wide.terms).toBe(512);
  });
});

describe("natural deduction", () => {
  const proof = `1. p -> q        premise
2. q -> r        premise
3. | p           assumption
4. | q           ->E 1, 3
5. | r           MP 2,4
6. p -> r        ->I 3-5`;
  test("a correct proof", () => {
    const r = L.checkProof(proof, { premises: "p -> q, q -> r", conclusion: "p -> r" });
    expect(r).toMatchObject({ status: "proof", ok: true, complete: true, errors: [], proves: "p → q, q → r ⊢ p → r", lines: 6 });
    const p = L.parseProof(proof);
    expect(p.toString()).toBe("1. p → q   premise\n2. q → r   premise\n3. │ p     assumption\n4. │ q     →E 1, 3\n5. │ r     →E 2, 4\n6. p → r   →I 3-5");
    expect(L.parseProof(p.toString()).toString()).toBe(p.toString());
    expect(L.parseProof(p.toString({ style: "ascii" })).toString()).toBe(p.toString());
    expect(p.check().status).toBe("proof");
    expect(L.checkProof(p.lines).status).toBe("proof");
    expect(L.checkProof({ lines: p.lines }).status).toBe("proof");
  });
  test("unnumbered lines, other spellings of the rules, both cases of ∨E", () => {
    const r = L.checkProof(`p | q   premise
~p   premise
---
| p   assumption
| _|_   ~E 2,3
| q    explosion 4
| q   assumption
q   cases 1, 3-5, 6-6`);
    expect(r.status).toBe("proof");
    expect(r.proves).toBe("p ∨ q, ¬p ⊢ q");
    for (const [name, want] of [["&I", "∧I"], ["and intro", "∧I"], ["/\\E", "∧E"], ["vI", "∨I"], ["or elim", "∨E"], ["=>I", "→I"], ["modus ponens", "→E"], ["not elim", "¬E"], ["-I", "¬I"], ["<->E", "↔E"], ["iff intro", "↔I"], ["EFQ", "⊥E"], ["_|_E", "⊥E"], ["RAA", "IP"], ["dn", "DNE"], ["TND", "LEM"], ["De Morgan", "DeM"], ["xor E", "⊕E"], ["reit", "R"], ["bot elim", "⊥E"], ["top intro", "⊤I"]]) {
      expect(L.rules.derived.find(name)?.name).toBe(want);
    }
    expect(L.rules.intuitionistic.find("IP")).toBe(null);
    expect(L.rules.classical.find("DeM")).toBe(null);
  });
  test("every rule, used once", () => {
    const all = `1. p & (q <-> r)            premise
2. p                        &E 1
3. q <-> r                  &E 1
4. | q                      assumption
5. | r                      <->E 3, 4
6. q -> r                   ->I 4-5
7. | ~p                     assumption
8. | false                  ~E 2, 7
9. ~~p                      ~I 7-8
10. p                       DNE 9
11. | r                     assumption
12. | q                     <->E 3, 11
13. r <-> q                 <->I 11-12, 4-5
14. true                    top I
15. q | ~q                  LEM
16. | ~(p & p)              assumption
17. | p & p                 &I 2, 2
18. | false                 ~E 17, 16
19. p & p                   IP 16-18
20. p | q                   |I 2
21. | false                 assumption
22. | s                     X 21
23. false -> s              ->I 21-22
24. ~s -> ~s                premise
25. p                       R 2`;
    expect(L.checkProof(all).errors).toEqual([]);
    const xor = `1. p xor q   premise
2. p | q   xor E 1
3. ~(p & q)   xor E 1
4. q | p   premise
5. ~(q & p)   premise
6. q xor p   xor I 4, 5`;
    expect(L.checkProof(xor).ok).toBe(true);
    const derived = `1. p -> q   premise
2. ~q   premise
3. ~p   MT 1, 2
4. p | r   premise
5. r   DS 4, 3
6. r -> s   premise
7. q -> t   premise
8. p -> t   HS 1, 7
9. ~~r   DNI 5
10. ~(p & q)   premise
11. ~p | ~q   DeM 10
12. ~(~p | ~q) -> s   premise
13. ~p & ~q   &I 3, 2
14. ~(p | q)   DeM 13
15. ~(p & q)   DeM 11
16. ~p & ~q   DeM 14`;
    expect(L.checkProof(derived, { rules: L.rules.derived }).errors).toEqual([]);
    expect(L.checkProof(derived).errors[0].message).toBe("line 3: MT is not in this rule set (classical natural deduction)");
  });
  const errs = (text, options) => L.checkProof(text, options).errors.map((e) => e.message);
  test("a failed line names the line, the rule and what was missing", () => {
    expect(errs("1. p -> q  premise\n2. q  premise\n3. p  ->E 1,2")).toEqual(['line 3: to give "p", →E needs a line reading "φ → p"; line 1 reads "p → q"']);
    expect(errs("1. p & q  premise\n2. r  &E 1")).toEqual(['line 2: to give "r", ∧E needs a line reading "r ∧ ψ"; line 1 reads "p ∧ q"']);
    expect(errs("1. p  premise\n2. p & q  |I 1")).toEqual(['line 2: ∨I gives a formula of the form "φ ∨ ψ"; "p ∧ q" does not have that form']);
    expect(errs("1. p  premise\n2. q & p  &I 1")).toEqual(["line 2: ∧I cites two lines; here it is given one line"]);
    expect(errs("1. p  premise\n2. | q  assumption\n3. | p  R 1\n4. q -> r  ->I 2-3")).toEqual(['line 4: to give "q → r", →I needs a subproof that assumes "q" and ends with "r"; the subproof 2-3 assumes "q" and ends with "p"']);
    expect(errs("1. p  premise\n2. q  foo 1")).toEqual(['line 2: "foo" is not the name of a rule in this rule set (classical natural deduction)']);
    expect(errs("1. p  premise\n2. q")).toEqual(['line 2: no reason is given for "q"']);
    expect(errs("1. | ~p  assumption\n2. | false  premise\n3. p  IP 1-2", { rules: L.rules.intuitionistic })).toEqual([
      "line 2: a premise cannot sit inside a subproof; what is supposed there is an assumption",
      "line 3: IP is a classical rule and is not in this rule set (intuitionistic natural deduction)",
    ]);
    expect(errs("1. p & q  premise", { premises: ["p", "q"] })).toEqual(['line 1: "p ∧ q" is marked as a premise, but the premises are "p", "q"']);
    expect(errs("1. p  premise", { premises: [] })).toEqual(['line 1: "p" is marked as a premise, but the premises are none']);
    const e = L.checkProof("1. p -> q  premise\n2. q  premise\n3. p  ->E 1,2").errors[0];
    expect(e.line).toBe(3);
    expect(e.rule).toBe("→E");
  });
  test("what may be cited", () => {
    expect(errs("1. p -> q  premise\n2. | p  assumption\n3. | q  ->E 1,2\n4. q   R 3")).toEqual(["line 4: it cites line 3, which is inside the subproof 2-3 that has ended; only the subproof as a whole can be cited now"]);
    expect(errs("1. p  premise\n2. q  R 5")).toEqual(["line 2: it cites line 5, and there is no such line"]);
    expect(errs("1. p  R 1")).toEqual(["line 1: it cites line 1, which does not come before it"]);
    expect(errs("1. | p  assumption\n2. | p  R 1\n3. p -> p  ->I 1-3")).toEqual(["line 3: it cites the subproof 1-3, which is not finished before this line"]);
    expect(errs("1. | p  assumption\n2. | p  R 1\n3. p -> p  ->I 1-1")).toEqual(["line 3: it cites 1-1 as a subproof, but the subproof that starts at line 1 runs to line 2"]);
    expect(errs("1. p  premise\n2. p  R 1\n3. p -> p  ->I 1-2")).toEqual(["line 3: it cites 1-2 as a subproof, but no subproof starts at line 1"]);
    expect(errs("1. p  premise\n2. p -> p  ->I 1-7")).toEqual(["line 2: it cites 1-7, but there is no line 7"]);
    expect(errs("1. | p  assumption\n2. | | q  assumption\n3. | | q  R 2\n4. | p  R 1\n5. p -> p  ->I 1-4\n6. q -> q  ->I 2-3")).toEqual(["line 6: it cites the subproof 2-3, which lies inside another subproof that has already ended"]);
    expect(errs("1. | p  assumption\n2. | | q  assumption\n3. p -> q  ->I 1-2")).toEqual(["line 3: the subproof 1-2 ends inside a further subproof; its last line must be at its own level"]);
  });
  test("the shape of the proof", () => {
    expect(errs("1. p  assumption")).toEqual(["line 1: an assumption opens a subproof, so it must be indented one level (start the line with |); a premise is marked premise"]);
    expect(errs("1. p  premise\n2. | p  R 1")).toEqual(["line 2: a new subproof starts here, so its first line must be an assumption, not R"]);
    expect(errs("1. p  premise\n2. | | q  assumption")).toEqual(["line 2: the line is indented 2 levels, but only 1 can be open here: a subproof opens one level at a time, with an assumption"]);
    expect(() => L.parseProof("1. p premise\nq premise")).toThrow(/number every line of the proof or none/);
    expect(() => L.parseProof("1. p premise\n1. q premise")).toThrow(/two lines of the proof are numbered 1/);
    expect(() => L.parseProof("p & ) premise")).toThrow(/cannot find a formula followed by a reason/);
    expect(() => L.parseProof("p & )   premise")).toThrow(/a formula was expected/);
  });
  test("incomplete proofs are not errors", () => {
    const a = L.checkProof("1. p & q  premise\n2. p  &E 1", { conclusion: "q" });
    expect(a).toMatchObject({ status: "incomplete", ok: true, complete: false, note: 'every line checks, but the last line is "p", not the conclusion "q"' });
    const b = L.checkProof("1. p  premise\n2. | q  assumption");
    expect(b.note).toBe("the proof ends inside the subproof that starts at line 2");
    expect(b.proves).toBe(null);
    expect(L.checkProof("").note).toBe("the proof has no lines yet");
  });
  test("a rule set of one's own is data", () => {
    const mine = L.ruleSet("my rules", [
      { name: "MP", forms: [{ from: ["A → B", "A"], infer: "B" }] },
      { name: "Swap", aliases: ["comm"], forms: [{ from: ["A ∧ B"], infer: "B ∧ A" }] },
    ]);
    const text = "1. p & q  premise\n2. (q & p) -> r  premise\n3. q & p  comm 1\n4. r  MP 2, 3";
    expect(L.checkProof(text, { rules: mine }).status).toBe("proof");
    expect(errs("1. p & q  premise\n2. p  &E 1", { rules: mine })).toEqual(["line 2: ∧E is not in this rule set (my rules)"]);
    expect(L.rules.classical.rules.find((r) => r.name === "→E").forms).toEqual([{ from: ["A → B", "A"], infer: "B" }]);
  });
});

describe("sequent calculus", () => {
  test("sequents", () => {
    const s = L.sequent("p -> q, p |- q");
    expect(S(s)).toBe("p → q, p ⊢ q");
    expect(s.toString({ style: "ascii" })).toBe("p -> q, p |- q");
    expect(S(L.sequent(["p", "p"], []))).toBe("p ⊢");
    expect(S(L.sequent("⊢ p | ~p"))).toBe("⊢ p ∨ ¬p");
    expect(L.sequent(s)).toBe(s);
    expect(() => L.sequent("p, q")).toThrow(/premises ⊢ conclusions/);
  });
  test("classical search gives a derivation that checks", () => {
    const r = L.proveSequent("p -> q, q -> r |- p -> r");
    expect(r.status).toBe("proved");
    expect(S(r.derivation)).toBe(
      ["1. q → r, p ⊢ r, p        Ax", "2. p, q ⊢ r, q            Ax", "3. p, q, r ⊢ r            Ax", "4. q → r, p, q ⊢ r        →L 2, 3", "5. p → q, q → r, p ⊢ r    →L 1, 4", "6. p → q, q → r ⊢ p → r   →R 5"].join("\n"),
    );
    expect(r.derivation.check().ok).toBe(true);
    expect(L.checkDerivation(S(r.derivation)).proves).toBe("p → q, q → r ⊢ p → r");
    expect(r.derivation.size).toBe(6);
    for (const s of ["|- p | ~p", "|- ((p -> q) -> p) -> p", "p <-> q, q xor r |- ~(p <-> r)", "false |- p", "|- true", "p xor q |- q xor p", "~(p & q) |- ~p | ~q"]) {
      expect(L.proveSequent(s).status).toBe("proved");
    }
  });
  test("a sequent that fails gets a countermodel", () => {
    expect(L.proveSequent("p | q |- p")).toEqual({ status: "invalid", countermodel: { p: false, q: true } });
    expect(L.proveSequent("p | q |- p", { logic: "intuitionistic" }).status).toBe("invalid");
    expect(L.proveSequent("p -> q |- q -> p").countermodel).toEqual({ p: false, q: true });
  });
  test("intuitionistic logic: proofs, and Kripke models where there are none", () => {
    for (const s of ["|- ~~(p | ~p)", "~(p | q) |- ~p & ~q", "p -> q |- ~q -> ~p", "|- ~~~p -> ~p", "p |- ~~p", "~p | ~q |- ~(p & q)", "p xor q |- q xor p", "p <-> q |- q <-> p", "p & ~p |-"]) {
      const r = L.proveSequent(s, { logic: "intuitionistic" });
      expect(r.status).toBe("proved");
      expect(r.derivation.check({ calculus: L.calculi.intuitionistic }).ok).toBe(true);
    }
    for (const s of ["|- p | ~p", "|- ~~p -> p", "|- ((p -> q) -> p) -> p", "~(p & q) |- ~p | ~q", "|- (p -> q) | (q -> p)", "~q -> ~p |- p -> q"]) {
      const r = L.proveSequent(s, { logic: "intuitionistic" });
      expect(r.status).toBe("unprovable");
      const seq = L.sequent(s);
      expect(seq.left.every((f) => L.forces(r.kripke, 0, f))).toBe(true);
      expect(L.forces(r.kripke, 0, seq.right[0])).toBe(false);
    }
    const k = L.proveSequent("|- p | ~p", { logic: "intuitionistic" }).kripke;
    expect(S(k)).toBe("world 0: nothing true yet\nworld 1 (after world 0): p true");
    expect(L.forces(k, 1, "p | ~p") && L.forces(k, 0, "~~p") && !L.forces(k, 0, "p") && L.forces(k, 0, "true") && !L.forces(k, 1, "p xor p") && L.forces(k, 0, "p <-> p")).toBe(true);
    expect(() => L.proveSequent("p |- p, q", { logic: "intuitionistic" })).toThrow(/one formula on the right/);
    expect(() => L.proveSequent("p |- p", { logic: "fuzzy" })).toThrow(L.LogicError);
  });
  test("a derivation written by hand is checked", () => {
    const good = `1. p |- p, q        Ax
2. q |- p, q        Ax
3. p | q |- p, q    |L 1, 2
4. p | q |- p | q   |R 3`;
    expect(L.checkDerivation(good)).toMatchObject({ ok: true, proves: "p ∨ q ⊢ p ∨ q", lines: 4 });
    const errs = (t, o) => L.checkDerivation(t, o).errors.map((e) => e.message);
    expect(errs("1. p |- p   Ax\n2. p |- p & q   &R 1, 1")).toEqual(['line 2: ∧R on "p ∧ q" needs "p ⊢ p" and "p ⊢ q"; the cited lines are "p ⊢ p" and "p ⊢ p"']);
    expect(errs("1. p |- q   Ax")).toEqual(["line 1: Ax needs the same formula on both sides of p ⊢ q"]);
    expect(errs("1. p |- q   _|_L")).toEqual(["line 1: ⊥L needs ⊥ on the left of p ⊢ q"]);
    expect(errs("1. p |- q   topR")).toEqual(["line 1: ⊤R needs ⊤ on the right of p ⊢ q"]);
    expect(errs("1. p |- p  Ax\n2. p |- p  Ax 1")).toEqual(["line 2: Ax has no premises"]);
    expect(errs("1. p |- p  Ax\n2. p |- p  cut 1")).toEqual(['line 2: "cut" is not a rule of classical sequent calculus (G3cp)']);
    expect(errs("1. p |- p  Ax\n2. p |- p  ->R 1")).toEqual(["line 2: →R works on a formula of the form A → B on the right, and p ⊢ p has none"]);
    expect(errs("1. p |- p  Ax\n2. p |- p & p  &R 1")).toEqual(["line 2: ∧R takes 2 premises; 1 cited"]);
    expect(errs("1. p |- p, q  Ax", { calculus: L.calculi.intuitionistic })).toEqual(["line 1: p ⊢ p, q has 2 formulas on the right; intuitionistic sequent calculus (G3ip) allows 1"]);
    expect(L.checkDerivation("1. p |- p  Ax\n2. p |- p | q  |R1 1", { calculus: L.calculi.intuitionistic }).ok).toBe(true);
    expect(() => L.parseDerivation("1. p |- p  Ax\n3. p |- p  Ax")).toThrow(/numbered 3/);
    expect(() => L.parseDerivation("1. p |- p  Ax 4")).toThrow(/not an earlier line/);
    expect(() => L.parseDerivation("p & q")).toThrow(/write a sequent/);
    expect(() => L.parseDerivation("")).toThrow(/no lines/);
  });
  test("a calculus of one's own", () => {
    const tiny = L.calculus("conjunction only", { "∧R": L.calculi.classical.rules["∧R"], "∧L": L.calculi.classical.rules["∧L"] }, { maxRight: 1 });
    const d = "1. p, q |- q  Ax\n2. p, q |- p  Ax\n3. p, q |- q & p  &R 1, 2\n4. p & q |- q & p  &L 3";
    expect(L.checkDerivation(d, { calculus: tiny }).ok).toBe(true);
    expect(L.checkDerivation("1. p |- p  Ax\n2. |- p -> p  ->R 1", { calculus: tiny }).errors[0].message).toMatch(/not a rule of conjunction only/);
  });
});

describe("truth trees", () => {
  test("a closed tree shows the argument is valid", () => {
    const r = L.tableauProof("p -> q, q -> r", "p -> r");
    expect(r.status).toBe("valid");
    expect(S(r.tableau)).toBe(
      ["1. p → q   premise", "2. q → r   premise", "3. ¬(p → r)   negated conclusion", "4. p   ¬→ 3", "5. ¬r   ¬→ 3", "├─", "│  6. ¬p   → 1", "│  ✗ 4, 6", "└─", "   7. q   → 1", "   ├─", "   │  8. ¬q   → 2", "   │  ✗ 7, 8", "   └─", "      9. r   → 2", "      ✗ 5, 9"].join("\n"),
    );
    expect(r.tableau.check()).toEqual({ ok: true, closed: true, errors: [], model: null });
    expect(r.tableau).toMatchObject({ lines: 9, branches: 3, closed: true, status: "closed" });
  });
  test("an open branch gives a countermodel", () => {
    const r = L.tableauProof("p | q", "p & q");
    expect(r).toMatchObject({ status: "invalid", countermodel: { p: true, q: false } });
    expect(S(r.tableau)).toContain("○ open");
    expect(S(r.tableau)).toContain("⋯ not continued");
    expect(r.tableau.check().model).toEqual({ p: true, q: false });
    const full = L.tableau(["p | q", "~(p & q)"], { all: true });
    expect(S(full)).not.toContain("not continued");
    expect(full.check({ formulas: ["p | q", "~(p & q)"] }).ok).toBe(true);
  });
  test("every rule", () => {
    for (const fs of [["p <-> q", "p xor q"], ["~(p <-> q)", "~(p xor q)"], ["~~p", "~p"], ["~(p | q)", "p"], ["p & ~p"], ["false"], ["~true"], ["~(p -> p)"], ["~(p | ~p)"], ["~(~(p & q) <-> (~p | ~q))"]]) {
      const t = L.tableau(fs);
      expect(t.closed).toBe(true);
      expect(t.check({ formulas: fs }).closed).toBe(true);
    }
    expect(L.tableauRules.map((r) => r.name)).toEqual(["¬¬", "∧", "¬∨", "¬→", "∨", "¬∧", "→", "↔", "¬↔", "⊕", "¬⊕"]);
    expect(L.tableau(["p | q | r"], { budget: 1 }).status).toBe("unresolved");
    const big = L.tableauProof(Array.from({ length: 12 }, (_, i) => `a${i} | b${i}`), "false", { budget: 30, all: true });
    expect(big.status).toBe("unresolved");
    expect(big.reason).toMatch(/budget of 30 lines/);
  });
  test("a tree with a mistake in it is caught", () => {
    const node = (lines, children = [], closed = null, open = false) => ({ lines, children, closed, open });
    const line = (n, f, rule, from = null) => ({ n, formula: L.parse(f), rule, from });
    const errs = (root, o) => L.checkTableau({ root }, o).errors.map((e) => e.message);
    // q does not come from p → q without a split
    expect(errs(node([line(1, "p -> q", "premise"), line(2, "q", "→", 1)]))).toEqual(['line 2: → on "p → q" splits the branch, so what it gives must start a new branch']);
    expect(errs(node([line(1, "p & q", "premise"), line(2, "r", "∧", 1)]))).toEqual(['line 2: ∧ on "p ∧ q" gives "p" and "q", not "r"']);
    expect(errs(node([line(1, "p & q", "premise"), line(2, "p", "∨", 1)]))).toEqual(['line 2: the rule for "p ∧ q" is ∧, not ∨']);
    expect(errs(node([line(1, "p", "premise"), line(2, "q", "∧", 1)]))).toEqual(['line 2: line 1 reads "p", which no rule takes apart']);
    expect(errs(node([line(1, "p", "premise"), line(2, "q", "∧", 7)]))).toEqual(["line 2: it cites line 7, which is not above it on this branch"]);
    expect(errs(node([line(1, "p", "premise"), line(2, "q", "premise")], [], [1, 2]))).toEqual(['line 2: lines 1 and 2 ("p" and "q") do not contradict each other']);
    expect(errs(node([line(1, "p", "premise")], [], [5]))).toEqual(["line 1: the branch is closed by line 5, which is not on it"]);
    expect(errs(node([line(1, "p | q", "premise")], [node([line(2, "p", "∨", 1)], [], null, true), node([line(3, "r", "∨", 1)])])).join("\n")).toMatch(/line 3: ∨ on "p ∨ q" gives "p" on one branch, "q" on the other; "r" is neither/);
    expect(errs(node([line(1, "p | q", "premise")], [node([line(2, "p", "∨", 1)]), node([line(3, "p", "∨", 1)])]))).toEqual(['line 2: ∨ on "p ∨ q" must put "p" on one branch and "q" on the other']);
    expect(errs(node([line(1, "p | q", "premise")], [node([line(2, "p", "∨", 1)])]))).toEqual(["line 2: the branches that start here are not the two halves of one rule on one line"]);
    expect(errs(node([line(1, "p & q", "premise")], [], null, true))).toEqual(["line 1: the branch is marked open, but making its atoms true does not make every starting formula true: some line on it still has to be worked on"]);
    expect(errs(node([line(1, "p", "premise")], [node([line(2, "q", "premise")])]))).toContain("line 2: only the lines at the top of the tree may be given without a source");
    expect(errs(node([line(1, "p", "premise")], [], null, true), { formulas: ["q"] })).toContain('line 1: the tree must start from "q"');
  });
});

describe("proof search and hints", () => {
  test("found proofs are ordinary proofs", () => {
    const r = L.prove("p -> q, q -> r", "p -> r");
    expect(r.status).toBe("proved");
    expect(S(r.proof)).toBe("1. p → q   premise\n2. q → r   premise\n3. │ p     assumption\n4. │ q     →E 1, 3\n5. │ r     →E 2, 4\n6. p → r   →I 3-5");
    expect(r.proof.check({ premises: "p -> q, q -> r", conclusion: "p -> r" }).status).toBe("proof");
    expect(S(L.prove("p & q", "p").proof)).toBe("1. p ∧ q   premise\n2. p       ∧E 1");
    expect(S(L.prove("p", "p").proof)).toBe("1. p   premise");
    expect(S(L.prove("p, q", "p").proof)).toBe("1. p   premise\n2. q   premise\n3. p   R 1");
    expect(S(L.prove("p <-> q", "q <-> p").proof)).toBe("1. p ↔ q   premise\n2. │ q     assumption\n3. │ p     ↔E 1, 2\n4. │ p     assumption\n5. │ q     ↔E 1, 4\n6. q ↔ p   ↔I 2-3, 4-5");
    expect(S(L.prove("", "true").proof)).toBe("1. ⊤   ⊤I");
  });
  test("classical proofs use indirect proof only where they must", () => {
    const lem = L.prove([], "p | ~p");
    expect(lem.proof.lines.map((l) => l.rule)).toEqual(["assumption", "assumption", "∨I", "¬E", "¬I", "∨I", "¬E", "IP"]);
    expect(L.prove("p -> q", "~q -> ~p").proof.lines.some((l) => l.rule === "IP")).toBe(false);
    expect(L.prove("~q -> ~p", "p -> q").proof.lines.some((l) => l.rule === "IP")).toBe(true);
    for (const [ps, c] of [["", "((p -> q) -> p) -> p"], ["~(p & q)", "~p | ~q"], ["", "(p -> q) | (q -> p)"], ["p xor q", "q xor p"], ["~(p -> q)", "p & ~q"], ["p | (q & r)", "(p | q) & (p | r)"], ["(p & q) -> r", "p -> (q -> r)"], ["p, ~p", "q"], ["", "~(p <-> ~p)"], ["p -> q, r -> s, p | r", "q | s"]]) {
      const r = L.prove(ps, c);
      expect(r.status).toBe("proved");
      expect(r.proof.check({ premises: ps, conclusion: c }).complete).toBe(true);
    }
  });
  test("what cannot be proved", () => {
    expect(L.prove("p", "q")).toEqual({ status: "invalid", countermodel: { p: true, q: false } });
    const i = L.prove([], "p | ~p", { logic: "intuitionistic" });
    expect(i.status).toBe("unprovable");
    expect(L.forces(i.kripke, 0, "p | ~p")).toBe(false);
    expect(L.prove("p -> q", "~q -> ~p", { logic: "intuitionistic" }).proof.check({ rules: L.rules.intuitionistic }).status).toBe("proof");
    expect(() => L.prove("p", "p", { logic: "modal" })).toThrow(L.LogicError);
    expect(L.prove("(a | b) & (c | d) & (e | f)", "(a & c & e) | (a & c & f) | (a & d & e) | (a & d & f) | (b & c & e) | (b & c & f) | (b & d & e) | (b & d & f)", { budget: 300 }).status).toBe("unresolved");
  });
  const walk = (premises, conclusion, text = "", rules) => {
    for (let n = 0; n < 100; n++) {
      const h = L.hint(text, { premises, conclusion, rules });
      if (h.status !== "hint") return { text, end: h };
      text += (text ? "\n" : "") + h.text;
    }
    throw new Error("the hints did not come to an end");
  };
  test("a hint is the next line, and following hints finishes the proof", () => {
    const h = L.hint("", { premises: "p -> q, q -> r", conclusion: "p -> r" });
    expect(h).toMatchObject({ status: "hint", text: "1. p → q   premise", goal: "p → r" });
    expect(h.line).toMatchObject({ n: 1, depth: 0, rule: "premise", cites: [] });
    const w = walk("p -> q, q -> r", "p -> r");
    expect(w.end.status).toBe("done");
    expect(w.text.split("\n").slice(2)).toEqual(["3. │ p   assumption", "4. │ q   →E 1, 3", "5. │ r   →E 2, 4", "6. p → r   →I 3-5"]);
    for (const [ps, c] of [["p | q, ~p", "q"], ["", "p | ~p"], ["p <-> q", "q <-> p"], ["~(p & q)", "~p | ~q"], ["p xor q", "q xor p"], ["(r <-> p) <-> q, ~p & (q | q)", "r <-> ~(r -> p)"]]) {
      expect(walk(ps, c).end.status).toBe("done");
    }
  });
  test("hints follow the lines already written", () => {
    const mine = "1. p -> q  premise\n2. | ~q  assumption\n3. | | p  assumption";
    const h = L.hint(mine, { premises: "p -> q", conclusion: "~q -> ~p" });
    expect(h.text).toBe("4. │ │ q   →E 1, 3");
    expect(h.goal).toBe("⊥");
    expect(walk("p -> q", "~q -> ~p", mine).end.status).toBe("done");
    // the second case first
    const w = walk("p | q", "q | p", "1. p | q  premise\n2. | q  assumption");
    expect(w.text.split("\n").slice(2)).toEqual(["3. │ q ∨ p   ∨I 2", "4. │ p   assumption", "5. │ q ∨ p   ∨I 4", "6. q ∨ p   ∨E 1, 4-5, 2-3"]);
    expect(L.hint("1. p  premise\n2. q  premise\n3. p & q  &I 1, 2", { premises: "p, q", conclusion: "q" }).text).toBe("4. q   R 2");
    expect(L.hint("1. ~~p  premise\n2. | ~p  assumption\n3. | false  ~E 2, 1", { premises: "~~p", conclusion: "p" }).text).toBe("4. p   IP 2-3");
    expect(L.hint(L.parseProof("1. p  premise\n2. | q  assumption\n3. | p  R 1"), { premises: "p", conclusion: "q -> p" }).text).toBe("4. q → p   →I 2-3");
    expect(L.hint("1. p  premise\n2. | ~p  assumption\n3. | false  ~E 1, 2", { premises: "p", conclusion: "p | q" }).text).toBe("4. ¬¬p   ¬I 2-3");
    expect(walk("p | q, ~q", "p", "1. p | q  premise\n2. ~q  premise\n3. | q  assumption\n4. | false  ~E 3, 2\n5. | p  X 4").end.status).toBe("done");
  });
  test("when there is no next line, the reason is given", () => {
    expect(L.hint("1. p -> q  premise\n2. q  ->E 1", { premises: "p -> q", conclusion: "q" })).toMatchObject({ status: "error", error: { line: 2, rule: "→E" } });
    expect(L.hint("1. p  premise", { premises: "p", conclusion: "p" }).status).toBe("done");
    expect(L.hint("", { premises: "p", conclusion: "q" })).toMatchObject({ status: "invalid", countermodel: { p: true, q: false } });
    expect(L.hint("1. p premise\n2. | r  assumption", { premises: "p", conclusion: "q -> p" }).message).toBe('the subproof that starts at line 2 assumes "r", and from there no contradiction follows; end it, or start it with a different assumption');
    expect(L.hint("", { conclusion: "p | ~p", rules: L.rules.intuitionistic })).toMatchObject({ status: "unprovable" });
    expect(L.hint("1. | p  assumption", { premises: "q", conclusion: "p -> q" }).message).toMatch(/the premise "q" is not written down yet/);
    expect(() => L.hint("", {})).toThrow(/needs the conclusion/);
    expect(walk("p -> q", "~q -> ~p", "", L.rules.intuitionistic).end.status).toBe("done");
    expect(L.hint("1. (a | b) & (c | d) & (e | f)  premise", { premises: "(a | b) & (c | d) & (e | f)", conclusion: "(a & c & e) | (a & c & f) | (a & d & e) | (a & d & f) | (b & c & e) | (b & c & f) | (b & d & e) | (b & d & f)", budget: 300 }).status).toBe("unresolved");
  });
});

describe("everything agrees on formulas made at random", () => {
  const gen = maker(2026);
  test("tables, normal forms, the solver, trees, sequents and proofs", () => {
    let valid = 0;
    for (let i = 0; i < 400; i++) {
      const f = gen(4);
      const names = f.atoms();
      const bits = L.tableBits(f, names);
      const all = (1n << (1n << BigInt(names.length))) - 1n;
      const isValid = bits === all;
      const v = L.valid(f);
      expect(v.status).toBe(isValid ? "valid" : "invalid");
      if (isValid) expect(v.refutation.check().refutation).toBe(true);
      else expect(f.evaluate(v.countermodel)).toBe(false);
      for (const g of [L.nnf(f), L.cnf(f), L.dnf(f), L.cnf(f, { method: "table", atoms: names }), L.dnf(f, { method: "table", atoms: names }), L.simplify(f), L.foldConstants(f)]) {
        expect(L.tableBits(g, names)).toBe(bits);
      }
      expect(L.isNnf(L.nnf(f)) && L.isCnf(L.cnf(f)) && L.isDnf(L.dnf(f))).toBe(true);
      expect(L.satisfiable(f, { method: "tseitin" }).status).toBe(L.satisfiable(f).status);
      expect(L.parse(f.toString({ style: "ascii" })).key).toBe(f.key);
      const t = L.tableau([L.not(f)]);
      expect(t.closed).toBe(isValid);
      expect(t.check().ok).toBe(true);
      expect(L.proveSequent(L.sequent([], [f])).status).toBe(isValid ? "proved" : "invalid");
      if (isValid) {
        valid++;
        expect(L.prove([], f).status).toBe("proved");
        const i1 = L.proveSequent(L.sequent([], [f]), { logic: "intuitionistic" }).status;
        expect(["proved", "unprovable"]).toContain(i1);
        expect(L.prove([], f, { logic: "intuitionistic" }).status).toBe(i1);
      }
    }
    expect(valid).toBeGreaterThan(20);
  });
  test("hints lead to a finished proof of every valid argument", () => {
    let followed = 0;
    for (let i = 0; i < 150; i++) {
      const a = gen(2);
      const b = gen(2);
      const c = gen(3);
      if (L.entails([a, b], c).status !== "valid") continue;
      let text = "";
      let h;
      for (let n = 0; ; n++) {
        h = L.hint(text, { premises: [a, b], conclusion: c });
        if (h.status !== "hint") break;
        text += (text ? "\n" : "") + h.text;
        if (n > 250) throw new Error(`the hints for ${a}, ${b} ⊢ ${c} go on and on`);
      }
      expect(h.status).toBe("done");
      followed++;
    }
    expect(followed).toBeGreaterThan(30);
  });
});

test("hint takes the premises from the proof when none are named", () => {
  const soFar = "1. p -> q   premise\n2. q -> r   premise";
  const h1 = L.hint(soFar, { conclusion: "p -> r" });
  expect(h1.status).toBe("hint");
  expect(h1.text).toBe("3. │ p   assumption");
  expect(L.hint(soFar, { premises: [], conclusion: "p -> r" }).status).toBe("error");
});
