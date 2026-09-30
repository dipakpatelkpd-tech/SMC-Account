import { describe, expect, it } from "vitest";
import { isPhoneticKey, toGujarati } from "../src/renderer/phonetic/transliterate.js";

describe("phonetic Gujarati", () => {
  it("writes the words the books use", () => {
    expect(toGujarati("shaaLaa")).toBe("શાળા");
    expect(toGujarati("grAnT")).toBe("ગ્રાન્ટ");
    expect(toGujarati("kharcha")).toBe("ખર્ચ");
    expect(toGujarati("kharchanaa")).toBe("ખર્ચના");
    expect(toGujarati("chukavyaa")).toBe("ચુકવ્યા");
    expect(toGujarati("mujab")).toBe("મુજબ");
    expect(toGujarati("vaalii")).toBe("વાલી");
    expect(toGujarati("saMmelan")).toBe("સંમેલન");
    expect(toGujarati("sarabharaa")).toBe("સરભરા");
    expect(toGujarati("shrii")).toBe("શ્રી");
    expect(toGujarati("prajnyaa")).toBe("પ્રજ્ઞા");
    expect(toGujarati("svachchhataa")).toBe("સ્વચ્છતા");
    expect(toGujarati("pravesotsav")).toBe("પ્રવેસોત્સવ");
    expect(toGujarati("rojameL")).toBe("રોજમેળ");
    expect(toGujarati("kRu")).toBe("કૃ");
  });

  it("writes vowels on their own at the start of a word", () => {
    expect(toGujarati("aavak")).toBe("આવક");
    expect(toGujarati("ughaDatii")).toBe("ઉઘડતી");
    expect(toGujarati("ekam")).toBe("એકમ");
  });

  it("changes as more letters come: k, kh, khaa", () => {
    expect(toGujarati("k")).toBe("ક");
    expect(toGujarati("kh")).toBe("ખ");
    expect(toGujarati("khaa")).toBe("ખા");
  });

  it("leaves what it does not know as typed", () => {
    expect(toGujarati("q")).toBe("q");
  });

  it("takes letters only; digits and punctuation end a word", () => {
    expect(isPhoneticKey("a")).toBe(true);
    expect(isPhoneticKey("Sh")).toBe(false);
    expect(isPhoneticKey("5")).toBe(false);
    expect(isPhoneticKey(" ")).toBe(false);
    expect(isPhoneticKey("/")).toBe(false);
  });
});
