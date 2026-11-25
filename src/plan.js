// What this package is planned to contain, phase by phase, from the RatMath
// library roadmap. Nothing here is built yet; a phase is removed from this list
// when it ships, and the list goes away when it is empty.

export const plan = Object.freeze([
  {
    "phase": 1,
    "contents": "Propositional formulas, tables, normal forms, satisfiability, simplification",
    "estimate": "900"
  },
  {
    "phase": 2,
    "contents": "Proof checkers, rule sets, proof search and hints",
    "estimate": "1,200"
  },
  {
    "phase": 3,
    "contents": "Predicate logic: syntax, finite models, model search, quantifier rules",
    "estimate": "1,100"
  },
  {
    "phase": 4,
    "contents": "Circuits, Karnaugh maps, syllogisms",
    "estimate": "400"
  },
  {
    "phase": 5,
    "contents": "Modal logic",
    "estimate": "500"
  },
  {
    "phase": 6,
    "contents": "Ordinals, cardinals, Peano arithmetic, Gödel numbering",
    "estimate": "500"
  },
  {
    "phase": 7,
    "contents": "Automata, grammars, Turing machines",
    "estimate": "1,000"
  },
  {
    "phase": 8,
    "contents": "Pictures",
    "estimate": "500 in graphics"
  }
].map(Object.freeze));
