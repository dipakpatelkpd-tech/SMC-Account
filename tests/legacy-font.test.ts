/**
 * The legacy-font converter, checked against the Python tool it was ported from.
 *
 * The expectations are the Python script's own output for strings taken straight
 * out of the client's workbook. If the two ever disagree, one of them is wrong and
 * a school's imported grant head is misspelt on a statutory form.
 */
import { describe, expect, it } from "vitest";
import { isLegacyFont, isUnsupportedLegacyFont, legacyToUnicode } from "../src/lib/legacy-font.js";

describe("legacyToUnicode", () => {
  it.each([
    ["TFZLB", "તારીખ"],
    ["XF/F :JrKTF U|Fg8", "શાળા સ્વચ્છતા ગ્રાન્ટ"],
    ["5|J[XMt;J U|Fg8", "પ્રવેશોત્સવ ગ્રાન્ટ"],
    ["O:8 V[>0 AMS; U|Fg8", "ફસ્ટ એઈડ બોકસ ગ્રાન્ટ"],
    ["AF/D[/M U|Fg8", "બાળમેળો ગ્રાન્ટ"],
    [" 5|7F U|Fg8 ", " પ્રજ્ઞા ગ્રાન્ટ "],
    ["jIFH HDF", "વ્યાજ જમા"],
    ["ART U|Fg8 5ZT", "બચત ગ્રાન્ટ પરત"],
    ["zL lJnFYL 8=[0;\"", "શ્રી વિદ્યાથી ટ્રેડર્સ"],
    [";eI ;lRJ lN5SS]DFZPJLP58[,", "સભ્ય સચિવ દિપકકુમાર.વી.પટેલ"],
  ])("converts %s", (legacy, unicode) => {
    expect(legacyToUnicode(legacy)).toBe(unicode);
  });

  it("keeps the Latin words that were typed inside legacy cells", () => {
    expect(legacyToUnicode("SMCE A[8FJF0FGF D]JF0FP5|FPXF/F")).toBe(
      "SMCE બેટાવાડાના મુવાડા.પ્રા.શાળા",
    );
  });

  it("puts the reph before the syllable it is typed after", () => {
    // The whole reason ખર્ચ does not come out as ખચર્.
    expect(legacyToUnicode('BR"')).toBe("ખર્ચ");
    // With the ે-matra typed after it, as the register's ખર્ચે heading has it.
    expect(legacyToUnicode('BR["')).toBe("ખર્ચે");
  });

  it("must only be given legacy-font cells", () => {
    // Plain ASCII digits are meaningful bytes to this font, so "2025-26" comes
    // back as Gujarati letters. That is correct for a legacy cell and wrong for
    // any other, which is why the importer converts a cell only when its FONT
    // says to - see isLegacyFont.
    expect(legacyToUnicode("2025-26")).toBe("2ડ2પ-2ણ");
  });
});

describe("font recognition", () => {
  it("knows which fonts it can convert", () => {
    expect(isLegacyFont("LMG-Arun")).toBe(true);
    expect(isLegacyFont("Calibri")).toBe(false);
    expect(isLegacyFont(undefined)).toBe(false);
  });

  it("knows the encoding it must refuse", () => {
    // A different legacy encoding; converting it with this map would be nonsense.
    expect(isUnsupportedLegacyFont("Guj_Regular_Bold_SULEKH")).toBe(true);
    expect(isUnsupportedLegacyFont("LMG-Arun")).toBe(false);
  });
});
