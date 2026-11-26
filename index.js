// @ratmath/logic: propositional logic you can compute with. Formulas, truth
// tables, normal forms, satisfiability with evidence, simplification, and
// proofs: checkers for natural deduction, sequent calculus, truth trees and
// resolution, with proof search and hints. Predicate logic with finite
// models and quantifier proofs, circuits and Karnaugh maps, syllogisms,
// modal logic, automata, grammars and machines. What is left is in `plan`.

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
export {
  Term, FOFormula, FTRUE, FFALSE, parseFO, parseTerm, fo, foList, foNnf, prenex, skolemize, isVariableName,
  Structure, structure, evaluate, findModel, countermodel,
} from "./src/predicate.js";
export { foRules, parseFOProof, checkFOProof } from "./src/fol-proof.js";
export { foTableau, showTableau, foEntails } from "./src/fol-tableau.js";
export { Circuit, circuit, circuitsEquivalent, circuitFrom, adders, karnaugh } from "./src/circuits.js";
export { categorical, categoricalText, syllogism, validSyllogisms } from "./src/syllogism.js";
export { ModalFormula, parseModal, modal, Kripke, kripke, SYSTEMS, validOnFrame, modalValid, showModalTree } from "./src/modal.js";
export {
  Automaton, automaton, toDFA, complete, minimize as minimizeAutomaton, equivalentAutomata, complement, product,
  parseRegex, regexToNFA, toRegex,
} from "./src/automata.js";
export { Grammar, grammar, showTree, PDA, pda, TuringMachine, turing, recursive, binaryIncrement } from "./src/machines.js";
export { plan } from "./src/plan.js";
