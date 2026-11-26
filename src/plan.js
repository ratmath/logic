// What is still planned for this package, phase by phase, from the RatMath
// library roadmap. Phases 1 and 2 (propositional logic and proofs) are built;
// a phase is removed from this list when it ships.

export const plan = Object.freeze([
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
