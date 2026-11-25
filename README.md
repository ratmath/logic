# @ratmath/logic

Formal logic you can compute with for [RatMath](https://ratmath.com/), part of the
[RatMath Shelf](https://ratmath.com/shelf/).

**Status: set up, nothing built yet.** This repository holds the package
skeleton and the docs site. The plan is in the
[library roadmap](https://github.com/ratmath/ratmath/blob/main/docs/design/library-roadmap.md#8-a-logic-package-ratmathlogic).

Formal logic you can compute with. A formula is valid with a proof, invalid with a countermodel, or reported as unresolved; proofs written by hand are checked line by line, with hints when a step is missing.

## Planned

| Phase | Contents |
|---|---|
| 1 | Propositional formulas, tables, normal forms, satisfiability, simplification |
| 2 | Proof checkers, rule sets, proof search and hints |
| 3 | Predicate logic: syntax, finite models, model search, quantifier rules |
| 4 | Circuits, Karnaugh maps, syllogisms |
| 5 | Modal logic |
| 6 | Ordinals, cardinals, Peano arithmetic, Gödel numbering |
| 7 | Automata, grammars, Turing machines |
| 8 | Pictures |

It will depend on: Core only. The discrete package will use it for Boolean functions.

## Layout

- `index.js`, `src/`: the library. For now it exports only `plan`, the list
  above, so that the tests and the docs build have something to load.
- `tests/`: `bun run test`.
- `docs/src/*.html`: the docs pages (overview, explore, reference, then one
  page per topic as topics are built). `bun run docs:build` writes `docs/`,
  typesets the mathematics and runs the code box at the end of every page.
  `docs/*.html` and `docs/assets/logic.js` are build output.
- `docs/assets/runbox.js` and `scripts/docs-kit.js` are shared with the other
  RatMath docs sites and should be kept in step with them.

## Development

```sh
bun install
bun run test
bun run docs:build
```

Each topic that is built gets its own docs page with usage, the mathematics
explained, and a runnable code box at the end, and is then listed on the
[Shelf page](https://ratmath.com/shelf/).

MIT licensed.
