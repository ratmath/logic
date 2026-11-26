import { expect, test } from "bun:test";
import * as lib from "../index.js";

test("the package loads and says what is planned", () => {
  expect(Array.isArray(lib.plan)).toBe(true);
  expect(lib.plan.map((p) => p.phase)).toEqual([6, 8]);
  lib.plan.forEach((p) => {
    expect(typeof p.contents).toBe("string");
    expect(typeof p.estimate).toBe("string");
  });
  expect(Object.isFrozen(lib.plan)).toBe(true);
});
