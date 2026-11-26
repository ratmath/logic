# @ratmath/logic

Formal logic you can compute with for [RatMath](https://ratmath.com/), part of the
[RatMath Shelf](https://ratmath.com/shelf/).

Propositional, predicate and modal logic, circuits, syllogisms and the
machines of computability, where every verdict comes with its evidence: a formula is
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

foEntails("∀x ∃y L(x, y)", "∃y ∀x L(x, y)").status;  // "invalid", with a checked countermodel
modalValid("□p → □□p", { system: "S4" }).status;      // "valid", with a closed tree
syllogism("All men are mortal", "All Greeks are men", "All Greeks are mortal").name;  // "Barbara"
equivalentAutomata("a*b*", "(a|b)*");      // { equivalent: false, word: "ba", acceptedBy: "second" }
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
- **Predicate logic**: `parseFO` (∀ ∃ = ≠, function symbols), `prenex`,
  `skolemize`, capture-avoiding `substitute`; finite `structure`s and
  `evaluate` with witnesses and counterexamples; `findModel` and
  `countermodel` search finite domains through the SAT solver and check what
  they find by evaluation.
- **First-order proofs and trees**: `checkFOProof` with ∀E, ∃I, ∀I, ∃E, =I,
  =E and their conditions on names (`foRules`); `foTableau` and `foEntails`
  close a tree or read a checked countermodel off an open branch.
- **Circuits and Karnaugh maps**: `circuit`, `circuitFrom` (also NAND-only
  and NOR-only), `circuitsEquivalent` with a distinguishing input, `adders`,
  and `karnaugh` with its groups.
- **Syllogisms**: `syllogism` decides a syllogism by checking every filling
  of the Venn diagram, with or without existential import, and reports the
  traditional name, a counterexample and the rules; `validSyllogisms`.
- **Modal logic**: `parseModal`, Kripke models (`kripke`, `truthAt` with
  reasons, `properties`), `validOnFrame`, and `modalValid` for K, D, T, B, S4
  and S5 by labelled truth trees, with countermodels on frames of the system.
- **Automata and regular expressions**: `automaton`, `toDFA`,
  `minimizeAutomaton`, `equivalentAutomata` with a shortest word that tells
  two languages apart, `complement`, `product`, `regexToNFA`, `toRegex`.
- **Grammars and machines**: `grammar` (words, Chomsky normal form, CYK parse
  with a tree in the grammar as written), `pda`, `turing` with a step budget
  ("running" is never "rejected"), and `recursive` functions built from zero,
  successor, projection, composition, primitive recursion and μ.

## Planned

From the [library roadmap](https://github.com/ratmath/ratmath/blob/main/docs/design/library-roadmap.md#8-a-logic-package-ratmathlogic).

| Phase | Contents |
|---|---|
| 6 | Ordinals, cardinals, Peano arithmetic, Gödel numbering |
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
