// Type declarations for @ratmath/logic.

export class LogicError extends Error {
  /** A short machine-readable reason: "syntax", "too-large", "bad-argument", "no-value". */
  code: string;
  /** For syntax errors: where in the text, counted from 0. */
  position?: number;
  constructor(code: string, message: string, extra?: object);
}

// ---- formulas ----

export type Kind = "atom" | "top" | "bot" | "not" | "and" | "or" | "imp" | "iff" | "xor";
export type Style = "unicode" | "ascii" | "words" | "tex";
/** A formula, or text that parses to one. */
export type FormulaLike = Formula | string;
/** Several formulas: an array, or text with commas between them. */
export type FormulaList = readonly FormulaLike[] | string | Formula;
/** Truth values for atoms, by name. */
export type Valuation = Record<string, boolean | 0 | 1> | Map<string, boolean | 0 | 1>;
export type Model = Record<string, boolean>;

export class Formula {
  readonly kind: Kind;
  /** For an atom. */
  readonly name?: string;
  /** For a negation. */
  readonly arg?: Formula;
  /** For the two-place connectives. */
  readonly left?: Formula;
  readonly right?: Formula;
  /** A text that two formulas share exactly when they are the same tree. */
  readonly key: string;
  readonly parts: Formula[];
  readonly isAtom: boolean;
  readonly isLiteral: boolean;
  readonly size: number;
  readonly depth: number;
  equals(other: FormulaLike): boolean;
  atoms(): string[];
  subformulas(): Formula[];
  evaluate(valuation: Valuation): boolean;
  substitute(map: Record<string, FormulaLike> | Map<string, FormulaLike>): Formula;
  toString(options?: { style?: Style }): string;
  toTeX(): string;
  toJSON(): string;
}
export const TRUE: Formula;
export const FALSE: Formula;
export function parse(text: string): Formula;
export function formula(x: FormulaLike): Formula;
export function formulas(x: FormulaList | null | undefined): Formula[];
export function atom(name: string): Formula;
export function not(f: FormulaLike): Formula;
export function and(...fs: (FormulaLike | readonly FormulaLike[])[]): Formula;
export function or(...fs: (FormulaLike | readonly FormulaLike[])[]): Formula;
export function implies(a: FormulaLike, b: FormulaLike): Formula;
export function iff(a: FormulaLike, b: FormulaLike): Formula;
export function xor(a: FormulaLike, b: FormulaLike): Formula;

// ---- truth tables ----

export interface TruthTableRow {
  /** The row number: the atoms read as a binary numeral, first atom leading. */
  index: number;
  assignment: Model;
  values: boolean[];
  /** The last column. */
  value: boolean;
}
export interface TruthTable {
  atoms: string[];
  columns: Formula[];
  rows: TruthTableRow[];
  kind: "tautology" | "contradiction" | "contingent";
  trueRows: number;
  toString(options?: { symbols?: [string, string]; style?: Style }): string;
}
export function truthTable(
  input: FormulaLike | readonly FormulaLike[],
  options?: { atoms?: readonly string[]; subformulas?: boolean; order?: "TF" | "FT" },
): TruthTable;
/** The table as one whole number: bit r is the value on row r. */
export function tableBits(f: FormulaLike, atoms?: readonly string[]): bigint;
export function minterms(f: FormulaLike, atoms?: readonly string[]): number[];
export function maxterms(f: FormulaLike, atoms?: readonly string[]): number[];
export function countModels(f: FormulaLike, atoms?: readonly string[]): bigint;
export function models(f: FormulaLike, options?: { atoms?: readonly string[]; limit?: number }): Model[];
export function fromMinterms(atoms: readonly string[], rows: readonly number[]): Formula;
export function fromMaxterms(atoms: readonly string[], rows: readonly number[]): Formula;

// ---- normal forms ----

export function nnf(f: FormulaLike): Formula;
export function cnf(f: FormulaLike, options?: { method?: "distribute" | "table" | "tseitin"; limit?: number; atoms?: readonly string[] }): Formula;
export function dnf(f: FormulaLike, options?: { method?: "distribute" | "table"; limit?: number; atoms?: readonly string[] }): Formula;
export function foldConstants(f: FormulaLike): Formula;
export interface TseitinForm {
  formula: Formula;
  clauses: string[][];
  /** What each new atom stands for. */
  definitions: { atom: string; formula: Formula }[];
  atoms: string[];
}
export function tseitin(f: FormulaLike): TseitinForm;
/** A formula as clauses, each a list of literals written "p" or "¬p". */
export function clauses(f: FormulaLike, options?: { method?: "distribute" | "tseitin" | "auto" }): string[][];
export function isNnf(f: FormulaLike): boolean;
export function isCnf(f: FormulaLike): boolean;
export function isDnf(f: FormulaLike): boolean;

// ---- satisfiability and resolution ----

export type ClauseLike = string | readonly string[];
export function literal(text: string): string;
export function clause(input: ClauseLike): string[];
export function resolve(c1: ClauseLike, c2: ClauseLike, pivot?: string): string[] | null;

export interface CheckError {
  line: number;
  rule: string;
  message: string;
}
export interface ResolutionStep {
  n: number;
  clause: string[];
  from: [number, number] | number[] | null;
  pivot: string | null;
}
export class ResolutionProof {
  steps: ResolutionStep[];
  /** For proofs from the solver: how the clauses were made, the clauses, and what new atoms mean. */
  method?: "distribute" | "tseitin";
  premises?: string[][];
  definitions?: { atom: string; formula: Formula }[];
  constructor(steps: ResolutionStep[], extra?: object);
  check(options?: { premises?: readonly ClauseLike[] }): ResolutionCheck;
  toString(): string;
}
export interface ResolutionCheck {
  /** Every line follows. */
  ok: boolean;
  /** Every line follows and the last line is the empty clause. */
  refutation: boolean;
  errors: CheckError[];
}
export function parseResolution(text: string): ResolutionProof;
export function checkResolution(proof: ResolutionProof | string, options?: { premises?: readonly ClauseLike[] }): ResolutionCheck;

export interface Unresolved {
  status: "unresolved";
  reason: string;
  budget?: number;
}
export interface SolverOptions {
  /** Search steps allowed before the answer is "unresolved". */
  budget?: number;
  method?: "auto" | "distribute" | "tseitin";
}
export type SatResult =
  | { status: "satisfiable"; model: Model; steps: number }
  | { status: "unsatisfiable"; refutation: ResolutionProof; steps: number }
  | Unresolved;
export type ValidityResult =
  | { status: "valid"; refutation: ResolutionProof; steps: number }
  | { status: "invalid"; countermodel: Model; steps: number }
  | Unresolved;
export type EquivalenceResult =
  | { status: "equivalent"; refutation: ResolutionProof; steps: number }
  | { status: "different"; witness: Model; values: [boolean, boolean]; steps: number }
  | Unresolved;
export function satisfiable(input: FormulaList, options?: SolverOptions): SatResult;
export function valid(input: FormulaLike, options?: SolverOptions): ValidityResult;
export function entails(premises: FormulaList, conclusion: FormulaLike, options?: SolverOptions): ValidityResult;
export function equivalent(a: FormulaLike, b: FormulaLike, options?: SolverOptions): EquivalenceResult;
export function classify(
  input: FormulaLike,
  options?: SolverOptions,
): {
  kind: "tautology" | "contradiction" | "contingent" | "unresolved";
  trueUnder?: Model;
  falseUnder?: Model;
  refutation?: ResolutionProof;
  reason?: string;
};
export function satisfiableClauses(input: readonly ClauseLike[], options?: { budget?: number }): SatResult;

// ---- simplification ----

export interface Minimized {
  formula: Formula;
  form: "dnf" | "cnf";
  atoms: string[];
  terms: number;
  literals: number;
  /** False only if the final choice among primes stopped at its budget. */
  exact: boolean;
  primes: { formula: Formula; rows: number[]; essential: boolean; chosen: boolean }[];
}
export interface MinimizeOptions {
  form?: "dnf" | "cnf";
  /** True on the rows whose value does not matter. */
  dontCare?: FormulaLike;
  atoms?: readonly string[];
}
export function minimize(input: FormulaLike, options?: MinimizeOptions): Minimized;
export function simplify(input: FormulaLike, options?: Omit<MinimizeOptions, "form"> & { form?: "dnf" | "cnf" | "auto" }): Formula;
export function primeImplicants(input: FormulaLike, options?: Omit<MinimizeOptions, "form">): Formula[];

// ---- natural deduction ----

/** One way a rule may be used. Letters A, B, C stand for any formulas; "A ⊢ B" is a subproof. */
export interface RuleForm {
  from: string[];
  infer: string;
}
export interface Rule {
  name: string;
  aliases?: string[];
  about?: string;
  forms: RuleForm[];
}
export interface RuleSet {
  readonly name: string;
  readonly logic?: "classical" | "intuitionistic";
  readonly rules: readonly Required<Rule>[];
  /** The rule with this name, read loosely (->E, →E and "modus ponens" are one rule), or null. */
  find(name: string): Required<Rule> | null;
}
export function ruleSet(name: string, rules: readonly Rule[], options?: { logic?: "classical" | "intuitionistic" }): RuleSet;
export const rules: {
  readonly intuitionistic: RuleSet;
  readonly classical: RuleSet;
  /** Classical, with the shortcuts MT, DS, HS, DNI and DeM. */
  readonly derived: RuleSet;
};

/** A line number, or [first, last] for a subproof. */
export type Citation = number | [number, number];
export interface ProofLine {
  n: number;
  depth: number;
  formula: Formula;
  /** "premise", "assumption" or the name of a rule. */
  rule: string;
  cites: Citation[];
}
export interface ProofLineInput {
  n?: number;
  depth?: number;
  formula: FormulaLike;
  rule?: string;
  cites?: Citation[];
}
export class Proof {
  lines: ProofLine[];
  constructor(lines: readonly ProofLineInput[]);
  check(options?: CheckProofOptions): ProofCheck;
  toString(options?: { style?: "unicode" | "ascii" }): string;
}
export interface CheckProofOptions {
  rules?: RuleSet;
  premises?: FormulaList;
  conclusion?: FormulaLike;
}
export interface ProofCheck {
  status: "proof" | "incomplete" | "errors";
  /** Every line checks. */
  ok: boolean;
  /** Every line checks and the proof ends, outside every subproof, with the conclusion. */
  complete: boolean;
  errors: CheckError[];
  /** For an incomplete proof: what is still missing. */
  note: string | null;
  /** What a correct proof establishes, as "premises ⊢ last line". */
  proves: string | null;
  lines: number;
  rules: string;
}
export function parseProof(text: string, options?: { rules?: RuleSet }): Proof;
export function checkProof(proof: Proof | string | readonly ProofLineInput[] | { lines: readonly ProofLineInput[] }, options?: CheckProofOptions): ProofCheck;

// ---- sequent calculus ----

export class Sequent {
  readonly left: Formula[];
  readonly right: Formula[];
  readonly key: string;
  constructor(left: FormulaList, right: FormulaList);
  toString(options?: { style?: Style }): string;
}
export function sequent(text: string | Sequent): Sequent;
export function sequent(left: FormulaList, right?: FormulaList): Sequent;

/** One premise of a rule: what is added to each side once the principal formula is removed. */
export interface SequentPremise {
  left?: string[];
  right?: string[];
  /** The right side is replaced by what is listed. */
  only?: boolean;
  /** The principal formula stays. */
  keep?: boolean;
}
export interface SequentRule {
  side: "L" | "R";
  kind: Kind;
  premises: SequentPremise[];
}
export interface Calculus {
  readonly name: string;
  readonly logic?: "classical" | "intuitionistic";
  readonly rules: Readonly<Record<string, SequentRule>>;
  readonly axioms: Readonly<Record<string, string>>;
  readonly maxRight: number;
  find(name: string): string | null;
}
export const calculi: { readonly classical: Calculus; readonly intuitionistic: Calculus };
export function calculus(name: string, rules: Record<string, SequentRule>, options?: { maxRight?: number; logic?: "classical" | "intuitionistic" }): Calculus;

export class Derivation {
  sequent: Sequent;
  rule: string;
  premises: Derivation[];
  principal: Formula | null;
  constructor(sequent: Sequent | string, rule: string, premises?: Derivation[], principal?: FormulaLike | null);
  lines(): { n: number; sequent: Sequent; rule: string; cites: number[]; principal: Formula | null }[];
  readonly size: number;
  check(options?: { calculus?: Calculus }): DerivationCheck;
  toString(options?: { style?: Style }): string;
}
export interface DerivationCheck {
  ok: boolean;
  errors: CheckError[];
  proves: string | null;
  lines: number;
  calculus: string;
}
export function parseDerivation(text: string, options?: { calculus?: Calculus }): Derivation;
export function checkDerivation(input: Derivation | string, options?: { calculus?: Calculus }): DerivationCheck;

/** A Kripke model on a tree of worlds: world 0 is the root, and what is true stays true later. */
export interface KripkeModel {
  parent: number[];
  holds: string[][];
  worlds?: number;
  toString?(): string;
}
export function forces(model: KripkeModel, world: number, f: FormulaLike): boolean;
export type SequentResult =
  | { status: "proved"; derivation: Derivation; logic: "classical" | "intuitionistic" }
  | { status: "invalid"; countermodel: Model }
  | { status: "unprovable"; logic: "intuitionistic"; classicallyValid: true; kripke: KripkeModel }
  | Unresolved;
export function proveSequent(input: Sequent | string, options?: { logic?: "classical" | "intuitionistic"; budget?: number }): SequentResult;

// ---- truth trees ----

export interface TableauRule {
  name: string;
  pattern: string;
  /** One list extends the branch; two lists split it. */
  branches: string[][];
}
export const tableauRules: readonly TableauRule[];
export interface TableauLine {
  n: number;
  formula: Formula;
  rule: string;
  from: number | null;
}
export interface TableauNode {
  lines: TableauLine[];
  children: TableauNode[];
  /** The line, or pair of lines, that closes the branch. */
  closed: number[] | null;
  open: boolean;
}
export class Tableau {
  root: TableauNode;
  formulas: Formula[];
  status: "closed" | "open" | "unresolved";
  closed: boolean;
  model: Model | null;
  lines: number;
  branches: number;
  reason?: string;
  check(options?: { formulas?: FormulaList }): TableauCheck;
  toString(options?: { style?: Style }): string;
}
export interface TableauCheck {
  ok: boolean;
  closed: boolean;
  errors: CheckError[];
  model: Model | null;
}
export function tableau(input: FormulaList, options?: { budget?: number; all?: boolean; labels?: string[] }): Tableau;
export function checkTableau(t: { root: TableauNode }, options?: { formulas?: FormulaList }): TableauCheck;
export function tableauProof(
  premises: FormulaList,
  conclusion: FormulaLike,
  options?: { budget?: number; all?: boolean },
):
  | { status: "valid"; tableau: Tableau }
  | { status: "invalid"; countermodel: Model; tableau: Tableau }
  | { status: "unresolved"; reason: string; tableau: Tableau };

// ---- proof search and hints ----

export type ProveResult =
  | { status: "proved"; proof: Proof; logic: "classical" | "intuitionistic"; lines: number }
  | { status: "invalid"; countermodel: Model }
  | { status: "unprovable"; logic: "intuitionistic"; classicallyValid: true; kripke: KripkeModel }
  | Unresolved;
export function prove(premises: FormulaList, conclusion: FormulaLike, options?: { logic?: "classical" | "intuitionistic"; budget?: number }): ProveResult;

export type Hint =
  | { status: "hint"; line: ProofLine; text: string; goal: string }
  | { status: "error"; error: CheckError; message: string }
  | { status: "done"; message: string }
  | { status: "invalid"; countermodel: Model; message: string }
  | { status: "stuck"; message: string }
  | { status: "unprovable"; message: string }
  | Unresolved;
/** The next line of a proof in progress, and only the next line. */
export function hint(
  proofSoFar: Proof | string | readonly ProofLineInput[],
  options: { premises?: FormulaList; conclusion: FormulaLike; rules?: RuleSet; budget?: number },
): Hint;

// ---- the plan ----

export interface PlannedPhase {
  phase: number;
  contents: string;
  /** Rough size in source lines, as text ("1,200", or "600, plus 800 in graphics"). */
  estimate: string;
}

/** What is still planned for the package. */
export const plan: readonly PlannedPhase[];
