// @ratmath/logic: propositional logic you can compute with. Formulas, truth
// tables, normal forms, satisfiability with evidence, simplification, and
// proofs: checkers for natural deduction, sequent calculus, truth trees and
// resolution, with proof search and hints. Predicate logic and the rest are
// planned: see `plan`.

export {
  Formula, LogicError, parse, formula, formulas, atom, not, and, or, implies, iff, xor, TRUE, FALSE,
} from "./src/formula.js";
export {
  truthTable, tableBits, minterms, maxterms, countModels, models, fromMinterms, fromMaxterms,
} from "./src/semantics.js";
export { nnf, cnf, dnf, tseitin, clauses, foldConstants, isNnf, isCnf, isDnf } from "./src/normal.js";
export {
  satisfiable, valid, entails, equivalent, classify, satisfiableClauses,
  clause, literal, resolve, ResolutionProof, parseResolution, checkResolution,
} from "./src/sat.js";
export { minimize, simplify, primeImplicants } from "./src/simplify.js";
export { rules, ruleSet, Proof, parseProof, checkProof } from "./src/fitch.js";
export {
  Sequent, sequent, calculi, calculus, Derivation, parseDerivation, checkDerivation, proveSequent, forces,
} from "./src/sequent.js";
export { tableauRules, Tableau, tableau, checkTableau, tableauProof } from "./src/tableau.js";
export { prove, hint } from "./src/prove.js";
export { plan } from "./src/plan.js";
