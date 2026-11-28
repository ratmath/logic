import { describe, expect, test } from "bun:test";
import * as L from "../index.js";

const S = (x) => String(x);

// every structure on domain {0, …, n−1} for unary predicates P and Q and a constant a
function* monadicStructures(maxSize = 3) {
  for (let n = 1; n <= maxSize; n++) for (let m = 0; m < 1 << (2 * n); m++) for (let a = 0; a < n; a++) {
    const P = [];
    const Q = [];
    for (let i = 0; i < n; i++) {
      if ((m >> i) & 1) P.push(i);
      if ((m >> (n + i)) & 1) Q.push(i);
    }
    yield L.structure({ domain: n, constants: { a }, predicates: { P, Q } });
  }
}

describe("predicate logic: syntax", () => {
  test("parsing, printing and free variables", () => {
    const f = L.parseFO("forall x. (Human(x) -> Mortal(x)) & Human(socrates)");
    expect(f.isSentence).toBe(true);
    expect(S(L.parseFO("∀x ∃y Loves(x, y)"))).toBe("∀x ∃y Loves(x, y)");
    expect(L.parseFO("∃y R(x, y)").freeVariables()).toEqual(["x"]);
    expect(L.parseFO("∀x P(x)").alphaEquals(L.parseFO("∀y P(y)"))).toBe(true);
    expect(L.parseFO("∀x P(x)").alphaEquals(L.parseFO("∃y P(y)"))).toBe(false);
  });
  test("substitution does not capture", () => {
    const g = L.parseFO("∃y R(x, y)").substitute("x", "y");
    expect(g.freeVariables()).toEqual(["y"]);
    expect(S(g)).not.toBe("∃y R(y, y)");
  });
  test("prenex and Skolem forms keep the meaning (checked in every small structure)", () => {
    const f = L.parseFO("∀x P(x) → ∃x Q(x)");
    const p = L.prenex(f);
    expect(/^[∀∃]/.test(S(p))).toBe(true);
    for (const M of monadicStructures(3)) expect(L.evaluate(p, M).value).toBe(L.evaluate(f, M).value);
    expect(S(L.skolemize("∀x ∃y ∀z ∃w R(x,y,z,w)"))).not.toMatch(/∃/);
  });
});

describe("predicate logic: models", () => {
  const M = L.structure({ domain: [1, 2, 3], predicates: { L: [[1, 2], [2, 3], [3, 1]] } });
  test("evaluation with witnesses and counterexamples", () => {
    expect(L.evaluate("∀x ∃y L(x, y)", M).value).toBe(true);
    const r = L.evaluate("∃x ∀y L(x, y)", M);
    expect(r.value).toBe(false);
    expect(typeof r.reason).toBe("string");
    expect(L.evaluate("∀x ∃y L(x, y)", M, { explain: true }).steps.length).toBeGreaterThan(0);
  });
  test("model search finds models, and they are checked by evaluation", () => {
    const r = L.findModel("∀x f(f(x)) = x, ∃x f(x) ≠ x");
    expect(r.status).toBe("found");
    expect(r.size).toBe(2);
    expect(L.evaluate("∀x f(f(x)) = x", r.model).value).toBe(true);
    expect(L.findModel("∀x ∀y x = y, ∃x ∃y x ≠ y").status).toBe("none");
  });
  test("a countermodel to a quantifier shift", () => {
    const r = L.countermodel("∀x ∃y L(x, y)", "∃y ∀x L(x, y)");
    expect(r.status).toBe("invalid");
    expect(L.evaluate("∀x ∃y L(x, y)", r.countermodel).value).toBe(true);
    expect(L.evaluate("∃y ∀x L(x, y)", r.countermodel).value).toBe(false);
    expect(L.countermodel("∀x (H(x) → M(x)), H(s)", "M(s)").status).toBe("unresolved");
  });
});

describe("predicate logic: truth trees", () => {
  const cases = [
    ["∀x (P(x) → Q(x)), P(a)", "Q(a)", "valid"],
    ["∃x (P(x) ∧ Q(x))", "∃x P(x) ∧ ∃x Q(x)", "valid"],
    ["∃x P(x) ∧ ∃x Q(x)", "∃x (P(x) ∧ Q(x))", "invalid"],
    ["∀x (P(x) ∨ Q(x))", "∀x P(x) ∨ ∀x Q(x)", "invalid"],
    ["∀x P(x) ∨ ∀x Q(x)", "∀x (P(x) ∨ Q(x))", "valid"],
    ["¬∀x P(x)", "∃x ¬P(x)", "valid"],
    ["∃x P(x)", "∀x P(x)", "invalid"],
    ["∀x (P(x) → Q(x)), ¬Q(a)", "¬P(a)", "valid"],
    ["", "∃x (P(x) → ∀y P(y))", "valid"],
  ];
  for (const [prem, concl, want] of cases) test(`${prem || "⊢"} ⊨ ${concl}: ${want}`, () => {
    const r = L.foEntails(prem ? prem : [], concl);
    expect(r.status).toBe(want);
    const ps = prem ? L.foList(prem) : [];
    if (want === "valid") {
      // independent check: no structure of size ≤ 3 is a counterexample (for
      // monadic sentences in two predicates, size 4 would settle it in general)
      for (const M of monadicStructures(3)) if (ps.every((p) => L.evaluate(p, M).value)) expect(L.evaluate(concl, M).value).toBe(true);
    } else {
      const C = r.countermodel;
      for (const p of ps) expect(L.evaluate(p, C).value).toBe(true);
      expect(L.evaluate(concl, C).value).toBe(false);
    }
  });
  test("a closed tree prints", () => {
    const r = L.foTableau("∀x (H(x) → M(x)), H(s)", "M(s)");
    expect(r.status).toBe("valid");
    expect(L.showTableau(r.tree)).toContain("×");
  });
});

describe("predicate logic: natural deduction", () => {
  const ok = (text, options) => {
    const r = L.checkFOProof(text, options);
    expect(r.errors.map((e) => e.message)).toEqual([]);
    expect(r.status).toBe("proof");
  };
  test("quantifier rules", () => {
    ok(`
1. ∀x (P(x) → Q(x))    premise
2. ∀x P(x)             premise
3. P(a) → Q(a)         ∀E 1
4. P(a)                ∀E 2
5. Q(a)                →E 3, 4
6. ∀x Q(x)             ∀I 5
`);
    ok(`
1. ∃x P(x)                premise
2. ∀x (P(x) → Q(x))       premise
3. | P(c)                 assumption
4. | P(c) → Q(c)          ∀E 2
5. | Q(c)                 →E 4, 3
6. | ∃x Q(x)              ∃I 5
7. ∃x Q(x)                ∃E 1, 3-6
`);
    ok(`
1. a = b      premise
2. F(a)       premise
3. F(b)       =E 1, 2
4. b = b      =I
5. b = a      =E 1, 4
`);
    ok("1. ¬∀x P(x)   premise\n2. ∃x ¬P(x)   CQ 1", { rules: L.foRules.derived });
  });
  test("=E does not let a replacement be captured by a quantifier", () => {
    // false on the domain {0, 1} with a = x = 0 and P true only at 0
    const status = (text) => L.checkFOProof(text).status;
    expect(status("1. x = a   premise\n2. ∀x P(a)   premise\n3. ∀x P(x)   =E 1, 2")).not.toBe("proof");
    expect(status("1. a = x   premise\n2. ∃x ¬P(a)   premise\n3. ∃x ¬P(x)   =E 1, 2")).not.toBe("proof");
    expect(status("1. x = a   premise\n2. ∀y ∀x R(a, y)   premise\n3. ∀y ∀x R(x, y)   =E 1, 2")).not.toBe("proof");
    expect(status("1. f(x) = a   premise\n2. ∀x P(a)   premise\n3. ∀x P(f(x))   =E 1, 2")).not.toBe("proof");
    // a bound occurrence of x is not an occurrence of the free x in x = a
    expect(status("1. x = a   premise\n2. ∀x P(x)   premise\n3. ∀x P(a)   =E 1, 2")).not.toBe("proof");
    // replacements under a binder of another variable are fine
    expect(status("1. a = b   premise\n2. ∀x R(x, a)   premise\n3. ∀x R(x, b)   =E 1, 2")).toBe("proof");
    expect(status("1. x = a   premise\n2. ∀y P(a, y)   premise\n3. ∀y P(x, y)   =E 1, 2")).toBe("proof");
    expect(status("1. x = a   premise\n2. P(a) ∧ ∀x Q(x)   premise\n3. P(x) ∧ ∀x Q(x)   =E 1, 2")).toBe("proof");
  });
  test("the side conditions are enforced", () => {
    expect(L.checkFOProof("1. P(a)   premise\n2. ∀x P(x)   ∀I 1").status).not.toBe("proof");
    expect(L.checkFOProof(`
1. ∃x P(x)                premise
2. | P(c)                 assumption
3. | P(c)                 R 2
4. P(c)                   ∃E 1, 2-3
`).status).not.toBe("proof");
  });
});
