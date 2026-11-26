# Changelog

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
