import { describe, expect, test } from "bun:test";
import * as L from "../index.js";

const bits = (x, n) => [...Array(n)].map((_, i) => (x >> (n - 1 - i)) & 1);

describe("circuits", () => {
  test("the full adder table", () => {
    const fa = L.adders.full();
    expect(fa.truthTable().length).toBe(8);
    for (const row of fa.truthTable()) {
      const total = row.inputs.reduce((s, b) => s + b, 0);
      expect([Number(row.outputs.sum), Number(row.outputs.cout)]).toEqual([total & 1, total >> 1]);
    }
  });
  test("a 4-bit ripple adder adds, on every input (checked by arithmetic)", () => {
    const r4 = L.adders.ripple(4);
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
      const out = Object.values(r4.evaluate([...bits(a, 4), ...bits(b, 4)])).map(Number);
      expect(parseInt(out.join(""), 2)).toBe(a + b);
    }
  });
  test("NAND-only and NOR-only circuits compute the formula", () => {
    for (const gates of ["standard", "nand", "nor"]) {
      const c = L.circuitFrom("(a & b) | ~c", { gates });
      if (gates !== "standard") expect(Object.keys(c.counts)).toEqual([gates]);
      for (let m = 0; m < 8; m++) {
        const [a, b, cc] = bits(m, 3);
        expect(Number(Object.values(c.evaluate([a, b, cc]))[0])).toBe((a & b) | (1 - cc));
      }
      expect(L.circuitsEquivalent(c, "(a & b) | ~c").status).toBe("equivalent");
    }
    const d = L.circuitsEquivalent(L.circuitFrom("(a & b) | ~c"), "(a & b) | c");
    expect(d.status).toBe("different");
  });
  test("a looping circuit is refused", () => {
    expect(() => L.circuit({ inputs: ["a"], gates: { x: ["and", "a", "y"], y: ["not", "x"] } })).toThrow();
  });
});

describe("Karnaugh maps", () => {
  const four = ["(a & b) | (~a & c) | (b & c) | (d & ~b & a)", "a xor b xor c", "~(a | b) | (c & d)", "a | ~a & b & ~c & d"];
  for (const text of four) test(`the groups cover exactly the true cells: ${text}`, () => {
    const k = L.karnaugh(text);
    expect(L.equivalent(k.formula, text).status).toBe("equivalent");
    // each group covers only true cells, and together they cover all of them
    const covered = new Set(k.groups.flatMap((g) => g.cells.map(String)));
    k.cells.forEach((row, r) => row.forEach((v, c) => expect(covered.has(`${r},${c}`)).toBe(v === 1)));
    expect(typeof k.toString()).toBe("string");
  });
  test("corners wrap round", () => {
    const k = L.karnaugh({ minterms: [0, 2, 8, 10], atoms: ["a", "b", "c", "d"] });
    expect(k.groups.length).toBe(1);
    expect(String(k.formula)).toBe("¬b ∧ ¬d");
  });
});

describe("syllogisms", () => {
  // the traditional valid moods, each with its name
  const unconditional = { "AAA-1": "Barbara", "EAE-1": "Celarent", "AII-1": "Darii", "EIO-1": "Ferio", "EAE-2": "Cesare", "AEE-2": "Camestres", "EIO-2": "Festino", "AOO-2": "Baroco", "IAI-3": "Disamis", "AII-3": "Datisi", "OAO-3": "Bocardo", "EIO-3": "Ferison", "AEE-4": "Calemes", "IAI-4": "Dimatis", "EIO-4": "Fresison" };
  const conditional = { "AAI-1": "Barbari", "EAO-1": "Celaront", "EAO-2": "Cesaro", "AEO-2": "Camestros", "AAI-3": "Darapti", "EAO-3": "Felapton", "AAI-4": "Bamalip", "AEO-4": "Calemos", "EAO-4": "Fesapo" };
  test("the decision agrees with the traditional list", () => {
    expect(Object.fromEntries(L.validSyllogisms().map((x) => [x.form, x.name]))).toEqual(unconditional);
    expect(Object.fromEntries(L.validSyllogisms({ existentialImport: true }).map((x) => [x.form, x.name]))).toEqual({ ...unconditional, ...conditional });
  });
  test("statements in words", () => {
    const r = L.syllogism("All men are mortal", "All Greeks are men", "All Greeks are mortal");
    expect(r.valid).toBe(true);
    expect(r.name).toBe("Barbara");
    expect(r.terms).toEqual({ S: "Greeks", M: "men", P: "mortal" });
    expect(L.categorical("Some cats are not black").form).toBe("O");
  });
  test("every counterexample is a real one: sets built from it make the premises true and the conclusion false", () => {
    const holds = (form, X, Y) => {
      const inBoth = [...X].some((x) => Y.has(x));
      const outside = [...X].some((x) => !Y.has(x));
      return { A: !outside, E: !inBoth, I: inBoth, O: outside }[form];
    };
    let checked = 0;
    for (const a of "AEIO") for (const b of "AEIO") for (const c of "AEIO") for (const f of [1, 2, 3, 4]) {
      const r = L.syllogism(`${a}${b}${c}-${f}`);
      if (r.valid) continue;
      // one element for each non-empty region
      const sets = { S: new Set(), M: new Set(), P: new Set() };
      r.counterexample.forEach((region, i) => {
        for (const t of ["S", "M", "P"]) if (!region.includes(`¬${t}`)) sets[t].add(i);
      });
      const terms = { [r.terms.S]: "S", [r.terms.M]: "M", [r.terms.P]: "P" };
      const st = (k) => {
        const m = /^(All|No|Some) (\w) are (not )?(\w)$/.exec(r.statements[k]);
        const form = m[1] === "All" ? "A" : m[1] === "No" ? "E" : m[3] ? "O" : "I";
        return holds(form, sets[terms[m[2]]], sets[terms[m[4]]]);
      };
      expect([st(0), st(1), st(2)]).toEqual([true, true, false]);
      checked++;
    }
    expect(checked).toBe(256 - 15);
  });
  test("the traditional rules explain the invalid ones", () => {
    const r = L.syllogism("AAA-2");
    expect(r.valid).toBe(false);
    expect(r.rules.filter((x) => x.broken).map((x) => x.rule)).toContain("the middle term is distributed at least once");
    // a valid syllogism breaks none of the rules
    for (const { form } of L.validSyllogisms()) expect(L.syllogism(form).rules.some((x) => x.broken)).toBe(false);
  });
});
