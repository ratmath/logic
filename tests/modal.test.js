import { describe, expect, test } from "bun:test";
import * as L from "../index.js";

const systems = ["K", "D", "T", "B", "S4", "S5"];
// which systems prove each formula: the standard picture
const matrix = {
  "□(p→q)→(□p→□q)": ["K", "D", "T", "B", "S4", "S5"],
  "□p→◇p": ["D", "T", "B", "S4", "S5"],
  "□p→p": ["T", "B", "S4", "S5"],
  "p→□◇p": ["B", "S5"],
  "□p→□□p": ["S4", "S5"],
  "◇p→□◇p": ["S5"],
  "◇(p∨q) ↔ ◇p ∨ ◇q": ["K", "D", "T", "B", "S4", "S5"],
  "□(p∧q) ↔ □p ∧ □q": ["K", "D", "T", "B", "S4", "S5"],
  "◇p → □p": [],
};

describe("modal logic: truth trees", () => {
  for (const [f, valid] of Object.entries(matrix)) test(f, () => {
    for (const system of systems) {
      const r = L.modalValid(f, { system });
      expect(`${system}:${r.status}`).toBe(`${system}:${valid.includes(system) ? "valid" : "invalid"}`);
      if (r.status === "invalid") {
        // independent check: the countermodel is a model of the system's frame, and the formula fails at w1
        const M = r.countermodel;
        const props = M.properties();
        for (const p of L.SYSTEMS[system]) expect(props[p]).toBe(true);
        expect(M.truthAt(f, r.world)).toBe(false);
      }
    }
  });
  test("a closed tree prints", () => {
    expect(L.showModalTree(L.modalValid("□(p→q)→(□p→□q)").tree)).toContain("×");
  });
});

describe("modal logic: Kripke models", () => {
  const M = L.kripke({ worlds: ["a", "b", "c"], access: [["a", "b"], ["a", "c"], ["b", "b"]], valuation: { p: ["b"] } });
  test("truth at a world, with reasons", () => {
    expect(M.truthAt("◇p ∧ ◇¬p", "a")).toBe(true);
    expect(M.truthAt("□p", "a")).toBe(false);
    expect(M.truthAt("□⊥", "c")).toBe(true); // c sees nothing
    expect(M.truthAt("□p", "a", { explain: true }).steps.length).toBeGreaterThan(0);
    expect(M.properties().serial).toBe(false);
  });
  test("validity on a frame, by every valuation", () => {
    expect(L.validOnFrame("□p→p", { worlds: 2, access: [["w1", "w1"], ["w2", "w2"], ["w1", "w2"]] }).valid).toBe(true);
    const r = L.validOnFrame("□p→□□p", { worlds: 3, access: [["w1", "w2"], ["w2", "w3"]] });
    expect(r.valid).toBe(false);
  });
});
