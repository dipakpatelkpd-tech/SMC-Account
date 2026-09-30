/**
 * Phonetic Gujarati: English letters in, Unicode Gujarati out.
 *
 * For a school whose PC has no Gujarati keyboard installed - or whose staff
 * learned to type Gujarati on the old LMG-Arun / Terafont layouts, which do
 * not produce Unicode. Typing "shaaLaa" gives શાળા, "grAnT" gives ગ્રાન્ટ,
 * "kharchanaa chukavyaa" gives ખર્ચના ચુકવ્યા.
 *
 * The scheme is the familiar ITRANS one, spelled out in PHONETIC_HELP:
 *
 *  - a consonant carries its own "a": "ka" and "k" at the end of a word are
 *    both ક; two consonants in a row join ("gr" is ગ્ર, "rch" is ર્ચ);
 *  - long vowels are doubled or capital ("aa"/"A" ા, "ii"/"ee"/"I" ી, "uu"/"oo"/"U" ૂ);
 *  - capitals are the retroflex and other second letters (T ટ, D ડ, N ણ, L ળ, Sh ષ);
 *  - M is the anusvara (ં), H the visarga (ઃ).
 *
 * Works a word at a time: the caller keeps the English letters of the word
 * being typed and asks for its Gujarati after every key, so a later letter can
 * still change an earlier one ("k" ક, then "kh" ખ).
 *
 * Pure, so it is tested in Node.
 */

type Token =
  | { kind: "consonant"; text: string }
  | { kind: "vowel"; independent: string; sign: string }
  | { kind: "mark"; text: string }
  | { kind: "literal"; text: string };

const CONSONANTS: Record<string, string> = {
  k: "ક", kh: "ખ", g: "ગ", gh: "ઘ", "~N": "ઙ",
  ch: "ચ", c: "ચ", chh: "છ", Ch: "છ", j: "જ", jh: "ઝ", z: "ઝ", "~n": "ઞ",
  T: "ટ", Th: "ઠ", D: "ડ", Dh: "ઢ", N: "ણ",
  t: "ત", th: "થ", d: "દ", dh: "ધ", n: "ન",
  p: "પ", ph: "ફ", f: "ફ", b: "બ", bh: "ભ", m: "મ",
  y: "ય", r: "ર", l: "લ", v: "વ", w: "વ",
  sh: "શ", S: "શ", Sh: "ષ", shh: "ષ", s: "સ", h: "હ", L: "ળ",
  x: "ક્ષ", ksh: "ક્ષ", GY: "જ્ઞ", jny: "જ્ઞ",
};

/** independent form, and the sign it takes after a consonant ("" for a). */
const VOWELS: Record<string, [string, string]> = {
  a: ["અ", ""],
  aa: ["આ", "ા"], A: ["આ", "ા"],
  i: ["ઇ", "િ"],
  ii: ["ઈ", "ી"], ee: ["ઈ", "ી"], I: ["ઈ", "ી"],
  u: ["ઉ", "ુ"],
  uu: ["ઊ", "ૂ"], oo: ["ઊ", "ૂ"], U: ["ઊ", "ૂ"],
  e: ["એ", "ે"], E: ["એ", "ે"],
  ai: ["ઐ", "ૈ"],
  o: ["ઓ", "ો"], O: ["ઓ", "ો"],
  au: ["ઔ", "ૌ"],
  Ru: ["ઋ", "ૃ"], RRi: ["ઋ", "ૃ"],
};

const MARKS: Record<string, string> = {
  M: "ં", H: "ઃ", "~": "ઁ", ".N": "ઁ",
};

const HALANT = "્";

/** Longest keys first, so "chh" wins over "ch" and "c". */
const KEYS = [
  ...Object.keys(CONSONANTS).map((key) => [key, "consonant"] as const),
  ...Object.keys(VOWELS).map((key) => [key, "vowel"] as const),
  ...Object.keys(MARKS).map((key) => [key, "mark"] as const),
].sort((a, b) => b[0].length - a[0].length);

function tokenise(latin: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < latin.length) {
    const match = KEYS.find(([key]) => latin.startsWith(key, at));
    if (!match) {
      tokens.push({ kind: "literal", text: latin[at]! });
      at += 1;
      continue;
    }
    const [key, kind] = match;
    if (kind === "consonant") tokens.push({ kind, text: CONSONANTS[key]! });
    else if (kind === "vowel") tokens.push({ kind, independent: VOWELS[key]![0], sign: VOWELS[key]![1] });
    else tokens.push({ kind, text: MARKS[key]! });
    at += key.length;
  }
  return tokens;
}

/** The Gujarati for one word's worth of English letters. */
export function toGujarati(latin: string): string {
  let out = "";
  let afterConsonant = false;
  for (const token of tokenise(latin)) {
    switch (token.kind) {
      case "consonant":
        // Two consonants in a row join: ગ + ્ + ર.
        out += (afterConsonant ? HALANT : "") + token.text;
        afterConsonant = true;
        break;
      case "vowel":
        out += afterConsonant ? token.sign : token.independent;
        afterConsonant = false;
        break;
      default:
        out += token.text;
        afterConsonant = false;
    }
  }
  return out;
}

/** The letters that take part in a word; anything else ends it. */
export function isPhoneticKey(key: string): boolean {
  return /^[A-Za-z~]$/.test(key);
}

/** The key table the help shows: [what to type, what it gives]. */
export const PHONETIC_HELP: [string, string][] = [
  ["a aa/A i ii/ee u uu/oo", "અ આ ઇ ઈ ઉ ઊ"],
  ["e ai o au Ru", "એ ઐ ઓ ઔ ઋ"],
  ["k kh g gh", "ક ખ ગ ઘ"],
  ["ch chh j jh/z", "ચ છ જ ઝ"],
  ["T Th D Dh N", "ટ ઠ ડ ઢ ણ"],
  ["t th d dh n", "ત થ દ ધ ન"],
  ["p ph/f b bh m", "પ ફ બ ભ મ"],
  ["y r l L v/w", "ય ર લ ળ વ"],
  ["sh/S Sh s h", "શ ષ સ હ"],
  ["x/ksh GY/jny", "ક્ષ જ્ઞ"],
  ["M H", "ં ઃ"],
  ["kaa ki kee ku koo", "કા કિ કી કુ કૂ"],
  ["shaaLaa grAnT kharcha", "શાળા ગ્રાન્ટ ખર્ચ"],
];
