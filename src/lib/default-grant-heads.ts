/**
 * The grant heads a new school starts with (SPEC §3).
 *
 * These are the heads the sample school used in 2025-26. They are a STARTING
 * POINT, not a fixed list: the state changes which grants exist from year to
 * year, so the setup screen lets them be renamed, removed and added to, and the
 * masters screen can change them later. Nothing in the engine or the reports
 * hard-codes any of these codes - the one exception is INTEREST, which reads
 * differently on the forms because the bank credits it rather than the state
 * granting it.
 */
export interface DefaultGrantHead {
  code: string;
  nameGu: string;
  reportOrder: number;
}

export const DEFAULT_GRANT_HEADS: DefaultGrantHead[] = [
  { code: "INTEREST", nameGu: "વ્યાજ/વટાવ", reportOrder: 1 },
  { code: "SWACHHATA", nameGu: "શાળા સ્વચ્છતા ગ્રાન્ટ", reportOrder: 2 },
  { code: "VALI_SAMMELAN", nameGu: "વાલીસંમેલન ગ્રાન્ટ", reportOrder: 3 },
  { code: "BALMELO", nameGu: "બાળમેળો ગ્રાન્ટ", reportOrder: 4 },
  { code: "INTERNET", nameGu: "ઈન્ટરનેટ ગ્રાન્ટ", reportOrder: 5 },
  { code: "PRAGNA", nameGu: "પ્રજ્ઞા ગ્રાન્ટ", reportOrder: 6 },
  { code: "FIRST_AID", nameGu: "ફસ્ટ એઈડ બોક્સ ગ્રાન્ટ", reportOrder: 7 },
  { code: "PRAVESHOTSAV", nameGu: "પ્રવેશોત્સવ ગ્રાન્ટ", reportOrder: 8 },
  { code: "CIVIL", nameGu: "સિવિલ ગ્રાન્ટ", reportOrder: 9 },
];

/**
 * The two programme lines printed at the top of both annexures.
 *
 * The district is filled in from what the school enters, because these lines
 * name it: "સમગ્ર શિક્ષા ખેડા – SMCE".
 */
export function defaultProgrammeLines(districtGu: string): string {
  return `સમગ્ર શિક્ષા ${districtGu} – SMCE / સર્વ શિક્ષા અભિયાન – ${districtGu}`;
}

/**
 * A code for a head the user adds by name.
 *
 * Codes are ASCII so they stay usable as map keys and in test expectations,
 * while the Gujarati name is what every report prints.
 */
export function codeForNewHead(existingCodes: readonly string[]): string {
  let index = 1;
  for (;;) {
    const candidate = `CUSTOM_${index}`;
    if (!existingCodes.includes(candidate)) return candidate;
    index += 1;
  }
}
