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

// ---- predicate logic ----

export class Term {
  readonly kind: "var" | "const" | "fn";
  readonly name: string;
  readonly args: Term[];
  equals(other: Term): boolean;
  toString(): string;
}
export type FOKind = "pred" | "eq" | "top" | "bot" | "not" | "and" | "or" | "imp" | "iff" | "xor" | "all" | "ex";
export type FOFormulaLike = FOFormula | string;
export type FOFormulaList = readonly FOFormulaLike[] | string | FOFormula;
export class FOFormula {
  readonly kind: FOKind;
  readonly key: string;
  /** For pred: the predicate name and arguments; for eq: the two terms. */
  readonly name?: string;
  readonly args?: Term[];
  /** For quantifiers. */
  readonly variable?: string;
  readonly body?: FOFormula;
  readonly arg?: FOFormula;
  readonly left?: FOFormula;
  readonly right?: FOFormula;
  readonly isQuantifier: boolean;
  readonly isAtomic: boolean;
  readonly isSentence: boolean;
  readonly parts: FOFormula[];
  equals(other: FOFormulaLike): boolean;
  /** Equal up to renaming bound variables. */
  alphaEquals(other: FOFormulaLike): boolean;
  freeVariables(): string[];
  signature(): { predicates: Map<string, number>; functions: Map<string, number>; constants: string[] };
  /** Replace the free x by a term, renaming bound variables so nothing is captured. */
  substitute(x: string, term: Term | string): FOFormula;
  toString(options?: { style?: "unicode" | "ascii" | "tex" }): string;
  toTeX(): string;
}
export const FTRUE: FOFormula;
export const FFALSE: FOFormula;
export function parseFO(text: string): FOFormula;
export function parseTerm(text: string): Term;
export function fo(input: FOFormulaLike): FOFormula;
export function foList(input: FOFormulaList): FOFormula[];
export function isVariableName(name: string): boolean;
export function foNnf(f: FOFormulaLike): FOFormula;
export function prenex(f: FOFormulaLike): FOFormula;
export function skolemize(f: FOFormulaLike): FOFormula;

export type Element = string | number;
export interface StructureSpec {
  domain: readonly Element[] | number;
  constants?: Record<string, Element>;
  functions?: Record<string, ((...xs: any[]) => Element) | Record<string, Element>>;
  predicates?: Record<string, readonly (Element | readonly Element[])[] | boolean | ((...xs: any[]) => boolean)>;
}
export interface StructureData {
  domain: Element[];
  constants: Record<string, Element>;
  functions: Record<string, Record<string, Element>>;
  predicates: Record<string, (Element | Element[])[] | boolean>;
}
export class Structure {
  constructor(spec: StructureSpec);
  readonly domain: Element[];
  readonly size: number;
  readonly constants: Record<string, Element>;
  readonly functions: Record<string, (...xs: Element[]) => Element>;
  readonly predicates: Record<string, (...xs: Element[]) => boolean>;
  term(t: Term, env?: Record<string, Element>): Element;
  holds(f: FOFormulaLike, env?: Record<string, Element>): boolean;
  describe(): StructureData;
  readonly extensions: StructureData;
}
export function structure(spec: StructureSpec | Structure): Structure;
export interface Evaluation {
  value: boolean;
  reason: string;
  witness?: Record<string, Element>;
  counterexample?: Record<string, Element>;
  steps?: object[];
}
export function evaluate(f: FOFormulaLike, M: StructureSpec | Structure, options?: { assignment?: Record<string, Element>; explain?: boolean }): Evaluation;
export type FindModel =
  | { status: "found"; model: Structure; size: number }
  | { status: "none"; upTo: number }
  | { status: "unresolved"; size: number; reason: string };
/** A finite model of the sentences, searched by size; "none" is only up to maxSize. */
export function findModel(sentences: FOFormulaList, options?: { minSize?: number; maxSize?: number; budget?: number }): FindModel;
export type Countermodel =
  | { status: "invalid"; countermodel: Structure; size: number }
  | { status: "unresolved"; reason: string; upTo?: number };
export function countermodel(premises: FOFormulaList, conclusion: FOFormulaLike, options?: { minSize?: number; maxSize?: number; budget?: number }): Countermodel;

export const foRules: { readonly intuitionistic: RuleSet; readonly classical: RuleSet; readonly derived: RuleSet };
export function parseFOProof(text: string, options?: { rules?: RuleSet }): Proof;
export function checkFOProof(proof: Proof | string | readonly ProofLineInput[], options?: { rules?: RuleSet; premises?: FOFormulaList; conclusion?: FOFormulaLike }): ProofCheck;

export interface FOTreeNode {
  lines: object[];
  closed: boolean;
  open: boolean;
  unfinished: boolean;
  branches: FOTreeNode[] | null;
}
export type FOTableauResult =
  | { status: "valid"; tree: FOTreeNode }
  | { status: "invalid"; countermodel: Structure; tree: FOTreeNode }
  | { status: "unresolved"; reason: string; budget?: number; tree?: FOTreeNode };
/** A first-order truth tree for premises ⊨ conclusion (the conclusion negated at the root). */
export function foTableau(premises: FOFormulaList, conclusion?: FOFormulaLike, options?: { budget?: number }): FOTableauResult;
export function showTableau(tree: FOTreeNode): string;
/** A truth tree, then a countermodel search, then a longer tree. */
export function foEntails(premises: FOFormulaList, conclusion: FOFormulaLike, options?: { maxSize?: number; budget?: number }): FOTableauResult | Countermodel;

// ---- circuits, Karnaugh maps, syllogisms ----

export type GateKind = "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "not" | "buf";
export interface CircuitSpec {
  inputs: readonly string[];
  /** name → [kind, input names…] */
  gates: Record<string, readonly string[]>;
  outputs?: readonly string[];
  name?: string;
}
export class Circuit {
  constructor(spec: CircuitSpec);
  readonly inputs: string[];
  readonly outputs: string[];
  readonly gates: Record<string, { kind: GateKind; from: string[] }>;
  readonly order: string[];
  evaluate(values: readonly (0 | 1 | boolean)[] | Record<string, 0 | 1 | boolean>): Record<string, 0 | 1>;
  truthTable(): { inputs: (0 | 1)[]; outputs: Record<string, 0 | 1> }[];
  formula(output?: string): Formula;
  readonly size: number;
  readonly depth: number;
  readonly counts: Partial<Record<GateKind, number>>;
}
export function circuit(spec: CircuitSpec | Circuit): Circuit;
export function circuitsEquivalent(a: Circuit | FormulaLike | readonly FormulaLike[], b: Circuit | FormulaLike | readonly FormulaLike[]):
  | { status: "equivalent" }
  | { status: "different"; output: string | number; inputs: Record<string, 0 | 1>; values: (0 | 1)[] };
export function circuitFrom(f: FormulaLike, options?: { gates?: "standard" | "nand" | "nor"; output?: string }): Circuit;
export const adders: { half(): Circuit; full(): Circuit; ripple(bits: number): Circuit };
export interface KarnaughMap {
  atoms: string[];
  rowAtoms: string[];
  colAtoms: string[];
  rowLabels: string[];
  colLabels: string[];
  cells: (0 | 1 | "x")[][];
  groups: { formula: Formula; cells: [number, number][]; size: number; essential: boolean }[];
  formula: Formula;
  toString(): string;
}
export function karnaugh(f: FormulaLike | { minterms: readonly number[]; atoms: readonly string[]; dontCares?: readonly number[] }, options?: { atoms?: readonly string[]; dontCares?: readonly number[] }): KarnaughMap;

export type CategoricalForm = "A" | "E" | "I" | "O";
export interface Categorical {
  form: CategoricalForm;
  subject: string;
  predicate: string;
}
export function categorical(input: string | Categorical): Categorical;
export function categoricalText(c: Categorical): string;
export interface SyllogismResult {
  valid: boolean;
  mood: string;
  figure: 1 | 2 | 3 | 4;
  /** Mood and figure, as "AAA-1". */
  form: string;
  name: string | null;
  existentialImport: boolean;
  terms: { S: string; M: string; P: string };
  statements: [string, string, string];
  counterexample: string[] | null;
  venn: { shaded: string[]; marked: string[] };
  rules: { rule: string; broken: boolean }[];
}
export function syllogism(major: string | Categorical, minor: string | Categorical, conclusion: string | Categorical, options?: { existentialImport?: boolean }): SyllogismResult;
export function syllogism(moodAndFigure: string, options?: { existentialImport?: boolean; S?: string; M?: string; P?: string }): SyllogismResult;
export function validSyllogisms(options?: { existentialImport?: boolean }): { form: string; name: string | null }[];

// ---- modal logic ----

export type ModalSystem = "K" | "D" | "T" | "B" | "S4" | "S5";
export class ModalFormula {
  readonly kind: string;
  readonly key: string;
  readonly parts: ModalFormula[];
  readonly modalDepth: number;
  atoms(): string[];
  equals(other: ModalFormula | string): boolean;
  toString(options?: { style?: "unicode" | "ascii" | "tex" }): string;
}
export function parseModal(text: string): ModalFormula;
export function modal(input: ModalFormula | string): ModalFormula;
export interface KripkeSpec {
  worlds: readonly string[] | number;
  access?: readonly (readonly [string, string])[] | Record<string, readonly string[]>;
  valuation?: Record<string, readonly string[]>;
}
export class Kripke {
  constructor(spec: KripkeSpec);
  readonly worlds: string[];
  sees(w: string): string[];
  describe(): { worlds: string[]; access: Record<string, string[]>; valuation: Record<string, string[]> };
  truthAt(f: ModalFormula | string, w: string): boolean;
  truthAt(f: ModalFormula | string, w: string, options: { explain: true }): { value: boolean; steps: object[] };
  trueAt(f: ModalFormula | string): string[];
  holds(f: ModalFormula | string): boolean;
  properties(): { reflexive: boolean; symmetric: boolean; transitive: boolean; serial: boolean; euclidean: boolean };
}
export function kripke(spec: KripkeSpec | Kripke): Kripke;
export const SYSTEMS: Readonly<Record<ModalSystem, readonly string[]>>;
export function validOnFrame(f: ModalFormula | string, frame: KripkeSpec | Kripke):
  | { valid: true }
  | { valid: false; valuation: Record<string, string[]>; world: string; model: Kripke };
export type ModalValid =
  | { status: "valid"; tree: object }
  | { status: "invalid"; countermodel: Kripke; world: string }
  | { status: "unresolved"; reason: string };
export function modalValid(f: ModalFormula | string, options?: { system?: ModalSystem; budget?: number }): ModalValid;
export function showModalTree(tree: object): string;

// ---- automata, grammars and machines ----

export interface AutomatonSpec {
  states?: readonly string[];
  alphabet?: string | readonly string[];
  start?: string;
  accept?: readonly string[];
  /** state → symbol (or "ε") → one state or several */
  delta: Record<string, Record<string, string | readonly string[]>>;
}
export class Automaton {
  constructor(spec: AutomatonSpec);
  readonly states: string[];
  readonly alphabet: string[];
  readonly start: string;
  readonly accept: Set<string>;
  readonly isDFA: boolean;
  readonly isComplete: boolean;
  run(word: string): { accepted: boolean; trace: { read: string | null; states: string[] }[]; stuck?: string };
  accepts(word: string): boolean;
  words(maxLength?: number): string[];
  toString(): string;
}
export type AutomatonLike = Automaton | AutomatonSpec;
export function automaton(spec: AutomatonLike): Automaton;
export function toDFA(a: AutomatonLike): Automaton;
export function complete(a: AutomatonLike, alphabet?: string | readonly string[]): Automaton;
export function minimizeAutomaton(a: AutomatonLike): Automaton;
export function equivalentAutomata(a: AutomatonLike | string, b: AutomatonLike | string):
  | { equivalent: true }
  | { equivalent: false; word: string; acceptedBy: "first" | "second" };
export function complement(a: AutomatonLike, alphabet?: string | readonly string[]): Automaton;
export function product(a: AutomatonLike, b: AutomatonLike, op?: "and" | "or" | "minus"): Automaton;
export function parseRegex(text: string): object;
export function regexToNFA(regex: string | object): Automaton;
export function toRegex(a: AutomatonLike): string;

export interface ParseTree {
  symbol: string;
  children?: ParseTree[];
}
export class Grammar {
  constructor(input: string | { start?: string; rules: Record<string, readonly string[]> });
  readonly start: string;
  readonly rules: Map<string, string[][]>;
  readonly terminals: string[];
  readonly nonterminals: string[];
  words(maxLength?: number, options?: { budget?: number }): { words: string[]; complete: boolean };
  toCNF(): Grammar;
  parse(word: string): { accepted: boolean; tree: ParseTree | null; cnfTree: ParseTree | null };
  accepts(word: string): boolean;
  toString(): string;
}
export function grammar(input: string | Grammar | { start?: string; rules: Record<string, readonly string[]> }): Grammar;
export function showTree(tree: ParseTree): string;
export class PDA {
  constructor(spec: { start: string; accept?: readonly string[]; stackStart?: string; moves: readonly (readonly [string, string, string, string, string])[] });
  run(word: string, options?: { budget?: number }):
    | { status: "accepted"; trace: { state: string; read: string; stack: string }[] }
    | { status: "rejected" }
    | { status: "unresolved"; reason: string };
  accepts(word: string, options?: { budget?: number }): boolean;
}
export function pda(spec: ConstructorParameters<typeof PDA>[0]): PDA;
export interface TuringSpec {
  start?: string;
  accept?: string;
  reject?: string;
  blank?: string;
  /** "state,symbol" → [new state, symbol written, "L" | "R" | "S"] */
  delta: Record<string, readonly [string, string, "L" | "R" | "S" | "N"]>;
}
export class TuringMachine {
  constructor(spec: TuringSpec);
  run(input?: string, options?: { budget?: number; trace?: boolean }): {
    status: "accepted" | "rejected" | "halted" | "running";
    steps: number;
    state: string;
    head: number;
    tape: string;
    trace?: string[];
  };
}
export function turing(spec: TuringSpec): TuringMachine;
export function binaryIncrement(): TuringMachine;
export interface RecursiveFunction {
  readonly arity: number;
  readonly name: string;
  at(...xs: (bigint | number)[]): bigint;
}
export const recursive: {
  readonly zero: RecursiveFunction;
  readonly succ: RecursiveFunction;
  proj(i: number, n: number): RecursiveFunction;
  compose(f: RecursiveFunction, gs: readonly RecursiveFunction[]): RecursiveFunction;
  primrec(g: RecursiveFunction, h: RecursiveFunction, name?: string): RecursiveFunction;
  mu(f: RecursiveFunction, options?: { budget?: number }): RecursiveFunction;
  constant(c: number, arity: number): RecursiveFunction;
  readonly examples: Readonly<Record<"add" | "mult" | "pred" | "monus" | "power" | "factorial", RecursiveFunction>>;
};

// ---- the plan ----

export interface PlannedPhase {
  phase: number;
  contents: string;
  /** Rough size in source lines, as text ("1,200", or "600, plus 800 in graphics"). */
  estimate: string;
}

/** What is still planned for the package. */
export const plan: readonly PlannedPhase[];
