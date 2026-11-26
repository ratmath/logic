// Categorical syllogisms. Each of the four forms of statement says that a
// region of a Venn diagram of the three terms is empty or has something in
// it. A syllogism is valid when every way of filling the eight regions that
// makes both premises true makes the conclusion true. That is a finite check
// (2^8 fillings), so validity here is decided, not looked up; the classical
// names and rules are reported beside the answer, and the tests check that
// the decision agrees with the traditional list of valid moods.

import { refuse } from "./formula.js";

const FORMS = {
  A: { quantity: "universal", quality: "affirmative", text: (s, p) => `All ${s} are ${p}` },
  E: { quantity: "universal", quality: "negative", text: (s, p) => `No ${s} are ${p}` },
  I: { quantity: "particular", quality: "affirmative", text: (s, p) => `Some ${s} are ${p}` },
  O: { quantity: "particular", quality: "negative", text: (s, p) => `Some ${s} are not ${p}` },
};

/** A categorical statement: { form: "A" | "E" | "I" | "O", subject, predicate }. */
export function categorical(input) {
  if (input && typeof input === "object") {
    if (!FORMS[input.form]) refuse("bad-argument", "form is A, E, I or O");
    return { form: input.form, subject: String(input.subject), predicate: String(input.predicate) };
  }
  const s = String(input).trim().replace(/\.$/, "");
  let m;
  if ((m = /^(?:all|every|each)\s+(.+?)\s+(?:are|is)\s+(.+)$/i.exec(s)) && !/\bnot\b/i.test(m[2])) return { form: "A", subject: m[1], predicate: m[2] };
  if ((m = /^(?:no|none of the)\s+(.+?)\s+(?:are|is)\s+(.+)$/i.exec(s))) return { form: "E", subject: m[1], predicate: m[2] };
  if ((m = /^(?:some)\s+(.+?)\s+(?:are|is)\s+not\s+(.+)$/i.exec(s))) return { form: "O", subject: m[1], predicate: m[2] };
  if ((m = /^(?:some)\s+(.+?)\s+(?:are|is)\s+(.+)$/i.exec(s))) return { form: "I", subject: m[1], predicate: m[2] };
  return refuse("syntax", `"${s}" is not one of: All S are P, No S are P, Some S are P, Some S are not P`);
}
export const categoricalText = (c) => FORMS[c.form].text(c.subject, c.predicate);

// regions are numbered by three bits: S (4), M (2), P (1)
const BIT = { S: 4, M: 2, P: 1 };
const inRegion = (r, term) => (r & BIT[term]) !== 0;
/** what a statement about terms X and Y (each S, M or P) says about the 8 regions, given which are non-empty */
function holds(form, X, Y, nonEmpty) {
  const regions = [...Array(8).keys()];
  const XnotY = regions.filter((r) => inRegion(r, X) && !inRegion(r, Y));
  const XY = regions.filter((r) => inRegion(r, X) && inRegion(r, Y));
  switch (form) {
    case "A": return XnotY.every((r) => !nonEmpty[r]);
    case "E": return XY.every((r) => !nonEmpty[r]);
    case "I": return XY.some((r) => nonEmpty[r]);
    default: return XnotY.some((r) => nonEmpty[r]);
  }
}
const FIGURES = {
  1: [["M", "P"], ["S", "M"]],
  2: [["P", "M"], ["S", "M"]],
  3: [["M", "P"], ["M", "S"]],
  4: [["P", "M"], ["M", "S"]],
};
const NAMES = {
  "AAA-1": "Barbara", "EAE-1": "Celarent", "AII-1": "Darii", "EIO-1": "Ferio", "AAI-1": "Barbari", "EAO-1": "Celaront",
  "EAE-2": "Cesare", "AEE-2": "Camestres", "EIO-2": "Festino", "AOO-2": "Baroco", "EAO-2": "Cesaro", "AEO-2": "Camestros",
  "IAI-3": "Disamis", "AII-3": "Datisi", "OAO-3": "Bocardo", "EIO-3": "Ferison", "AAI-3": "Darapti", "EAO-3": "Felapton",
  "AEE-4": "Calemes", "IAI-4": "Dimatis", "EIO-4": "Fresison", "AAI-4": "Bamalip", "AEO-4": "Calemos", "EAO-4": "Fesapo",
};
const distributes = (form, position) => (position === "subject" ? form === "A" || form === "E" : form === "E" || form === "O");

/**
 * Decide a syllogism. Give the statements (text or { form, subject,
 * predicate }) as syllogism(major, minor, conclusion), or a mood and figure
 * as syllogism("AAA-1"). Options: existentialImport (default false, the
 * modern reading): when true, every term is taken to have members, as
 * Aristotle's logic assumed.
 *
 *   { valid, mood, figure, name, terms: { S, M, P },
 *     counterexample: regions that are non-empty in a filling that makes the
 *       premises true and the conclusion false (null when valid),
 *     venn: { shaded: regions forced empty, marked: regions forced non-empty },
 *     rules: [{ rule, broken }] — the traditional rules, for comparison }
 */
export function syllogism(a, b, c, { existentialImport = false } = {}) {
  let major;
  let minor;
  let concl;
  let terms;
  if (typeof a === "string" && /^[AEIO]{3}-?[1-4]$/i.test(a.trim()) && (b === undefined || typeof b === "object")) {
    const t = a.trim().toUpperCase().replace("-", "");
    const fig = Number(t[3]);
    const [mj, mn] = FIGURES[fig];
    const opts = b ?? {};
    existentialImport = opts.existentialImport ?? existentialImport;
    const name = { S: opts.S ?? "S", M: opts.M ?? "M", P: opts.P ?? "P" };
    major = { form: t[0], subject: name[mj[0]], predicate: name[mj[1]] };
    minor = { form: t[1], subject: name[mn[0]], predicate: name[mn[1]] };
    concl = { form: t[2], subject: name.S, predicate: name.P };
    terms = name;
  } else {
    [major, minor, concl] = [a, b, c].map(categorical);
    const S = concl.subject;
    const P = concl.predicate;
    const all = [major.subject, major.predicate, minor.subject, minor.predicate];
    const middle = all.filter((x) => x !== S && x !== P);
    if (!middle.length || middle.some((x) => x !== middle[0])) refuse("bad-syllogism", `a syllogism has three terms, each used twice: here the terms are ${[...new Set([...all, S, P])].join(", ")}`);
    if (!(major.subject === P || major.predicate === P)) refuse("bad-syllogism", `the major premise (first) must contain the major term ${P}`);
    if (!(minor.subject === S || minor.predicate === S)) refuse("bad-syllogism", `the minor premise (second) must contain the minor term ${S}`);
    terms = { S, M: middle[0], P };
  }
  const role = (x) => (x === terms.S ? "S" : x === terms.M ? "M" : x === terms.P ? "P" : refuse("bad-syllogism", `${x} is not one of the three terms`));
  const mj = [role(major.subject), role(major.predicate)];
  const mn = [role(minor.subject), role(minor.predicate)];
  const figure = Number(Object.keys(FIGURES).find((k) => FIGURES[k][0].join() === mj.join() && FIGURES[k][1].join() === mn.join()));
  if (!figure) refuse("bad-syllogism", "the middle term must appear once in each premise and the conclusion must be S–P");
  const mood = major.form + minor.form + concl.form;
  const key = `${mood}-${figure}`;
  // decide by trying every filling of the eight regions
  const prem = (ne) => holds(major.form, mj[0], mj[1], ne) && holds(minor.form, mn[0], mn[1], ne) && (!existentialImport || ["S", "M", "P"].every((t) => [...Array(8).keys()].some((r) => inRegion(r, t) && ne[r])));
  const conc = (ne) => holds(concl.form, "S", "P", ne);
  let counter = null;
  const models = [];
  for (let mask = 0; mask < 256; mask++) {
    const ne = [...Array(8).keys()].map((r) => ((mask >> r) & 1) === 1);
    if (!prem(ne)) continue;
    models.push(ne);
    if (!conc(ne) && (!counter || popcount(mask) < popcount(counter.mask))) counter = { mask, ne };
  }
  const regionName = (r) => ["S", "M", "P"].map((t) => (inRegion(r, t) ? t : `¬${t}`)).join("");
  const shaded = [...Array(8).keys()].filter((r) => models.every((ne) => !ne[r])).map(regionName);
  const marked = [...Array(8).keys()].filter((r) => models.length && models.every((ne) => ne[r])).map(regionName);
  // the traditional rules
  const neg = (f) => FORMS[f].quality === "negative";
  const middleDistributed = (mj[0] === "M" && distributes(major.form, "subject")) || (mj[1] === "M" && distributes(major.form, "predicate")) || (mn[0] === "M" && distributes(minor.form, "subject")) || (mn[1] === "M" && distributes(minor.form, "predicate"));
  const inPremise = (f, pair, t) => (pair[0] === t && distributes(f, "subject")) || (pair[1] === t && distributes(f, "predicate"));
  const rules = [
    { rule: "the middle term is distributed at least once", broken: !middleDistributed },
    { rule: "a term distributed in the conclusion is distributed in its premise (illicit major)", broken: distributes(concl.form, "predicate") && !inPremise(major.form, mj, "P") },
    { rule: "a term distributed in the conclusion is distributed in its premise (illicit minor)", broken: distributes(concl.form, "subject") && !inPremise(minor.form, mn, "S") },
    { rule: "not both premises negative", broken: neg(major.form) && neg(minor.form) },
    { rule: "a negative premise needs a negative conclusion, and back", broken: (neg(major.form) || neg(minor.form)) !== neg(concl.form) },
    { rule: "two universal premises do not give a particular conclusion (modern reading)", broken: !existentialImport && FORMS[major.form].quantity === "universal" && FORMS[minor.form].quantity === "universal" && FORMS[concl.form].quantity === "particular" },
  ];
  return {
    valid: counter === null,
    mood,
    figure,
    form: key,
    name: counter === null ? NAMES[key] ?? null : null,
    existentialImport,
    terms,
    statements: [major, minor, concl].map(categoricalText),
    counterexample: counter ? [...Array(8).keys()].filter((r) => counter.ne[r]).map(regionName) : null,
    venn: { shaded, marked },
    rules,
  };
}
const popcount = (x) => x.toString(2).replace(/0/g, "").length;

/** Every valid mood and figure (24 with existential import, 15 without), with its traditional name. */
export function validSyllogisms({ existentialImport = false } = {}) {
  const out = [];
  for (const a of "AEIO") for (const b of "AEIO") for (const c of "AEIO") for (const f of [1, 2, 3, 4]) {
    const r = syllogism(`${a}${b}${c}-${f}`, { existentialImport });
    if (r.valid) out.push({ form: r.form, name: r.name });
  }
  return out;
}
