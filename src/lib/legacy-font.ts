/**
 * Legacy-font Gujarati (LMG-Arun / Terafont-Varun) to Unicode.
 *
 * The client's workbook does not contain Gujarati at all: it contains ASCII bytes
 * that happen to look like Gujarati when the LMG-Arun font draws them. "TFZLB" is
 * the word તારીખ. Nothing can be imported from that workbook until those bytes
 * are turned into real characters.
 *
 * This is a port of tools/lmg_arun_to_unicode.py, which was derived from the
 * sample workbook. It is a port rather than a call into Python on purpose: the
 * app is a single installer on a school's Windows machine, and requiring a Python
 * install to read an Excel file would mean it never gets used. The two must agree,
 * so the test suite checks this against the same strings.
 *
 * Three things make the mapping more than a lookup table:
 *
 *  - **The ી-matra is typed BEFORE its consonant** in the legacy font and belongs
 *    after it, so it is held back and emitted once the consonant lands.
 *  - **The reph (ર્) is typed AFTER the syllable** it is pronounced before, so it
 *    is inserted at the start of the cluster - this is what makes ખર્ચ come out
 *    right instead of ખચર્.
 *  - **The letters ર and પ double as the digits ૨ and ૫** in the font, because they
 *    look alike, so they are corrected inside runs of digits only.
 *
 * It is best effort, as the original says. Rare glyphs may be wrong, and the
 * importer therefore shows every converted string for review rather than writing
 * it silently.
 */

/** ASCII byte to Unicode Gujarati, as the legacy font draws it. */
const MAP: Record<string, string> = {
  // independent vowels
  V: "અ", p: "ઉ", ">": "ઈ",
  // consonants
  S: "ક", B: "ખ", U: "ગ", "3": "ઘ", R: "ચ", K: "છ", H: "જ", h: "ઝ",
  "8": "ટ", "9": "ઠ", "0": "ડ", "(": "ઢ", "6": "ણ", T: "ત", Y: "થ", N: "દ", W: "ધ",
  G: "ન", "5": "પ", O: "ફ", A: "બ", E: "ભ", D: "મ", I: "ય", Z: "ર", ",": "લ",
  "/": "ળ", J: "વ", X: "શ", "Ø": "ષ", ";": "સ", C: "હ",
  // ligatures and half forms
  z: "શ્ર", "7": "જ્ઞ", "Ù": "ક્ષ", "Ì": "ક્ર", "Ê": "ક્ર", "£": "દ્વ", "+": "ત્ર", "~": "રૂ",
  g: "ન્", j: "વ્", e: "ભ્", t: "ત્", r: "ચ્", ":": "સ્", n: "દ્ય", d: "મ્",
  b: "ખ્", y: "થ્", "<": "લ્", "?": "ળ્", Q: "ષ્", "1": "ક્ષ્",
  // dependent vowel signs and marks
  F: "ા", L: "ી", "]": "ુ", "}": "ૂ", "[": "ે", "{": "ૈ", M: "ો", "\\": "ં", k: "ૃ",
  "|": "્ર", "=": "્ર",
  // punctuation as used in the sample
  P: ".", q: "/", v: "–", o: ":", s: "(", f: ")", "4": ",",
  // digits
  _: "૦", "!": "૧", "@": "૨", "#": "૩", $: "૪", "%": "૫", "&": "૬", "*": "૭", ")": "૯",
};

/** Latin words typed inside legacy-font cells. They are already Latin. */
const KEEP_LATIN = ["SMCE", "SMC", "BOB", "SSA", "TO", "BM", "CRC", "BRC", "DISE"];

/** અ + matra is how the font writes આ, એ and the rest. */
const FIX_VOWELS: [string, string][] = [
  ["અા", "આ"],
  ["અે", "એ"],
  ["અૈ", "ઐ"],
  ["અો", "ઓ"],
  ["આૈ", "ઔ"],
];

const GUJARATI_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
/** Typed before the consonant, pronounced after it. */
const I_MATRA = "l";
/** Typed after the syllable, pronounced before it. */
const REPH = '"';
const POST_BASE = new Set(["|", "="]);
const SIGNS = new Set([..."ાીુૂેૈોૌંૃિ"]);

/** Where the last consonant cluster (with its signs) begins, for the reph. */
function syllableStart(out: string[]): number {
  let index = out.length - 1;
  while (index >= 0 && out[index] !== undefined && SIGNS.has(out[index]!)) index -= 1;
  while (index > 0 && out[index - 1]!.endsWith("્")) index -= 1;
  while (index >= 0 && out[index] === "્ર") index -= 1;
  return Math.max(index, 0);
}

/**
 * ર and પ stand in for the digits ૨ and ૫ in this font. Corrected only inside a
 * run that already holds Gujarati digits, so the words રૂ and પ are left alone.
 */
function fixDigits(text: string): string {
  const pattern = new RegExp(
    `(?<![\\u0A80-\\u0AFF])[${GUJARATI_DIGITS}રપ]{2,}(?![\\u0ABE-\\u0ACD\\u0A81-\\u0A83])`,
    "gu",
  );
  return text.replace(pattern, (run) => {
    if (![...run].some((character) => GUJARATI_DIGITS.includes(character))) return run;
    return run.replaceAll("ર", "૨").replaceAll("પ", "૫");
  });
}

function convertRun(text: string): string {
  const out: string[] = [];
  const characters = [...text];
  let pendingI = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;

    if (character === I_MATRA) {
      pendingI = true;
      continue;
    }

    if (character === REPH) {
      out.splice(syllableStart(out), 0, "ર્");
      continue;
    }

    const mapped = MAP[character] ?? character;
    out.push(mapped);

    if (pendingI && character !== " " && !mapped.endsWith("્")) {
      const next = characters[index + 1] ?? "";
      if (!POST_BASE.has(next)) {
        out.push("િ");
        pendingI = false;
      }
    }
  }

  return out.join("");
}

/**
 * One legacy-font string as Unicode Gujarati.
 *
 * A string that is already Unicode, or plain Latin, comes back unchanged in
 * practice: the mapping only touches the ASCII the font used.
 */
export function legacyToUnicode(text: string): string {
  const keep = new Set(KEEP_LATIN);
  const pattern = new RegExp(
    `(\\b(?:${[...KEEP_LATIN].sort((a, b) => b.length - a.length).join("|")})\\b)`,
    "g",
  );

  let result = text
    .split(pattern)
    .map((part) => (keep.has(part) ? part : convertRun(part)))
    .join("");

  for (const [from, to] of FIX_VOWELS) result = result.replaceAll(from, to);
  return fixDigits(result);
}

/**
 * Whether a font name is one this converter understands.
 *
 * The workbook mixes three: LMG-Arun (converted here), and the Guj_*_SULEKH
 * family, which uses a DIFFERENT encoding this mapping would turn into nonsense.
 * Numbers and dates are in the SULEKH cells, which is why they come through
 * without conversion; only the text needs this.
 */
export function isLegacyFont(fontName: string | undefined): boolean {
  if (!fontName) return false;
  return /^(LMG-|Terafont)/i.test(fontName);
}

/** True when a font is one of the ones we deliberately do NOT convert. */
export function isUnsupportedLegacyFont(fontName: string | undefined): boolean {
  if (!fontName) return false;
  return /SULEKH/i.test(fontName);
}
