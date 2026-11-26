# Changelog

## 0.2.0

Phases 3, 4, 5 and 7 of the roadmap.

- Predicate logic: `parseFO`, terms with function symbols, identity,
  capture-avoiding substitution, `prenex`, `skolemize`, `foNnf`.
- Finite structures: `structure`, `evaluate` with witnesses, counterexamples
  and an explained evaluation; `findModel` and `countermodel` ground to SAT and
  check every model they return by evaluation. Not finding a countermodel is
  reported as unresolved, never as valid.
- First-order natural deduction: `checkFOProof`, `parseFOProof`, `foRules`
  (∀E, ∃I, ∀I, ∃E, =I, =E, and CQ among the derived rules), with the
  eigenvariable conditions checked. `fitch.js` rules may now carry a `check`
  hook, and a rule set may say how to read its formulas.
- First-order truth trees: `foTableau`, `showTableau`, `foEntails`.
- Circuits: `circuit`, `circuitFrom` (standard, NAND or NOR gates),
  `circuitsEquivalent`, `adders`; Karnaugh maps with `karnaugh`.
- Syllogisms: `categorical`, `syllogism`, `validSyllogisms`, decided by the
  Venn diagram, checked against the traditional list of moods.
- Modal logic: `parseModal`, `kripke`, `validOnFrame`, `modalValid` for K, D,
  T, B, S4 and S5, `showModalTree`.
- Automata: `automaton`, `toDFA`, `complete`, `minimizeAutomaton`,
  `equivalentAutomata`, `complement`, `product`, `parseRegex`, `regexToNFA`,
  `toRegex`.
- Grammars and machines: `grammar` with CYK parsing and parse trees, `pda`,
  `turing`, `binaryIncrement`, `recursive`.
- Docs pages for each new topic.

## 0.1.0

Phases 1 and 2 of the roadmap: propositional logic, and proofs.

- Formulas: a parser for the common notations, printing in Unicode, ASCII,
  words and TeX, evaluation and substitution.
- Truth tables, minterms and maxterms, model counting.
- Negation, conjunctive and disjunctive normal forms; the Tseitin form.
- `satisfiable`, `valid`, `entails`, `equivalent`, `classify`: a checked model,
  a checked resolution refutation, or "unresolved" at a stated budget.
- `simplify` and `minimize` by the Quine–McCluskey method, with rows that do
  not matter.
- Natural deduction in Fitch style: `checkProof` with rule sets that are data
  (intuitionistic, classical, classical with derived rules, or your own). A
  failed line names the line, the rule and what the rule was missing.
- Sequent calculus: classical (G3cp) and intuitionistic calculi as data, a
  derivation checker, and `proveSequent`, with Kripke countermodels for what
  intuitionistic logic does not prove.
- Truth trees: `tableau`, `tableauProof`, `checkTableau`.
- Resolution proofs: `parseResolution`, `checkResolution`, `resolve`.
- `prove` finds natural deduction proofs; `hint` gives the next line of a
  proof in progress.
- Docs pages for each topic.
