// Natural deduction in Fitch style: proofs as numbered lines with subproofs,
// rule sets that are plain data, and a checker that says which line fails,
// under which rule, and what the rule was missing.

import { formula, formulas, parse, refuse, matchSchema, fillSchema, LogicError } from "./formula.js";

// ---- rule sets ---------------------------------------------------------------------------------

/**
 * A rule is data: a name, other names people use for it, and one or more
 * forms. A form lists what is cited and what may then be written. In a form,
 * the letters A, B, C stand for any formulas; "A ⊢ B" is a subproof that
 * assumes A and ends with B.
 */
const rule = (name, aliases, about, ...forms) => ({
  name,
  aliases,
  about,
  forms: forms.map(([from, infer]) => ({ from, infer })),
});

const BASIC = [
  rule("R", ["reit", "reiteration", "repeat", "copy"], "repeat a line that is still in reach", [["A"], "A"]),
  rule("∧I", ["conj", "conjunction", "adj"], "from both parts, the conjunction", [["A", "B"], "A ∧ B"]),
  rule("∧E", ["simp", "simplification"], "from a conjunction, either part", [["A ∧ B"], "A"], [["A ∧ B"], "B"]),
  rule("∨I", ["add", "addition"], "from either part, the disjunction", [["A"], "A ∨ B"], [["B"], "A ∨ B"]),
  rule("∨E", ["cases", "proof by cases", "pc"], "from a disjunction and a subproof from each part to the same line, that line", [["A ∨ B", "A ⊢ C", "B ⊢ C"], "C"]),
  rule("→I", ["cp", "conditional proof"], "from a subproof assuming A and reaching B, the conditional", [["A ⊢ B"], "A → B"]),
  rule("→E", ["mp", "modus ponens"], "from a conditional and its left side, its right side", [["A → B", "A"], "B"]),
  rule("¬I", ["negation introduction"], "from a subproof assuming A and reaching ⊥, the negation", [["A ⊢ ⊥"], "¬A"]),
  rule("¬E", ["⊥I", "contradiction", "negation elimination"], "from a formula and its negation, ⊥", [["A", "¬A"], "⊥"]),
  rule("⊥E", ["x", "explosion", "efq", "ex falso", "ex falso quodlibet"], "from ⊥, anything", [["⊥"], "A"]),
  rule("↔I", ["biconditional introduction"], "from a subproof each way, the biconditional", [["A ⊢ B", "B ⊢ A"], "A ↔ B"]),
  rule("↔E", ["biconditional elimination"], "from a biconditional and one side, the other side", [["A ↔ B", "A"], "B"], [["A ↔ B", "B"], "A"]),
  rule("⊤I", ["truth"], "⊤ may be written anywhere", [[], "⊤"]),
  rule("⊕I", ["xor introduction"], "from one or the other and not both, the exclusive or", [["A ∨ B", "¬(A ∧ B)"], "A ⊕ B"]),
  rule("⊕E", ["xor elimination"], "from an exclusive or: one or the other, and not both", [["A ⊕ B"], "A ∨ B"], [["A ⊕ B"], "¬(A ∧ B)"]),
];
const CLASSICAL = [
  rule("IP", ["raa", "pbc", "indirect proof", "by contradiction", "reductio", "¬E*"], "from a subproof assuming ¬A and reaching ⊥, A", [["¬A ⊢ ⊥"], "A"]),
  rule("DNE", ["dn", "double negation", "¬¬E"], "from ¬¬A, A", [["¬¬A"], "A"]),
  rule("LEM", ["em", "excluded middle", "tnd"], "A ∨ ¬A may be written anywhere", [[], "A ∨ ¬A"]),
];
const DERIVED = [
  rule("MT", ["modus tollens"], "from a conditional and the negation of its right side, the negation of its left", [["A → B", "¬B"], "¬A"]),
  rule("DS", ["disjunctive syllogism"], "from a disjunction and the negation of one part, the other part", [["A ∨ B", "¬A"], "B"], [["A ∨ B", "¬B"], "A"]),
  rule("HS", ["hypothetical syllogism", "chain"], "from A → B and B → C, A → C", [["A → B", "B → C"], "A → C"]),
  rule("DNI", ["¬¬I"], "from A, ¬¬A", [["A"], "¬¬A"]),
  rule(
    "DeM",
    ["de morgan", "dm", "de morgan's laws"],
    "De Morgan's laws, in either direction",
    [["¬(A ∧ B)"], "¬A ∨ ¬B"],
    [["¬A ∨ ¬B"], "¬(A ∧ B)"],
    [["¬(A ∨ B)"], "¬A ∧ ¬B"],
    [["¬A ∧ ¬B"], "¬(A ∨ B)"],
  ),
];

const compiled = new WeakMap();
const compile = (r) => {
  let c = compiled.get(r);
  if (!c) {
    c = r.forms.map((form) => {
      const lines = [];
      const subs = [];
      for (const text of form.from) {
        if (text.includes("⊢")) {
          const [a, b] = text.split("⊢");
          subs.push({ assume: parse(a), reach: parse(b), text });
        } else lines.push(parse(text));
      }
      return { lines, subs, infer: parse(form.infer), form };
    });
    compiled.set(r, c);
  }
  return c;
};

/** A spelling of a rule name that ignores case, spaces and which keyboard typed the connective. */
export function ruleKey(name) {
  return String(name)
    .trim()
    .replace(/_\|_|#/g, "⊥")
    .replace(/<->|<=>|⇔|≡/g, "↔")
    .replace(/->|=>|⇒|⊃/g, "→")
    .replace(/\/\\|&&|&|\^/g, "∧")
    .replace(/\\\/|\|\||\|/g, "∨")
    .replace(/[~!∼]/g, "¬")
    .replace(/\b(intro(duction)?)\b/gi, "I")
    .replace(/\b(elim(ination)?)\b/gi, "E")
    .replace(/\b(and|conjunction)\s*(?=[IELR][12]?$)/i, "∧")
    .replace(/\b(or|disjunction)\s*(?=[IELR][12]?$)/i, "∨")
    .replace(/\bv(?=[IELR][12]?$)/, "∨")
    .replace(/\b(not|neg|negation)\s*(?=[IELR][12]?$)/i, "¬")
    .replace(/-(?=[IELR][12]?$)/, "¬")
    .replace(/\b(if|imp|implies|implication|conditional)\s*(?=[IELR][12]?$)/i, "→")
    .replace(/\b(iff|bi|biconditional)\s*(?=[IELR][12]?$)/i, "↔")
    .replace(/\b(bot|bottom|falsum|false)\s*(?=[IELR][12]?$)/i, "⊥")
    .replace(/\b(top|true)\s*(?=[IELR][12]?$)/i, "⊤")
    .replace(/\bxor\s*(?=[IELR][12]?$)/i, "⊕")
    .replace(/[\s.]+/g, "")
    .toLowerCase();
}

/**
 * A rule set from a list of rules. A rule is
 * { name, aliases?, about?, forms: [{ from: ["A → B", "A"], infer: "B" }] }.
 */
export function ruleSet(name, list, { logic } = {}) {
  const byKey = new Map();
  const all = list.map((r) => ({ aliases: [], about: "", ...r }));
  for (const r of all) {
    compile(r);
    for (const n of [r.name, ...r.aliases]) byKey.set(ruleKey(n), r);
  }
  return Object.freeze({ name, logic, rules: Object.freeze(all), find: (text) => byKey.get(ruleKey(text)) ?? null });
}

/**
 * The rule sets that come with the package.
 *   rules.intuitionistic   introduction and elimination rules, with ⊥E
 *   rules.classical        the same and IP (indirect proof), DNE, LEM
 *   rules.derived          classical and the shortcuts MT, DS, HS, DNI, DeM
 */
export const rules = Object.freeze({
  intuitionistic: ruleSet("intuitionistic natural deduction", BASIC, { logic: "intuitionistic" }),
  classical: ruleSet("classical natural deduction", [...BASIC, ...CLASSICAL], { logic: "classical" }),
  derived: ruleSet("classical natural deduction with derived rules", [...BASIC, ...CLASSICAL, ...DERIVED], { logic: "classical" }),
});

const PREMISE = new Set(["premise", "prem", "pr", "given", "hypothesis"]);
const ASSUMPTION = new Set(["assumption", "assume", "ass", "as", "asm", "hyp", "supposition", "suppose"]);
const special = (text) => {
  const k = String(text).trim().toLowerCase();
  return PREMISE.has(k) ? "premise" : ASSUMPTION.has(k) ? "assumption" : null;
};

// ---- proofs --------------------------------------------------------------------------------------

/**
 * A Fitch proof: lines of { n, depth, formula, rule, cites }. `rule` is
 * "premise", "assumption" or the name of a rule; `cites` lists line numbers
 * and [first, last] pairs for subproofs.
 */
export class Proof {
  constructor(lines, read = formula) {
    this.lines = lines.map((l, i) => ({
      n: l.n ?? i + 1,
      depth: l.depth ?? 0,
      formula: typeof l.formula === "string" ? read(l.formula) : l.formula?.key !== undefined ? l.formula : formula(l.formula),
      rule: l.rule ?? "",
      cites: (l.cites ?? []).map((c) => (Array.isArray(c) ? [c[0], c[1]] : c)),
    }));
  }
  /** Check every line: see checkProof. */
  check(options) {
    return checkProof(this, options);
  }
  /** The proof as text that parseProof reads back. style: "unicode" or "ascii". */
  toString({ style = "unicode" } = {}) {
    const bar = style === "ascii" ? "| " : "│ ";
    const digits = String(this.lines.length).length;
    const body = this.lines.map((l) => bar.repeat(l.depth) + l.formula.toString({ style }));
    const width = Math.max(...body.map((b) => [...b].length), 1);
    return this.lines
      .map((l, i) => {
        const cites = l.cites.map((c) => (Array.isArray(c) ? `${c[0]}-${c[1]}` : String(c))).join(", ");
        const name = style === "ascii" ? asciiRule(l.rule) : l.rule;
        const pad = " ".repeat(width - [...body[i]].length);
        return `${String(l.n).padStart(digits)}. ${body[i]}${pad}   ${name}${cites ? " " + cites : ""}`.trimEnd();
      })
      .join("\n");
  }
}
const asciiRule = (r) => r.replace("∧", "&").replace("∨", "|").replace("→", "->").replace("↔", "<->").replace("¬", "~").replace("⊥", "_|_").replace("⊤", "top").replace("⊕", "xor");

/**
 * Read a proof from text, one line each:
 *
 *   1. p -> q        premise
 *   2. | p           assumption
 *   3. | q           ->E 1, 2
 *   4. p -> q        ->I 2-3
 *
 * A bar (| or │) at the start marks each level of subproof. Line numbers may
 * be left out. The reason comes after the formula: "premise", "assumption",
 * or a rule name with the lines it uses; a subproof is cited as first-last.
 * Rule names are read loosely: ->E, →E, MP and "modus ponens" are one rule.
 */
export function parseProof(text, { rules: set = rules.derived } = {}) {
  const read = set.read ?? parse;
  const lines = [];
  let numbered = null;
  const raws = String(text).split("\n");
  raws.forEach((raw, row) => {
    let s = raw.replace(/\s+$/, "");
    if (!s.trim() || /^\s*(#|\/\/)/.test(s) || /^[\s|│─\-_=+]+$/.test(s)) return;
    const where = `line ${row + 1} of the text ("${s.trim()}")`;
    let n = null;
    const num = /^\s*\(?(\d+)[.):]?(?=\s|\||│)\s*/.exec(s);
    if (num) {
      n = Number(num[1]);
      s = s.slice(num[0].length);
    }
    if (numbered === null) numbered = n !== null;
    else if (numbered !== (n !== null)) refuse("syntax", `${where}: number every line of the proof or none`);
    let depth = 0;
    for (let m; (m = /^\s*[|│]/.exec(s)); s = s.slice(m[0].length)) depth++;
    s = s.trim();
    // the formula ends where the reason starts: try the widest formula first
    const cuts = [];
    for (let i = s.length - 1; i > 0; i--) if (/\s/.test(s[i]) && !/\s/.test(s[i - 1])) cuts.push(i);
    let found = null;
    let formulaOnly = null;
    for (const i of cuts) {
      const head = s.slice(0, i).replace(/[:;]\s*$/, "");
      const reason = readReason(s.slice(i), set);
      if (!reason) continue;
      try {
        found = { formula: read(head), ...reason };
        break;
      } catch (e) {
        if (!(e instanceof LogicError)) throw e;
      }
    }
    if (!found) {
      try {
        formulaOnly = read(s);
      } catch (e) {
        if (!(e instanceof LogicError)) throw e;
      }
      if (formulaOnly) found = { formula: formulaOnly, rule: "", cites: [] };
      else {
        // a clear gap marks the reason, even when the rule's name is not one we know
        const cut = /\s{2,}|\t/.exec(s);
        if (!cut) refuse("syntax", `${where}: cannot find a formula followed by a reason`);
        let head;
        try {
          head = read(s.slice(0, cut.index));
        } catch (e) {
          refuse("syntax", `${where}: ${e.message}`);
        }
        found = { formula: head, ...readReason(s.slice(cut.index), set, true) };
      }
    }
    lines.push({ n: n ?? lines.length + 1, depth, ...found });
  });
  const seen = new Set();
  for (const l of lines) {
    if (seen.has(l.n)) refuse("syntax", `two lines of the proof are numbered ${l.n}`);
    seen.add(l.n);
  }
  return new Proof(lines, read);
}
function readReason(text, set, loose = false) {
  const cites = [];
  const name = text
    .replace(/(\d+)\s*[-–—]\s*(\d+)|(\d+)/g, (_, a, b, c) => {
      cites.push(c !== undefined ? Number(c) : [Number(a), Number(b)]);
      return " ";
    })
    .replace(/[,;:()]/g, " ")
    .trim();
  if (!name) return loose ? { rule: "", cites } : null;
  const sp = special(name);
  if (sp) return { rule: sp, cites };
  const known = set.find(name) ?? rules.derived.find(name);
  if (known) return { rule: known.name, cites };
  if (loose) return { rule: name, cites };
  // an unknown word that looks like a rule name is kept, for the checker to report
  return /^[^\s\d]{1,12}$/.test(name) && !/^[a-z]$/.test(name) && /[IEie]$|^[A-Z]{2,5}$/.test(name) ? { rule: name, cites } : null;
}

// ---- the checker ---------------------------------------------------------------------------------

const quote = (f) => `"${f}"`;
const describeNeeds = (form) => {
  const parts = [];
  const nl = form.lines.length;
  const ns = form.subs.length;
  if (nl) parts.push(nl === 1 ? "one line" : `${["", "", "two", "three"][nl] ?? nl} lines`);
  if (ns) parts.push(ns === 1 ? "one subproof" : `${["", "", "two", "three"][ns] ?? ns} subproofs`);
  return parts.length ? parts.join(" and ") : "nothing";
};
const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

/** Try one rule on one line. Returns null when it applies, or the text of what was missing. */
export function applyRule(r, target, lineCites, subCites) {
  const forms = compile(r).filter((f) => f.lines.length === lineCites.length && f.subs.length === subCites.length);
  if (!forms.length) {
    const wants = [...new Set(compile(r).map(describeNeeds))].join(", or ");
    const got = describeNeeds({ lines: lineCites, subs: subCites });
    return `${r.name} cites ${wants}; here it is given ${got}`;
  }
  let best = null;
  const consider = (score, message) => {
    if (!best || score > best.score) best = { score, message };
  };
  for (const f of forms) {
    const start = new Map();
    if (!matchSchema(f.infer, target, start)) {
      consider(0, `${r.name} gives a formula of the form ${quote(fillSchema(f.infer, new Map()))}; ${quote(target)} does not have that form`);
      continue;
    }
    for (const lp of permutations(lineCites)) {
      for (const sp of permutations(subCites)) {
        const bind = new Map(start);
        let matched = 1;
        let failure = null;
        for (let i = 0; i < f.lines.length && !failure; i++) {
          const before = new Map(bind);
          if (matchSchema(f.lines[i], lp[i].formula, bind)) matched++;
          else failure = `to give ${quote(target)}, ${r.name} needs a line reading ${quote(fillSchema(f.lines[i], before))}; line ${lp[i].n} reads ${quote(lp[i].formula)}`;
        }
        for (let i = 0; i < f.subs.length && !failure; i++) {
          const before = new Map(bind);
          const s = sp[i];
          if (matchSchema(f.subs[i].assume, s.assume, bind) && matchSchema(f.subs[i].reach, s.reach, bind)) matched++;
          else {
            failure =
              `to give ${quote(target)}, ${r.name} needs a subproof that assumes ${quote(fillSchema(f.subs[i].assume, before))} and ends with ${quote(fillSchema(f.subs[i].reach, before))}; ` +
              `the subproof ${s.first}-${s.last} assumes ${quote(s.assume)} and ends with ${quote(s.reach)}`;
          }
        }
        if (!failure) return null;
        consider(matched, failure);
      }
    }
  }
  return best.message;
}

/**
 * Check a proof line by line.
 *
 *   checkProof(proof, { rules, premises, conclusion })
 *
 * proof is a Proof or text for parseProof. rules is a rule set (default
 * rules.classical). With premises given, a line marked premise must be one
 * of them; with a conclusion given, the proof is complete only when its last
 * line is that formula, outside every subproof.
 *
 *   { status: "proof" | "incomplete" | "errors",
 *     ok, complete, errors: [{ line, rule, message }], proves, lines }
 *
 * Each error names the line, the rule and what the rule needed and did not
 * find. `proves` is what a correct proof establishes, as "premises ⊢ last line".
 */
export function checkProof(input, { rules: set = rules.classical, premises, conclusion } = {}) {
  const proof = input instanceof Proof ? input : typeof input === "string" ? parseProof(input, { rules: set }) : new Proof(input.lines ?? input, set.read ?? formula);
  const given = premises === undefined ? null : (set.readList ?? formulas)(premises);
  const goal = conclusion === undefined ? null : (set.read ?? formula)(conclusion);
  const errors = [];
  const lines = proof.lines;
  const index = new Map(lines.map((l, i) => [l.n, i]));
  // the subproof each line sits in: a path of subproof ids from the outside in
  const subs = [];
  const path = [];
  const stack = [];
  const closeTo = (depth, at) => {
    while (stack.length > depth) subs[stack.pop()].last = at;
  };
  const bad = (i, ruleName, message) => errors.push({ line: lines[i].n, rule: ruleName, message: `line ${lines[i].n}: ${message}` });
  lines.forEach((l, i) => {
    const kind = special(l.rule);
    const prev = i ? lines[i - 1].n : null;
    if (l.depth > stack.length + 1) {
      bad(i, l.rule, `the line is indented ${l.depth} levels, but only ${stack.length + 1} can be open here: a subproof opens one level at a time, with an assumption`);
      closeTo(0, prev);
      for (let d = 0; d < l.depth; d++) stack.push(subs.push({ first: l.n, last: null, parent: [...stack], broken: true }) - 1);
    } else if (l.depth === stack.length + 1) {
      if (kind !== "assumption") bad(i, l.rule, `a new subproof starts here, so its first line must be an assumption${l.rule ? `, not ${l.rule}` : ""}`);
      stack.push(subs.push({ first: l.n, last: null, parent: [...stack] }) - 1);
    } else {
      closeTo(l.depth, prev);
      if (kind === "assumption") {
        if (l.depth === 0) bad(i, l.rule, "an assumption opens a subproof, so it must be indented one level (start the line with |); a premise is marked premise");
        else {
          // a second subproof right after the first, at the same depth
          closeTo(l.depth - 1, prev);
          stack.push(subs.push({ first: l.n, last: null, parent: [...stack] }) - 1);
        }
      }
    }
    path.push([...stack]);
  });
  const lastN = lines.length ? lines[lines.length - 1].n : null;
  const openAtEnd = [...stack];
  const isPrefix = (a, b) => a.length <= b.length && a.every((x, k) => b[k] === x);
  const subAt = new Map();
  subs.forEach((s, id) => subAt.set(s.first, id));

  lines.forEach((l, i) => {
    const kind = special(l.rule);
    if (kind === "premise") {
      if (l.depth !== 0) bad(i, "premise", "a premise cannot sit inside a subproof; what is supposed there is an assumption");
      else if (given && !given.some((p) => p.key === l.formula.key)) {
        bad(i, "premise", `${quote(l.formula)} is marked as a premise, but the premises are ${given.length ? given.map(quote).join(", ") : "none"}`);
      }
      return;
    }
    if (kind === "assumption") return;
    if (!l.rule) return bad(i, "", `no reason is given for ${quote(l.formula)}`);
    const r = set.find(l.rule);
    if (!r) {
      const elsewhere = rules.derived.find(l.rule);
      if (elsewhere) {
        const why = rules.classical.find(l.rule) && set.logic === "intuitionistic" ? `${elsewhere.name} is a classical rule and` : `${elsewhere.name}`;
        return bad(i, elsewhere.name, `${why} is not in this rule set (${set.name})`);
      }
      return bad(i, l.rule, `"${l.rule}" is not the name of a rule in this rule set (${set.name})`);
    }
    // what is cited, and whether it is in reach
    const lineCites = [];
    const subCites = [];
    for (const c of l.cites) {
      if (Array.isArray(c)) {
        const [a, b] = c;
        const id = subAt.get(a);
        if (!index.has(a) || !index.has(b)) return bad(i, r.name, `it cites ${a}-${b}, but there is no line ${index.has(a) ? b : a}`);
        if (index.get(b) >= i) return bad(i, r.name, `it cites the subproof ${a}-${b}, which is not finished before this line`);
        if (id === undefined || subs[id].broken) return bad(i, r.name, `it cites ${a}-${b} as a subproof, but no subproof starts at line ${a}`);
        const s = subs[id];
        const end = s.last ?? lastN;
        if (end !== b) return bad(i, r.name, `it cites ${a}-${b} as a subproof, but the subproof that starts at line ${a} runs to line ${end}`);
        if (!isPrefix(s.parent, path[i])) return bad(i, r.name, `it cites the subproof ${a}-${b}, which lies inside another subproof that has already ended`);
        subCites.push({ first: a, last: b, assume: lines[index.get(a)].formula, reach: lines[index.get(b)].formula });
        if (path[index.get(b)].length !== s.parent.length + 1) return bad(i, r.name, `the subproof ${a}-${b} ends inside a further subproof; its last line must be at its own level`);
      } else {
        if (!index.has(c)) return bad(i, r.name, `it cites line ${c}, and there is no such line`);
        const j = index.get(c);
        if (j >= i) return bad(i, r.name, `it cites line ${c}, which does not come before it`);
        if (!isPrefix(path[j], path[i])) {
          const s = subs[path[j].find((id, k) => path[i][k] !== id)];
          return bad(i, r.name, `it cites line ${c}, which is inside the subproof ${s.first}-${s.last ?? lastN} that has ended; only the subproof as a whole can be cited now`);
        }
        lineCites.push({ n: c, formula: lines[j].formula });
      }
    }
    const missing = r.check
      ? r.check(l.formula, lineCites, subCites, {
          open: path[i].map((id) => lines[index.get(subs[id].first)].formula),
          premises: lines.filter((m) => m.depth === 0 && special(m.rule) === "premise").map((m) => m.formula),
        })
      : applyRule(r, l.formula, lineCites, subCites);
    if (missing) bad(i, r.name, missing);
  });

  const ok = errors.length === 0;
  const top = lines.filter((l) => l.depth === 0);
  const end = lines.length ? lines[lines.length - 1] : null;
  const premiseLines = top.filter((l) => special(l.rule) === "premise").map((l) => l.formula);
  const atTop = end && end.depth === 0;
  let complete = ok && Boolean(atTop) && (!goal || end.formula.key === goal.key);
  let note = null;
  if (ok && !complete) {
    note = !end
      ? "the proof has no lines yet"
      : !atTop
        ? `the proof ends inside the subproof that starts at line ${subs[openAtEnd[openAtEnd.length - 1]].first}`
        : `every line checks, but the last line is ${quote(end.formula)}, not the conclusion ${quote(goal)}`;
  }
  return {
    status: !ok ? "errors" : complete ? "proof" : "incomplete",
    ok,
    complete,
    errors,
    note,
    proves: ok && atTop ? `${premiseLines.join(", ")}${premiseLines.length ? " " : ""}⊢ ${end.formula}` : null,
    lines: lines.length,
    rules: set.name,
  };
}

/** For the prover and the hint giver: where the proof stands after its last line. */
export function proofState(proof) {
  const lines = proof.lines;
  const stack = [];
  const subs = [];
  const frames = [];
  lines.forEach((l, i) => {
    const kind = special(l.rule);
    const closeTo = (depth) => {
      while (stack.length > depth) {
        const s = stack.pop();
        s.last = lines[i - 1].n;
        s.reach = lines[i - 1].formula;
        (stack.length ? stack[stack.length - 1].closed : frames).push(s);
      }
    };
    if (l.depth > stack.length) stack.push({ first: l.n, assume: l.formula, lines: [], closed: [] });
    else {
      closeTo(l.depth);
      if (kind === "assumption" && l.depth > 0) {
        closeTo(l.depth - 1);
        stack.push({ first: l.n, assume: l.formula, lines: [], closed: [] });
      }
    }
    (stack.length ? stack[stack.length - 1].lines : subs).push(l);
  });
  // lines in reach now: top-level lines and the lines of each open subproof
  const reach = [...subs, ...stack.flatMap((s) => s.lines)];
  const closedInReach = [...frames, ...stack.flatMap((s) => s.closed)];
  return { open: stack, reach, closed: closedInReach };
}

export { special };
