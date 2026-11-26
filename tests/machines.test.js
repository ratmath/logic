import { describe, expect, test } from "bun:test";
import * as L from "../index.js";

// every word over an alphabet up to a length
const allWords = (alphabet, max) => {
  const out = [""];
  let layer = [""];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((w) => [...alphabet].map((a) => w + a));
    out.push(...layer);
  }
  return out;
};
// a JavaScript RegExp for the same regular expression, as an independent judge
const js = (re) => new RegExp(`^(?:${re.replace(/ε/g, "")})$`);

describe("finite automata and regular expressions", () => {
  const regexes = ["(a|b)*abb", "a*b*", "(ab|ba)*", "a(a|b)*a|a", "(a|b)(a|b)(a|b)*", "b*(ab*ab*)*"];
  for (const re of regexes) test(`${re}: NFA, DFA, minimal DFA and back to a regex all agree with RegExp`, () => {
    const n = L.regexToNFA(re);
    const d = L.toDFA(n);
    const m = L.minimizeAutomaton(n);
    const back = L.toRegex(m);
    expect(d.isDFA).toBe(true);
    expect(m.states.length).toBeLessThanOrEqual(L.complete(d).states.length);
    for (const w of allWords("ab", 7)) {
      const want = js(re).test(w);
      expect([w, n.accepts(w), d.accepts(w), m.accepts(w), js(back).test(w)]).toEqual([w, want, want, want, want]);
    }
    expect(L.equivalentAutomata(re, m).equivalent).toBe(true);
  });
  test("minimal sizes", () => {
    expect(L.minimizeAutomaton(L.regexToNFA("(a|b)*abb")).states.length).toBe(4);
    expect(L.minimizeAutomaton(L.regexToNFA("(a|b)*")).states.length).toBe(1);
  });
  test("a shortest word that tells two languages apart", () => {
    expect(L.equivalentAutomata("(a|b)*", "(a*b*)*").equivalent).toBe(true);
    const r = L.equivalentAutomata("a*b*", "(a|b)*");
    expect(r).toEqual({ equivalent: false, word: "ba", acceptedBy: "second" });
  });
  test("complement and products obey De Morgan (checked word by word)", () => {
    const even = L.automaton({ states: ["e", "o"], alphabet: "ab", start: "e", accept: ["e"], delta: { e: { a: "o", b: "e" }, o: { a: "e", b: "o" } } });
    const ends = L.regexToNFA("(a|b)*abb");
    const and = L.product(even, ends, "and");
    const or = L.product(even, ends, "or");
    const minus = L.product(even, ends, "minus");
    const notEven = L.complement(even, "ab");
    for (const w of allWords("ab", 7)) {
      const x = even.accepts(w);
      const y = ends.accepts(w);
      expect([and.accepts(w), or.accepts(w), minus.accepts(w), notEven.accepts(w)]).toEqual([x && y, x || y, x && !y, !x]);
    }
    expect(L.equivalentAutomata(or, L.complement(L.product(L.complement(even, "ab"), L.complement(ends, "ab"), "and"))).equivalent).toBe(true);
  });
  test("a run shows its trace", () => {
    const r = L.regexToNFA("ab").run("ab");
    expect(r.accepted).toBe(true);
    expect(r.trace.length).toBe(3);
    expect(L.regexToNFA("ab").run("ac").stuck).toBeTruthy();
  });
});

describe("grammars", () => {
  const balanced = (w) => {
    let d = 0;
    for (const c of w) if ((d += c === "(" ? 1 : -1) < 0) return false;
    return d === 0;
  };
  const yieldOf = (t) => (t.children ? t.children.map(yieldOf).join("") : t.symbol === "ε" ? "" : t.symbol);
  test("balanced parentheses: CYK agrees with counting on every word up to length 10", () => {
    const g = L.grammar("S -> S S | ( S ) | ε");
    for (const w of allWords("()", 10)) {
      const r = g.parse(w);
      expect(r.accepted).toBe(balanced(w));
      if (r.accepted) expect(yieldOf(r.tree)).toBe(w);
    }
  });
  test("aⁿbⁿ and its words", () => {
    const g = L.grammar("S -> a S b | ε");
    expect(g.words(6).words).toEqual(["", "ab", "aabb", "aaabbb"]);
    expect(L.showTree(g.parse("aabb").tree)).toBe("S(a S(a S(ε) b) b)");
  });
  test("an expression grammar gives the tree with * below +", () => {
    const e = L.grammar("E -> E + T | T\nT -> T * F | F\nF -> ( E ) | x");
    expect(L.showTree(e.parse("x+x*x").tree)).toBe("E(E(T(F(x))) + T(T(F(x)) * F(x)))");
    expect(e.accepts("x+*x")).toBe(false);
  });
  test("the Chomsky normal form has the same words", () => {
    const g = L.grammar("S -> a S b | S S | ε");
    const c = g.toCNF();
    for (const alts of c.rules.values()) for (const alt of alts) expect(alt.length === 2 || alt.length === 1 || c.start).toBeTruthy();
    expect(c.words(6).words).toEqual(g.words(6).words);
  });
});

describe("pushdown automata and Turing machines", () => {
  const anbn = L.pda({ start: "q0", accept: ["q2"], moves: [["q0", "a", "ε", "q0", "A"], ["q0", "ε", "ε", "q1", "ε"], ["q1", "b", "A", "q1", "ε"], ["q1", "ε", "Z", "q2", "Z"]] });
  test("a PDA for aⁿbⁿ agrees with the grammar", () => {
    const g = L.grammar("S -> a S b | ε");
    for (const w of allWords("ab", 8)) expect(anbn.accepts(w)).toBe(g.accepts(w));
    expect(anbn.run("ab").trace.at(-1).state).toBe("q2");
  });
  test("binary increment, checked by arithmetic", () => {
    const tm = L.binaryIncrement();
    for (let k = 0; k < 64; k++) {
      const r = tm.run(k.toString(2));
      expect(r.status).toBe("accepted");
      expect(r.tape).toBe((k + 1).toString(2));
    }
  });
  test("a machine that never halts is reported as running, not rejected", () => {
    const loop = L.turing({ start: "q", delta: { "q,_": ["q", "_", "R"] } });
    expect(loop.run("", { budget: 50 }).status).toBe("running");
  });
});

describe("recursive functions", () => {
  const { add, mult, pred, monus, power, factorial } = L.recursive.examples;
  test("built from zero, successor and projections, they agree with BigInt arithmetic", () => {
    for (let x = 0n; x < 6n; x++) for (let y = 0n; y < 6n; y++) {
      expect([add.at(x, y), mult.at(x, y), monus.at(x, y), power.at(x, y)]).toEqual([x + y, x * y, x > y ? x - y : 0n, x ** y]);
    }
    expect([pred.at(0), pred.at(5), factorial.at(6)]).toEqual([0n, 4n, 720n]);
  });
  test("minimisation finds the least zero", () => {
    const { compose, proj, mu } = L.recursive;
    // f(x, y) = y ∸ x·x is zero first at the ceiling of √y
    const f = compose(monus, [proj(2, 2), compose(mult, [proj(1, 2), proj(1, 2)])]);
    const ceilSqrt = mu(f);
    for (let y = 0n; y < 30n; y++) {
      const r = ceilSqrt.at(y);
      expect(r * r >= y && (r === 0n || (r - 1n) * (r - 1n) < y)).toBe(true);
    }
  });
});
