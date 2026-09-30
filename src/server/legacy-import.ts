/**
 * Reading the school's old Excel workbook.
 *
 * What this is for: a school that has been keeping these books in the LMG-Arun
 * workbook for years should not have to retype a year to start using this app.
 * SPEC 11.9 asked whether previous years should be importable; the answer was yes.
 *
 * What it is NOT: a trusted source. The client's own workbook is almost entirely
 * hand-typed, and SPEC section 9 lists ten errors in it, several of which are
 * unfixable from the file alone:
 *
 *  - Excel turned bill number 1/2 into 2 January. The number is recovered from
 *    the date it became (month/day), and every recovered one is flagged.
 *  - Dates are stored as text, as real dates, and with day and month swapped -
 *    sometimes in the same column. A date that lands outside the financial year
 *    is retried with day and month exchanged, and flagged either way.
 *  - Grant head names are legacy-font bytes that have to be converted and then
 *    matched against the heads this school actually has.
 *
 * So this produces a PLAN, not a write: every row it read, every guess it made,
 * and every name it could not match. Nothing reaches the database until someone
 * who knows the year has looked at it. That is the only honest way to import a
 * file like this - a silent importer would launder the old file's errors into the
 * new system and they would never be found again.
 *
 * No Electron here: this takes a file path and returns data.
 */
import ExcelJS from "exceljs";
import { isLegacyFont, legacyToUnicode } from "../lib/legacy-font.js";
import { rupeesToPaise } from "../lib/money.js";
import type { Issue } from "../engine/validation.js";
import type { ChequeType } from "../lib/types.js";
import type {
  LegacyBillRow,
  LegacyChequeRow,
  LegacyImportPlan,
  LegacyReceiptRow,
} from "../shared/legacy.js";

/** A sheet name, as the client's workbook spells it, and what it holds. */
const SHEETS = {
  grantRegister: "GRANTA RAJISTAR",
  billRegister: "BIL RAJISTAR",
  chequeRegister: "CHEK RAJISTAR",
} as const;

function warning(code: string, messageGu: string, detail: string): Issue {
  return { severity: "warning", code, messageGu, messageEn: detail, detail };
}

// -------------------------------------------------------------- cell reading

/** A cell's text, converted when - and only when - its font says it is legacy. */
function text(cell: ExcelJS.Cell): string {
  const value = cell.value;
  let raw: string;

  if (value === null || value === undefined) return "";
  if (typeof value === "string") raw = value;
  else if (typeof value === "number") return String(value);
  else if (value instanceof Date) return value.toISOString().slice(0, 10);
  else if (typeof value === "object" && "richText" in value) {
    // Rich text can mix fonts per run, so each run is judged on its own - and a
    // run with no font of its own inherits the cell's. That fallback is not a
    // nicety: the interest head's cell is exactly this, and without it half the
    // word comes through as the raw bytes "jIFH".
    return value.richText
      .map((run) => {
        const font = run.font?.name ?? cell.font?.name;
        return isLegacyFont(font) ? legacyToUnicode(run.text) : run.text;
      })
      .join("")
      .trim();
  } else if (typeof value === "object" && "result" in value) {
    raw = String(value.result ?? "");
  } else if (typeof value === "object" && "text" in value) {
    raw = String(value.text);
  } else raw = String(value);

  const converted = isLegacyFont(cell.font?.name) ? legacyToUnicode(raw) : raw;
  return converted.trim();
}

function numberOf(cell: ExcelJS.Cell): number | null {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    if (typeof result === "number") return result;
  }
  const parsed = Number(String(value ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(parsed) && String(value ?? "").trim() !== "" ? parsed : null;
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * A date out of a cell that may hold a real date, a DD/MM/YYYY string, or a
 * date Excel built out of something that was never a date.
 *
 * When the reading falls outside the financial year, day and month are exchanged
 * and that is used if it lands inside - which is the day/month swap of SPEC 9.7.
 * Either way the note says what happened, because a date is the one field a
 * reviewer cannot re-derive from anything else.
 */
function readDate(
  cell: ExcelJS.Cell,
  range: { startDate: string; endDate: string },
  notes: string[],
  label: string,
): string | null {
  const value = cell.value;
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  if (value instanceof Date) {
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else {
    const asText = String(
      value && typeof value === "object" && "result" in value
        ? ((value as { result?: unknown }).result ?? "")
        : (value ?? ""),
    ).trim();
    const slashes = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(asText);
    const isoText = /^(\d{4})-(\d{2})-(\d{2})/.exec(asText);
    if (slashes) {
      day = Number(slashes[1]);
      month = Number(slashes[2]);
      year = Number(slashes[3]);
    } else if (isoText) {
      year = Number(isoText[1]);
      month = Number(isoText[2]);
      day = Number(isoText[3]);
    }
  }

  if (year === null || month === null || day === null) {
    if (String(value ?? "").trim() !== "") {
      notes.push(`${label}: તારીખ વાંચી શકાઈ નહીં`);
    }
    return null;
  }

  const asRead = iso(year, month, day);
  const inRange = (candidate: string): boolean =>
    isRealDate(candidate) && candidate >= range.startDate && candidate <= range.endDate;

  if (inRange(asRead)) return asRead;

  const swapped = iso(year, day, month);
  if (inRange(swapped)) {
    notes.push(`${label}: તારીખ ${asRead} ને બદલે ${swapped} લીધી (દિવસ/મહિનો બદલાયેલ) – તપાસો`);
    return swapped;
  }

  notes.push(`${label}: તારીખ ${asRead} આ વર્ષની બહાર છે – તપાસો`);
  return isRealDate(asRead) ? asRead : null;
}

/**
 * A bill number that Excel may have eaten.
 *
 * "1/2" became 2 January, so a date in this column is turned back into
 * month/day - which is the voucher/serial it was typed as. A real string is kept
 * exactly as it is, because that is what SPEC insists on: bill numbers are text.
 */
function readBillNo(cell: ExcelJS.Cell, notes: string[]): string | null {
  const value = cell.value;

  if (value instanceof Date) {
    const recovered = `${value.getUTCMonth() + 1}/${value.getUTCDate()}`;
    notes.push(`બીલ નંબર તારીખ બની ગયો હતો; ${recovered} તરીકે વાંચ્યો – તપાસો`);
    return recovered;
  }

  const asText = text(cell);
  if (asText === "") return null;

  // A date Excel wrote as text, e.g. "2025-01-02" - same recovery.
  const isoText = /^(\d{4})-(\d{2})-(\d{2})/.exec(asText);
  if (isoText) {
    const recovered = `${Number(isoText[2])}/${Number(isoText[3])}`;
    notes.push(`બીલ નંબર તારીખ બની ગયો હતો; ${recovered} તરીકે વાંચ્યો – તપાસો`);
    return recovered;
  }

  return asText;
}

// ------------------------------------------------------------------- sheets

/**
 * Read the grant register: one receipt per row.
 *
 * The client's sheet prints every receipt TWICE, as a pair of rows with the same
 * figures, so consecutive duplicates are collapsed. Dropping the second of an
 * identical pair is safe here in a way it would not be in general: two genuinely
 * identical receipts on the same date for the same head would be entered as one
 * amount, and the reviewer sees the row count before anything is written.
 */
function readGrantRegister(
  sheet: ExcelJS.Worksheet,
  range: { startDate: string; endDate: string },
): LegacyReceiptRow[] {
  const rows: LegacyReceiptRow[] = [];

  for (let rowNo = 6; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    const amount = numberOf(row.getCell("E"));
    const headNameGu = text(row.getCell("F"));
    if (amount === null || amount === 0 || headNameGu === "") continue;

    const notes: string[] = [];
    const candidate: LegacyReceiptRow = {
      sourceRow: rowNo,
      date: readDate(row.getCell("D"), range, notes, "આવક તારીખ"),
      headNameGu,
      amountPaise: rupeesToPaise(amount),
      receivedFromGu: text(row.getCell("C")),
      allotmentOrderNo: text(row.getCell("G")) || null,
      bankLabelGu: text(row.getCell("H")),
      notes,
    };

    const previous = rows[rows.length - 1];
    const duplicate =
      previous !== undefined &&
      previous.date === candidate.date &&
      previous.headNameGu === candidate.headNameGu &&
      previous.amountPaise === candidate.amountPaise &&
      previous.sourceRow === rowNo - 1;
    if (duplicate) continue;

    rows.push(candidate);
  }

  return rows;
}

/**
 * Read the bill register.
 *
 * The voucher number prints only on a voucher's first row, exactly as the form
 * does, so it is carried down - and a bill before any voucher number has been
 * seen is left without one rather than guessed at.
 */
function readBillRegister(
  sheet: ExcelJS.Worksheet,
  range: { startDate: string; endDate: string },
): LegacyBillRow[] {
  const rows: LegacyBillRow[] = [];
  let voucherNo: number | null = null;

  for (let rowNo = 7; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    const amount = numberOf(row.getCell("H"));
    const descriptionGu = text(row.getCell("F"));
    if (amount === null || amount === 0 || descriptionGu === "") continue;

    const notes: string[] = [];
    const onThisRow = numberOf(row.getCell("C"));
    if (onThisRow !== null) voucherNo = onThisRow;
    if (voucherNo === null) notes.push("વાઉચર નંબર મળ્યો નહીં");

    rows.push({
      sourceRow: rowNo,
      voucherNo,
      billNo: readBillNo(row.getCell("D"), notes),
      billDate: readDate(row.getCell("E"), range, notes, "બીલ તારીખ"),
      descriptionGu,
      suggestedHeadName: null,
      vendorGu: text(row.getCell("G")),
      amountPaise: rupeesToPaise(amount),
      deductionPaise: rupeesToPaise(numberOf(row.getCell("I")) ?? 0),
      quantityGu: text(row.getCell("M")) || null,
      notes,
    });
  }

  return rows;
}

/** Read the cheque register. */
function readChequeRegister(
  sheet: ExcelJS.Worksheet,
  range: { startDate: string; endDate: string },
): LegacyChequeRow[] {
  const rows: LegacyChequeRow[] = [];

  for (let rowNo = 5; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    const chequeNo = numberOf(row.getCell("C"));
    const amount = numberOf(row.getCell("G"));
    if (chequeNo === null || amount === null || amount === 0) continue;

    const notes: string[] = [];
    // The bill-range column is another victim of Excel's date conversion:
    // "3/1" became 1 March.
    const billRangeText = readBillNo(row.getCell("F"), notes) ?? "";

    rows.push({
      sourceRow: rowNo,
      chequeNo,
      chequeDate: readDate(row.getCell("D"), range, notes, "ચેક તારીખ"),
      voucherNo: numberOf(row.getCell("E")),
      billRangeText,
      amountPaise: rupeesToPaise(amount),
      payeeGu: text(row.getCell("H")),
      purposeGu: text(row.getCell("J")),
      suggestedType: "DIRECT",
      suggestedHeadName: null,
      cashedDate: readDate(row.getCell("L"), range, notes, "વટાવ્યા તારીખ"),
      notes,
    });
  }

  return rows;
}

// --------------------------------------------------------------- the reading

/**
 * Read a legacy workbook into a plan.
 *
 * `range` is the financial year the plan will be imported into: it is what makes
 * a mangled date detectable at all.
 */
export async function readLegacyWorkbook(
  filePath: string,
  year: { label: string; startDate: string; endDate: string },
): Promise<LegacyImportPlan> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const issues: Issue[] = [];
  const plan: LegacyImportPlan = {
    filePath,
    yearLabel: year.label,
    receipts: [],
    bills: [],
    cheques: [],
    headNames: [],
    issues,
  };

  const find = (name: string): ExcelJS.Worksheet | null => {
    const found = workbook.worksheets.find(
      (sheet) => sheet.name.trim().toUpperCase() === name.toUpperCase(),
    );
    if (!found) {
      issues.push(
        warning(
          "sheet_missing",
          `“${name}” શીટ આ ફાઈલમાં મળી નહીં.`,
          `the workbook has no sheet named ${name}`,
        ),
      );
      return null;
    }
    return found;
  };

  const grantRegister = find(SHEETS.grantRegister);
  const billRegister = find(SHEETS.billRegister);
  const chequeRegister = find(SHEETS.chequeRegister);

  if (grantRegister) plan.receipts = readGrantRegister(grantRegister, year);
  if (billRegister) plan.bills = readBillRegister(billRegister, year);
  if (chequeRegister) plan.cheques = readChequeRegister(chequeRegister, year);

  plan.headNames = [...new Set(plan.receipts.map((receipt) => receipt.headNameGu))];

  // Only now are the head names known, so the guesses that depend on them are
  // filled in as a second pass.
  for (const bill of plan.bills) {
    bill.suggestedHeadName = suggestHead(bill.descriptionGu, plan.headNames);
    if (bill.suggestedHeadName === null) bill.notes.push("ગ્રાન્ટ હેડ નક્કી થઈ શક્યું નહીં – પસંદ કરો");
  }
  for (const cheque of plan.cheques) {
    cheque.suggestedType = guessChequeType(cheque);
    if (cheque.suggestedType === "GRANT_RETURN") {
      cheque.suggestedHeadName = suggestHead(cheque.purposeGu, plan.headNames);
    }
  }

  if (plan.receipts.length === 0 && plan.bills.length === 0 && plan.cheques.length === 0) {
    issues.push(
      warning(
        "nothing_found",
        "આ ફાઈલમાંથી કંઈ વાંચી શકાયું નહીં. શીટના નામ અને કોલમ તપાસો.",
        "no rows could be read from this workbook",
      ),
    );
  }

  // The file's own year, when it can be told, so importing 2024-25 into 2025-26
  // is at least visible.
  const rowsWithDates = [
    ...plan.receipts.map((receipt) => receipt.date),
    ...plan.bills.map((bill) => bill.billDate),
  ].filter((date): date is string => date !== null);
  const outside = rowsWithDates.filter(
    (date) => date < year.startDate || date > year.endDate,
  ).length;
  if (outside > 0) {
    issues.push(
      warning(
        "dates_outside_year",
        `${outside} તારીખ ${year.label} ની બહાર છે. શું આ ફાઈલ બીજા વર્ષની છે?`,
        `${outside} dates fall outside ${year.label}`,
      ),
    );
  }

  return plan;
}

/** Words that appear in every head name and so distinguish nothing. */
const EMPTY_WORDS = new Set(["ગ્રાન્ટ", "જમા", "જમાં", "ખર્ચ", "ખર્ચે"]);

/**
 * Which head a free-text description is about, or null when nothing says.
 *
 * Matched on the head name's own distinctive words, longest first: the bill
 * "શાળા સ્વચ્છતા મટીરીયલ્સ અને સફાઈકામ" names સ્વચ્છતા, and that is the whole
 * signal there is. It is a suggestion - see LegacyBillRow.suggestedHeadName.
 */
export function suggestHead(description: string, headNames: readonly string[]): string | null {
  const haystack = description.replace(/\s+/g, "");
  let best: { name: string; score: number } | null = null;

  for (const name of headNames) {
    let score = 0;
    for (const word of name.split(/\s+/)) {
      if (word.length < 3 || EMPTY_WORDS.has(word)) continue;
      if (haystack.includes(word)) score += word.length;
    }
    if (score > 0 && (best === null || score > best.score)) best = { name, score };
  }

  return best?.name ?? null;
}

/**
 * Which kind of cheque this row is.
 *
 * The old register does not say, but it does not have to: money sent back to the
 * CRC says પરત in its purpose, and a cheque written to the member secretary is a
 * reimbursement of bills he has already paid. Anything else went straight to a
 * supplier.
 */
export function guessChequeType(cheque: {
  payeeGu: string;
  purposeGu: string;
}): ChequeType {
  if (/પરત/.test(cheque.purposeGu)) return "GRANT_RETURN";
  if (/સભ્ય\s*સચિવ|મુખ્ય\s*શિક્ષક/.test(cheque.payeeGu)) return "REIMBURSEMENT";
  return "DIRECT";
}

/**
 * Match the file's head names against the heads this school has.
 *
 * Matching is on the letters alone - spacing and the odd "જમાં" tacked onto the
 * end are how the same head appears differently in the same file. Anything that
 * does not match is returned for the reviewer to map by hand; nothing is created
 * behind their back, because a second "શાળા સ્વચ્છતા ગ્રાન્ટ" with a stray space
 * would split a grant head in two for the rest of the school's life.
 */
export function matchHeadNames(
  fileNames: readonly string[],
  heads: readonly { id: number; nameGu: string }[],
): { fileName: string; grantHeadId: number | null }[] {
  const normalise = (name: string): string => name.replace(/\s+/g, "");
  const byName = new Map(heads.map((head) => [normalise(head.nameGu), head.id]));

  return fileNames.map((fileName) => {
    const key = normalise(fileName);
    const exact = byName.get(key);
    if (exact !== undefined) return { fileName, grantHeadId: exact };

    // One contained in the other: "સિવિલ ગ્રાન્ટ જમાં" against "સિવિલ ગ્રાન્ટ".
    for (const [headKey, id] of byName) {
      if (key.includes(headKey) || headKey.includes(key)) return { fileName, grantHeadId: id };
    }
    return { fileName, grantHeadId: null };
  });
}
