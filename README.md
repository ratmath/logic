# @ratmath/logic

Formal logic you can compute with for [RatMath](https://ratmath.com/), part of the
[RatMath Shelf](https://ratmath.com/shelf/).

Propositional logic where every verdict comes with its evidence: a formula is
valid with a proof you can replay, invalid with a countermodel that has been
checked, or reported as unresolved within a stated budget. Proofs written by
hand are checked line by line, and a failed line is named along with its rule
and what the rule was missing. Docs: [ratmath.com/logic](https://ratmath.com/logic/).

```js
import { parse, truthTable, valid, entails, simplify, checkProof, prove, hint } from "@ratmath/logic";

String(parse("~p & q -> (r | s)"));        // "(¬p ∧ q) → (r ∨ s)"
truthTable("p -> q").toString();           // the table, as text

valid("((p -> q) & (q -> r)) -> (p -> r)").status;   // "valid", with .refutation
entails("p -> q, q", "p");                 // status "invalid", countermodel { p: false, q: true }
String(simplify("(a & b) | (~a & c) | (b & c)"));    // "(a ∧ b) ∨ (¬a ∧ c)"

checkProof(`1. p -> q    premise
2. q         premise
3. p         ->E 1, 2`).errors[0].message;
// 'line 3: to give "p", →E needs a line reading "φ → p"; line 1 reads "p → q"'

String(prove("p -> q", "~q -> ~p").proof); // a seven-line Fitch proof
hint("1. p -> q  premise\n2. | ~q  assumption", { premises: "p -> q", conclusion: "~q -> ~p" }).text;
// "3. │ │ p   assumption"
```

## What is built

- **Formulas**: `parse` reads the notations people type (`~ ! ¬`, `& ∧ /\`,
  `| ∨ \/`, `-> → =>`, `<-> ↔`, `xor ⊕`, words); `Formula` prints in Unicode,
  ASCII, words or TeX; `atoms`, `subformulas`, `evaluate`, `substitute`.
- **Truth tables**: `truthTable` (with a column for each subformula on
  request), `tableBits`, `minterms`, `maxterms`, `countModels`, `models`.
- **Normal forms**: `nnf`, `cnf`, `dnf` (by distribution or from the table),
  `tseitin`, `clauses`, `isNnf`, `isCnf`, `isDnf`.
- **Satisfiability**: `satisfiable`, `valid`, `entails`, `equivalent`,
  `classify`. A model is checked against the formulas; an unsatisfiable answer
  carries a resolution refutation that `checkResolution` accepts.
- **Simplification**: `simplify`, `minimize` and `primeImplicants` by the
  Quine–McCluskey method, with rows that do not matter.
- **Natural deduction**: `parseProof`, `checkProof`, the rule sets
  `rules.intuitionistic`, `rules.classical` and `rules.derived`, and `ruleSet`
  for your own. Rules are data.
- **Sequent calculus**: `sequent`, `checkDerivation`, `proveSequent`, the
  calculi `calculi.classical` and `calculi.intuitionistic`; what intuitionistic
  logic does not prove comes with a Kripke model.
- **Truth trees**: `tableau`, `tableauProof`, `checkTableau`.
- **Resolution**: `clause`, `resolve`, `parseResolution`, `checkResolution`.
- **Proof search and hints**: `prove` writes a natural deduction proof that the
  checker accepts; `hint` gives the next line of a proof in progress, and only
  the next line.

## Planned

From the [library roadmap](https://github.com/ratmath/ratmath/blob/main/docs/design/library-roadmap.md#8-a-logic-package-ratmathlogic).

| Phase | Contents |
|---|---|
| 3 | Predicate logic: syntax, finite models, model search, quantifier rules |
| 4 | Circuits, Karnaugh maps, syllogisms |
| 5 | Modal logic |
| 6 | Ordinals, cardinals, Peano arithmetic, Gödel numbering |
| 7 | Automata, grammars, Turing machines |
| 8 | Pictures |

What is built depends on nothing; later phases will use Core. The discrete package will use it for Boolean functions.

## Layout

- `index.js`, `src/`: the library. `plan` is the list above.
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
