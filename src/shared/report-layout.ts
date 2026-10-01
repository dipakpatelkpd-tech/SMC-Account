/**
 * A school's own layout for a printed report: column widths, fonts, spacing and
 * highlighted cells.
 *
 * The forms have a default layout (the client's own, see docs/DECISIONS.md,
 * "Report font size"); a school may adjust it on the Reports screen. What it
 * changes is stored per school and per report in the books (`ReportLayout`), so
 * it travels on the pen drive and every PC prints that school's forms the same.
 *
 * Only presentation lives here - never a figure. A layout cannot add, hide or
 * change a number; it can only say how wide, how large, how spaced and what
 * colour. The same layout drives three things, which is why this file is shared:
 *
 *   - the preview and the PDF (PrintRoot turns it into a stylesheet);
 *   - the Excel export (src/server/excel.ts maps it onto its own columns);
 *   - the editor on the Reports screen.
 *
 * Cells are addressed by a COLUMN id (fixed per form, `REPORT_COLUMNS`) and a
 * ROW key (made from what the row is about - a cheque number, a receipt id - so
 * a highlight stays on "cheque 1234" when an earlier cheque is added). A
 * highlight whose row no longer exists is simply not shown. The headings above
 * a table - the title, the rojmel's Cash Book band, an annexure's banner - are
 * PARTS (`REPORT_PARTS`), styled the same way.
 */
import { z } from "zod";
import type { PrintableReportId } from "./api.js";

// ------------------------------------------------------------------- fonts

/**
 * The fonts a report can use - all Unicode Gujarati, so conjuncts shape
 * correctly in the preview, the PDF and the print (CLAUDE.md). The legacy
 * typing fonts (LMG-Arun, Terafont, Shree-Guj and the like) are not here: they
 * draw Gujarati letters in place of Latin ones, and the books hold real
 * Gujarati text.
 *
 * Bundled with the app (SIL Open Font License, via @fontsource) rather than
 * taken from the PC, for the reason the default one is: a PC without the font
 * would fall back to another with other widths, and the forms are paged by the
 * width of their text. The two `system` faces are Windows' own Gujarati fonts,
 * on every Windows 10 and 11 PC but not bundled.
 *
 * `recommended`: the five that read best on a printed register, in the PDF
 * and in Excel - plain text faces with a full set of conjuncts and clear
 * digits. The others are display faces, best for a title or a heading.
 * The editor shows the five first, the rest below them as a gallery.
 */
export const LAYOUT_FONTS = [
  { id: "noto-sans", family: "Noto Sans Gujarati", label: "Noto Sans Gujarati", recommended: true },
  { id: "hind-vadodara", family: "Hind Vadodara", label: "Hind Vadodara", recommended: true },
  { id: "noto-serif", family: "Noto Serif Gujarati", label: "Noto Serif Gujarati", recommended: true },
  { id: "mukta-vaani", family: "Mukta Vaani", label: "Mukta Vaani", recommended: true },
  { id: "anek", family: "Anek Gujarati", label: "Anek Gujarati", recommended: true },
  { id: "baloo-bhai", family: "Baloo Bhai 2", label: "Baloo Bhai 2" },
  { id: "rasa", family: "Rasa", label: "Rasa" },
  { id: "mogra", family: "Mogra", label: "Mogra" },
  { id: "farsan", family: "Farsan", label: "Farsan" },
  { id: "kumar-one", family: "Kumar One", label: "Kumar One" },
  { id: "kumar-one-outline", family: "Kumar One Outline", label: "Kumar One Outline" },
  { id: "shrikhand", family: "Shrikhand", label: "Shrikhand" },
  { id: "shruti", family: "Shruti", label: "Shruti (Windows)", system: true },
  { id: "nirmala", family: "Nirmala UI", label: "Nirmala UI (Windows)", system: true },
] as const satisfies readonly {
  id: string;
  family: string;
  label: string;
  recommended?: boolean;
  system?: boolean;
}[];

export type LayoutFontId = (typeof LAYOUT_FONTS)[number]["id"];
const FONT_IDS = LAYOUT_FONTS.map((font) => font.id) as [LayoutFontId, ...LayoutFontId[]];

export const DEFAULT_FONT: LayoutFontId = "noto-sans";

export function fontFamily(id: LayoutFontId | undefined): string {
  return (LAYOUT_FONTS.find((font) => font.id === id) ?? LAYOUT_FONTS[0]).family;
}

// ------------------------------------------------------------------ schema

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** "none" makes a cell blank even where the form prints a colour of its own. */
export const NO_FILL = "none";

export const ALIGNMENTS = ["left", "center", "right"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];
const fontId = z.enum(FONT_IDS);

/** How big a record may grow: far past any real use, short of a runaway file. */
const MAX_ENTRIES = 5000;
const bounded = <T extends z.ZodTypeAny>(key: z.ZodString, value: T) =>
  z
    .record(key, value)
    .refine((record) => Object.keys(record).length <= MAX_ENTRIES, "too many entries")
    .default({});

export const V_ALIGNMENTS = ["top", "middle", "bottom"] as const;
export type VerticalAlignment = (typeof V_ALIGNMENTS)[number];

/**
 * The line styles Excel offers for a border, and how each prints. "none" takes
 * the line away altogether - even where the form, or the cell beside, draws one.
 */
export const BORDER_STYLES = ["thin", "medium", "thick", "dashed", "dotted", "double", "none"] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

export const BORDER_CSS: Record<BorderStyle, string> = {
  thin: "0.7pt solid",
  medium: "1.4pt solid",
  thick: "2.2pt solid",
  dashed: "0.9pt dashed",
  dotted: "1pt dotted",
  double: "2.4pt double",
  none: "hidden",
};

const borderEdge = z
  .object({ style: z.enum(BORDER_STYLES), colour: hexColour.optional() })
  .strict();

export const cellStyleSchema = z
  .object({
    /** Highlight colour, "#rrggbb" - or NO_FILL for blank. */
    fill: z.union([hexColour, z.literal(NO_FILL)]).optional(),
    /** true = bold, false = regular even where the form prints bold. */
    bold: z.boolean().optional(),
    font: fontId.optional(),
    sizePt: z.number().min(5).max(40).optional(),
    align: z.enum(ALIGNMENTS).optional(),
    /** Height of a row, or of a heading part (per row, for a heading table). */
    heightMm: z.number().min(2).max(80).optional(),
    /** Width of a heading piece that has one (REPORT_PARTS, `sizable`). */
    widthMm: z.number().min(5).max(400).optional(),
    /** Colour of the text, "#rrggbb". */
    colour: hexColour.optional(),
    /** Colour of the ruled lines round the cell (or heading), "#rrggbb". */
    lineColour: hexColour.optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    /** Where the text sits between the top and the bottom of its cell. */
    vAlign: z.enum(V_ALIGNMENTS).optional(),
    /** true: the text wraps onto more lines; false: it stays on one. */
    wrap: z.boolean().optional(),
    /** Space inside the cell, left and right / above and below. */
    paddingXMm: z.number().min(0).max(15).optional(),
    paddingYMm: z.number().min(0).max(15).optional(),
    /** Excel's borders: each edge its own line style and colour. */
    borders: z
      .object({ top: borderEdge.optional(), right: borderEdge.optional(), bottom: borderEdge.optional(), left: borderEdge.optional() })
      .strict()
      .optional(),
  })
  .strict();

export type CellStyle = z.infer<typeof cellStyleSchema>;
export type BorderEdge = z.infer<typeof borderEdge>;
export type BorderSide = "top" | "right" | "bottom" | "left";
export const BORDER_SIDES: readonly BorderSide[] = ["top", "right", "bottom", "left"];

// -------------------------------------------------------------- page setup

/**
 * The papers a report can be printed on. Indian Legal is what the school
 * loads; the others are there for a school, or a print shop, that has them.
 * `excel` is the paper's number in an .xlsx (Excel names a paper, it cannot
 * give a size): Indian Legal has none, so it asks for Legal and keeps inside
 * the shorter sheet (see printSetup in server/excel.ts).
 */
export const PAPER_SIZES = [
  { id: "legal-in", labelGu: "ઇન્ડિયન લીગલ", shortMm: 215, longMm: 345, excel: 5 },
  { id: "legal-us", labelGu: "US લીગલ", shortMm: 215.9, longMm: 355.6, excel: 5 },
  { id: "a4", labelGu: "A4", shortMm: 210, longMm: 297, excel: 9 },
  { id: "a3", labelGu: "A3", shortMm: 297, longMm: 420, excel: 8 },
  { id: "letter", labelGu: "લેટર (Letter)", shortMm: 215.9, longMm: 279.4, excel: 1 },
  { id: "folio", labelGu: "ફુલસ્કેપ (Folio)", shortMm: 215.9, longMm: 330.2, excel: 14 },
] as const;

export type PaperId = (typeof PAPER_SIZES)[number]["id"];
const PAPER_IDS = PAPER_SIZES.map((paper) => paper.id) as [PaperId, ...PaperId[]];

export const ORIENTATIONS = ["portrait", "landscape"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** The zoom a report can print at, in percent - as a print dialog offers. */
export const MIN_SCALE_PCT = 25;
export const MAX_SCALE_PCT = 200;

/**
 * How a report goes onto paper: which paper, which way round, the margin and
 * the zoom. Every field is optional; what is left out is the report's own
 * default (`DEFAULT_PAGE`), so a report nobody has touched prints as it always did.
 */
export const pageSetupSchema = z
  .object({
    paper: z.enum(PAPER_IDS).optional(),
    orientation: z.enum(ORIENTATIONS).optional(),
    /** 100 prints at full size; 80 fits more on the sheet, smaller. */
    scalePct: z.number().int().min(MIN_SCALE_PCT).max(MAX_SCALE_PCT).optional(),
    /** The same margin on all four edges. */
    marginMm: z.number().min(0).max(30).optional(),
  })
  .strict();

export type PageSetup = z.infer<typeof pageSetupSchema>;

export const reportLayoutSchema = z
  .object({
    version: z.literal(1),
    /** The whole report's font. */
    font: fontId.optional(),
    /** The whole report's text size. See `REPORT_DEFAULTS` for what it replaces. */
    sizePt: z.number().min(5).max(40).optional(),
    /** Space left and right of the text in every cell: the gap between columns. */
    paddingXMm: z.number().min(0).max(15).optional(),
    /** Space above and below the text in every cell. */
    paddingYMm: z.number().min(0).max(15).optional(),
    /** The least height of a body row. */
    rowHeightMm: z.number().min(2).max(60).optional(),
    /** How the tables' text sits in its cells. The forms centre it by default. */
    align: z.enum(ALIGNMENTS).optional(),
    /** Print none of the form's own colours (bands, footer rows, labels). */
    plain: z.boolean().optional(),
    /** The whole report's text colour. */
    colour: hexColour.optional(),
    /** The whole report's ruled lines. */
    lineColour: hexColour.optional(),
    /** Paper, orientation, margin and zoom. */
    page: pageSetupSchema.optional(),
    /** Column id -> share of the table's width. Normalised when used. */
    widths: bounded(z.string().min(1).max(40), z.number().min(0.1).max(100)),
    /** Row key -> blank space printed after that row. */
    rowGapsMm: bounded(z.string().min(1).max(300), z.number().min(0).max(80)),
    /** Target key (`targetKey`) -> how that column, row or cell looks. */
    styles: bounded(z.string().min(1).max(400), cellStyleSchema),
  })
  .strict();

export type ReportLayout = z.infer<typeof reportLayoutSchema>;

export function emptyLayout(): ReportLayout {
  return { version: 1, widths: {}, rowGapsMm: {}, styles: {} };
}

/** True when the layout changes nothing - the form prints its default. */
export function isEmptyLayout(layout: ReportLayout): boolean {
  return (
    layout.font === undefined &&
    layout.sizePt === undefined &&
    layout.paddingXMm === undefined &&
    layout.paddingYMm === undefined &&
    layout.rowHeightMm === undefined &&
    layout.align === undefined &&
    layout.plain === undefined &&
    layout.colour === undefined &&
    layout.lineColour === undefined &&
    (layout.page === undefined || Object.keys(layout.page).length === 0) &&
    Object.keys(layout.widths).length === 0 &&
    Object.keys(layout.rowGapsMm).length === 0 &&
    Object.keys(layout.styles).length === 0
  );
}

// ------------------------------------------------------------- the forms

export interface ReportColumn {
  id: string;
  /** What the editor calls it - the form's own heading, shortened. */
  labelGu: string;
  /** The default share of the table's width, in percent. */
  widthPct: number;
}

/** Build a column list whose last column takes whatever width is left. */
function columns(list: [id: string, labelGu: string, widthPct: number | null][]): ReportColumn[] {
  const fixed = list.reduce((sum, [, , width]) => sum + (width ?? 0), 0);
  const flexible = list.filter(([, , width]) => width === null).length;
  return list.map(([id, labelGu, width]) => ({
    id,
    labelGu,
    widthPct: width ?? (100 - fixed) / flexible,
  }));
}

/** One side of the rojmel: the receipt half ("r") or the payment half ("p"). */
function rojmelSide(
  side: "r" | "p",
  sideGu: string,
  widths: (number | null)[],
): [string, string, number | null][] {
  // The જાવક side has no date column of its own: its date is printed with the
  // voucher number, and the આવક side carries the block's date.
  const names: [string, string][] = [
    ...(side === "r" ? ([["date", "તારીખ"]] as [string, string][]) : []),
    ["detail", "વિગત"],
    ["ref", side === "r" ? "પહોંચ નંબર" : "વાઉચર નંબર"],
    ["cheque", "ચેક નં"],
    ["class", "વર્ગીકરણ"],
    ["cash", "રોકડ"],
    ["bank", "બેન્ક"],
    ["total", "કુલ રકમ"],
  ];
  return names.map(([id, label], index) => [`${side}.${id}`, `${sideGu} – ${label}`, widths[index] ?? null]);
}

/**
 * Every form's main table, column by column, with the widths the form has
 * always printed with. The print pages render their <colgroup> from this, so a
 * width lives in one place.
 */
export const REPORT_COLUMNS: Record<PrintableReportId, ReportColumn[]> = {
  rojmel: columns([
    // The date column holds "02/04/2025 TO" on one line, so a month's range
    // prints on two lines rather than three.
    ...rojmelSide("r", "આવક", [8.4, 10, 6.6, 3.4, 2.6, 5.7, 5.7, 5.7]),
    // The cheque column holds the cheque number - its date only when it is not
    // the block's own - so it is as wide as "103" and its heading, no wider.
    ...rojmelSide("p", "જાવક", [18.6, 8.6, 4.6, 2.6, 5.7, 5.7, null]),
  ]),
  khatavahi: columns([
    ["date", "તારીખ", 12],
    ["page", "રોજમેળ પાનું", 7],
    ["detail", "વિગત", 33],
    ["credit", "જમા", 12],
    ["debit", "ઉધાર", 12],
    ["creditBalance", "જમા બાકી", 12],
    ["debitBalance", "ઉધાર બાકી", null],
  ]),
  grantRegister: columns([
    // A date at 14pt needs 9% of the sheet to stay on one line.
    ["from", "કોના તરફથી મળી", 6.5],
    ["ddDate", "ડીડી/ચેક નંબર તારીખ", 9],
    ["amount", "રકમ", 8],
    ["purpose", "કયા કામે મળ્યો", 8.5],
    ["order", "ગ્રાન્ટ ફાળવણી આદેશ", 8.5],
    ["instrument", "ચેક/ડ્રાફ્ટ બેંકનું નામ", 6.5],
    ["bank", "બેંકનું નામ", 6.5],
    ["deposited", "જમા કર્યા તારીખ", 9],
    ["credited", "જમા થયા તારીખ", 9],
    ["allottedTo", "કોને ફાળવેલ", 7.5],
    ["spent", "ખર્ચેલ રકમ", 7.5],
    ["saving", "બચત રહેલ ગ્રાન્ટ", 7.5],
    ["remarks", "રીમાર્કસ", null],
  ]),
  chequeRegister: columns([
    ["serial", "અ.નં", 4],
    ["chequeNo", "ચેક નો ક્રમાંક", 6],
    ["chequeDate", "ચેકની તારીખ", 9.5],
    ["voucherNo", "વા.નં", 4.5],
    ["billRange", "બિલ નંબર", 9],
    ["amount", "રકમ", 9.5],
    ["payee", "જેના તરફેણમાં ચેક લખ્યો", 15],
    ["chequeAmount", "ચેકની રકમ", 9.5],
    ["purpose", "બિલની વિગત", 13],
    ["signature", "સહી", 8],
    ["cashedDate", "ચેક વટાવ્યાં તારીખ", 9.5],
    ["remarks", "શેરો", null],
  ]),
  billRegister: columns([
    ["serial", "અ.નં", 4],
    ["voucherNo", "વાઉચર નંબર", 5.5],
    ["billNo", "બીલ નંબર", 5.5],
    ["billDate", "બીલની તારીખ", 9.5],
    ["description", "બીલ વિગત", 15],
    ["vendor", "બીલ કોના તરફથી", 15],
    ["amount", "બીલની રકમ", 9.5],
    ["deduction", "કપાત", 7.5],
    ["net", "ચોખ્ખી રકમ", 9.5],
    ["signature", "મંજુર કરનારની સહી", 7],
    ["remarks", "રીમાર્કસ", 6],
    ["quantity", "જથ્થો", null],
  ]),
  vouchers: columns([
    ["serial", "ક્રમ", 7],
    ["billNo", "બિલ નંબર", 11],
    ["billDate", "તારીખ", 15],
    ["description", "બીલ વિગત", 23],
    ["vendor", "બીલ કોના તરફથી", 22],
    ["amount", "બિલની રકમ", 14],
    ["remarks", "રિમાર્ક્સ", null],
  ]),
  patrakD: columns([
    ["serial", "અ.નં", 5],
    ["chequeDate", "ચેકની તારીખ", 11],
    ["chequeNo", "ચેક નંબર", 8],
    ["payee", "કોના ખાતામાં", 23],
    ["parties", "દુકાનદાર, પાર્ટી", 22],
    ["head", "ગ્રાન્ટનો હેડ", 17],
    ["amount", "બીલની રકમ", null],
  ]),
  annexure9: columns([
    ["marker", "(+)/(–)", 11],
    ["index", "ક્રમ", 7],
    ["detail", "વિગત", null],
    ["amount", "રકમ", 24],
  ]),
  annexure10: columns([
    ["serial", "ક્રમ", 5],
    ["head", "વિગત", 17],
    ["opening", "શરૂની સિલક", null],
    ["received", "મળેલ ગ્રાન્ટ", null],
    ["total", "કુલ", null],
    ["spent", "ખર્ચ", null],
    ["returned", "પરત કરેલ", null],
    ["totalOut", "કુલ ખર્ચ", null],
    ["closing", "બંધ સિલક", null],
  ]),
};

export interface ReportPart {
  id: string;
  labelGu: string;
  /**
   * A piece whose width can be set. Every heading can be made narrower or
   * wider: a block (`block`) is then centred on the sheet, a piece of a row of
   * boxes (the rojmel's આવક box) takes that width beside the others.
   */
  sizable?: boolean;
  /** A heading that stands on its own line: centred when given a width. */
  block?: boolean;
}

/** A title-like heading: on its own line, its width and height both settable. */
const heading = (id: string, labelGu: string): ReportPart => ({ id, labelGu, sizable: true, block: true });

/**
 * The headings and blocks around each form's table that a school can resize or
 * recolour: every print page marks them with data-part.
 */
export const REPORT_PARTS: Record<PrintableReportId, ReportPart[]> = {
  rojmel: [
    heading("title", "મથાળું (શાળાનું નામ)"),
    heading("band", "આવક / જાવક પટ્ટી (આખી)"),
    { id: "bandLeft", labelGu: "આવક પટ્ટી (Cash Book)", sizable: true },
    { id: "bandRight", labelGu: "જાવક પટ્ટી (કેશ બુક)", sizable: true },
    { id: "bandPage", labelGu: "પાના નંબર", sizable: true },
    heading("closing", "છેલ્લું વાક્ય"),
  ],
  khatavahi: [
    heading("title", "મથાળું (શાળાનું નામ)"),
    heading("accountKind", "ખાતાવહી પટ્ટી"),
    heading("accountMeta", "ખાતાનું નામ અને વર્ષ"),
    heading("footTitle", "નીચેનું નામ"),
  ],
  grantRegister: [heading("title", "મથાળું")],
  chequeRegister: [heading("title", "મથાળું")],
  billRegister: [heading("title", "મથાળું")],
  vouchers: [
    heading("programme", "મથાળું (યોજના)"),
    heading("meta", "વાઉચરની વિગત"),
    heading("signatures", "સહી"),
  ],
  patrakD: [heading("title", "મથાળું"), heading("meta", "શાળાની વિગત")],
  annexure9: [...annexureBannerParts(), heading("heading", "બેંક મેળવણું"), heading("signatures", "સહી")],
  annexure10: [...annexureBannerParts(), heading("certificate", "પ્રમાણપત્ર"), heading("signatures", "સહી")],
};

/**
 * The annexures' stacked heading, whole and piece by piece: the programme
 * lines, the annexure's number, the year, the school's name and the rows of
 * details under it. Listed whole first, so a piece's own choice wins.
 */
function annexureBannerParts(): ReportPart[] {
  return [
    heading("banner", "મથાળું (આખું)"),
    heading("bannerProgramme", "યોજનાનું નામ"),
    heading("bannerNumber", "પરિશિષ્ટ નંબર"),
    heading("bannerYear", "વર્ષ"),
    { id: "bannerSchool", labelGu: "શાળાનું નામ", sizable: true },
    heading("bannerDetails", "શાળાની વિગત (કલસ્ટર, તાલુકો, ખાતા નંબર)"),
  ];
}

/** The part the first row of the report's Excel sheet stands for - its title. */
export const EXCEL_TITLE_PART: Record<PrintableReportId, string> = {
  rojmel: "title",
  khatavahi: "title",
  grantRegister: "title",
  chequeRegister: "title",
  billRegister: "title",
  vouchers: "programme",
  patrakD: "title",
  annexure9: "banner",
  annexure10: "banner",
};

export interface ReportDefaults {
  /** The main text size. */
  sizePt: number;
  paddingXMm: number;
  paddingYMm: number;
  /** null: as tall as the text needs. */
  rowHeightMm: number | null;
}

/** What each form prints with when nothing is changed (print.css). */
export const REPORT_DEFAULTS: Record<PrintableReportId, ReportDefaults> = {
  rojmel: { sizePt: 12, paddingXMm: 0.6, paddingYMm: 0.3, rowHeightMm: 5.4 },
  khatavahi: { sizePt: 14, paddingXMm: 0.8, paddingYMm: 0.6, rowHeightMm: 5 },
  grantRegister: { sizePt: 14, paddingXMm: 1, paddingYMm: 1.1, rowHeightMm: 7 },
  chequeRegister: { sizePt: 14, paddingXMm: 1, paddingYMm: 1.1, rowHeightMm: 7 },
  billRegister: { sizePt: 14, paddingXMm: 1, paddingYMm: 1.1, rowHeightMm: 7 },
  vouchers: { sizePt: 14, paddingXMm: 1.1, paddingYMm: 1.2, rowHeightMm: null },
  patrakD: { sizePt: 14, paddingXMm: 1, paddingYMm: 1.1, rowHeightMm: 7 },
  annexure9: { sizePt: 14, paddingXMm: 2.5, paddingYMm: 2, rowHeightMm: 9 },
  annexure10: { sizePt: 14, paddingXMm: 0.6, paddingYMm: 1, rowHeightMm: null },
};

/**
 * The rojmel's text is 12pt and its figures 11pt (the client's own sizes); its
 * title is 14. A new size for the rojmel scales all three together.
 */
const ROJMEL_FIGURE_RATIO = 11 / 12;
const ROJMEL_TITLE_RATIO = 14 / 12;

/**
 * The paper: Indian Legal, 215 x 345mm - a little shorter than US Legal
 * (215.9 x 355.6mm), which is what Indian offices load. A form laid out for US
 * Legal loses its last 10mm on this paper, which is the edge that was cut.
 */
export const PAPER_MM = { short: 215, long: 345 } as const;

/**
 * How each report prints when the school has not chosen otherwise. The rojmel,
 * ledger and registers are wide tables and print sideways; the annexures and
 * the vouchers stand upright. The voucher and પત્રક-D are on A4, the others
 * on Indian Legal. The annexure 10 and the rojmel print with 5mm margins, as
 * the client's own workbook does to get its columns across at full size.
 */
export const DEFAULT_PAGE: Record<PrintableReportId, Required<Omit<PageSetup, "scalePct">>> = {
  rojmel: { paper: "legal-in", orientation: "landscape", marginMm: 5 },
  khatavahi: { paper: "legal-in", orientation: "landscape", marginMm: 10 },
  grantRegister: { paper: "legal-in", orientation: "landscape", marginMm: 10 },
  chequeRegister: { paper: "legal-in", orientation: "landscape", marginMm: 10 },
  billRegister: { paper: "legal-in", orientation: "landscape", marginMm: 10 },
  vouchers: { paper: "a4", orientation: "portrait", marginMm: 10 },
  patrakD: { paper: "a4", orientation: "landscape", marginMm: 10 },
  annexure9: { paper: "legal-in", orientation: "portrait", marginMm: 10 },
  annexure10: { paper: "legal-in", orientation: "portrait", marginMm: 5 },
};

/** Which reports print sideways by default. */
export const LANDSCAPE_REPORTS: ReadonlySet<PrintableReportId> = new Set<PrintableReportId>(
  (Object.keys(DEFAULT_PAGE) as PrintableReportId[]).filter(
    (report) => DEFAULT_PAGE[report].orientation === "landscape",
  ),
);

/** A report's page setup worked out: what the stylesheet, the PDF and Excel print with. */
export interface ResolvedPage {
  paper: PaperId;
  landscape: boolean;
  marginMm: number;
  /** 1 is full size. */
  scale: number;
  /** The sheet as it lies: width and height in mm. */
  paperWidthMm: number;
  paperHeightMm: number;
  /**
   * The text block in the page's own millimetres - the paper less its margins,
   * divided by the zoom. The sheet is laid out this large, then zoomed onto
   * the paper.
   */
  contentWidthMm: number;
  contentHeightMm: number;
}

export function paperOf(id: PaperId): (typeof PAPER_SIZES)[number] {
  return PAPER_SIZES.find((paper) => paper.id === id) ?? PAPER_SIZES[0];
}

export function resolvePage(report: PrintableReportId, page: PageSetup | undefined): ResolvedPage {
  const base = DEFAULT_PAGE[report];
  const paperId = page?.paper ?? base.paper;
  const paper = paperOf(paperId);
  const landscape = (page?.orientation ?? base.orientation) === "landscape";
  const marginMm = page?.marginMm ?? base.marginMm;
  const scale = (page?.scalePct ?? 100) / 100;
  const paperWidthMm = landscape ? paper.longMm : paper.shortMm;
  const paperHeightMm = landscape ? paper.shortMm : paper.longMm;
  return {
    paper: paperId,
    landscape,
    marginMm,
    scale,
    paperWidthMm,
    paperHeightMm,
    contentWidthMm: round3(Math.max(10, paperWidthMm - 2 * marginMm) / scale),
    contentHeightMm: round3(Math.max(10, paperHeightMm - 2 * marginMm) / scale),
  };
}

/**
 * The zoom that brings the report's own default sheet onto another paper:
 * the widest percent at which the form still fits across - and, for the
 * forms whose sheets hold a fixed number of rows (the rojmel's 26), down.
 * What a print dialog calls "fit to page".
 */
export function fitScalePct(report: PrintableReportId, page: PageSetup | undefined): number {
  const designed = resolvePage(report, { scalePct: 100 });
  const target = resolvePage(report, { ...page, scalePct: 100 });
  const across = target.contentWidthMm / designed.contentWidthMm;
  const down = target.contentHeightMm / designed.contentHeightMm;
  const fixedRows = report === "rojmel" || report === "annexure9" || report === "annexure10";
  const fit = Math.min(1, across, fixedRows ? down : Infinity);
  return Math.max(MIN_SCALE_PCT, Math.floor(fit * 100));
}

/** The gap between the ledger's two columns of accounts (print.css, .khatavahi-grid). */
export const KHATAVAHI_GAP_MM = 4;

/**
 * The printed width of the report's table: the sheet less its margins - for
 * the ledger, half of it, as its accounts stand two across.
 */
export function tableWidthMm(report: PrintableReportId, layout?: ReportLayout): number {
  const width = resolvePage(report, layout?.page).contentWidthMm;
  return report === "khatavahi" ? round3((width - KHATAVAHI_GAP_MM) / 2) : width;
}

// ---------------------------------------------------------------- row keys

/**
 * Row keys, made from what each row is about. Shared by the print pages and the
 * Excel export so a highlight lands on the same entry in both.
 */
export const ROW_KEYS = {
  /** The column headings. */
  head: "head",
  /** A table's કુલ row. */
  total: "total",
  cheque: (chequeNo: number): string => `cheque:${chequeNo}`,
  receipt: (id: number | string): string => `receipt:${id}`,
  grantHead: (code: string): string => `head:${code}`,
  patrakD: (chequeNo: number, headNameGu: string): string => `cheque:${chequeNo}:${headNameGu}`,
  voucherTotal: (voucherNo: number): string => `voucher:${voucherNo}:total`,
  rojmelRow: (blockId: string, index: number): string => `${blockId}:${index}`,
  rojmelFooter: (blockId: string, which: "spent" | "closing" | "grand"): string =>
    `${blockId}:${which}`,
  ledgerBlank: (headCode: string, index: number): string => `${headCode}:blank:${index}`,
  ledgerClosing: (headCode: string): string => `${headCode}:closing`,
} as const;

/**
 * Row GROUPS: the same row of every block. A report made of blocks - the
 * rojmel's, the ledger's accounts, the vouchers - repeats the same rows in each,
 * and a school changing "the row" means that row everywhere, as a column change
 * already is. So a row's height, colour or font set for the whole row is kept
 * against its group, and every block's row in that place follows it. A single
 * cell is still that one cell.
 *
 * A group key is a row key that starts with "group:", so a layout keeps its
 * one map of styles and gaps.
 */
export const ROW_GROUPS = {
  prefix: "group:",
  /** The n-th body row of every rojmel block. */
  rojmelRow: (index: number): string => `group:rojmel:${index}`,
  rojmelFooter: (which: "spent" | "closing" | "grand"): string => `group:rojmel:${which}`,
  /** The n-th row of every account, blank rows included. */
  ledgerRow: (index: number): string => `group:ledger:${index}`,
  ledgerClosing: "group:ledger:closing",
  /** The n-th line of every voucher. */
  voucherLine: (index: number): string => `group:voucher:${index}`,
  voucherTotal: "group:voucher:total",
} as const;

export function isGroupKey(row: string): boolean {
  return row.startsWith(ROW_GROUPS.prefix);
}

/** Annexure 9's rows are fixed by the form. */
export const ANNEXURE9_ROWS = [
  "cashbook",
  "notCashed",
  "notInCashbook",
  "addTotal",
  "deduct",
  "notCredited",
  "charges",
  "deductTotal",
  "passbook",
] as const;

/** "a", "a", "b" -> "a", "a#2", "b": keys stay unique when a base repeats. */
export function uniqueKeys(bases: string[]): string[] {
  const seen = new Map<string, number>();
  return bases.map((base) => {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

/** A bill register row, or a voucher line: voucher, then bill number. */
export function billRowKeys(rows: { voucherNo: number; billNo: string | null }[]): string[] {
  return uniqueKeys(rows.map((row) => `bill:${row.voucherNo}:${row.billNo ?? "-"}`));
}

/** A ledger's entries: the account, then the date. */
export function ledgerRowKeys(headCode: string, rows: { date: string }[]): string[] {
  return uniqueKeys(rows.map((row) => `${headCode}:${row.date}`));
}

// ----------------------------------------------------------------- targets

export type LayoutTarget =
  | { kind: "part"; part: string }
  | { kind: "col"; col: string }
  | { kind: "row"; row: string }
  | { kind: "cell"; row: string; col: string };

/** Column ids never contain "@", so a cell key splits unambiguously. */
export function targetKey(target: LayoutTarget): string {
  switch (target.kind) {
    case "part":
      return `part:${target.part}`;
    case "col":
      return `col:${target.col}`;
    case "row":
      return `row:${target.row}`;
    case "cell":
      return `cell:${target.col}@${target.row}`;
  }
}

export function parseTargetKey(key: string): LayoutTarget | null {
  if (key.startsWith("part:")) return { kind: "part", part: key.slice(5) };
  if (key.startsWith("col:")) return { kind: "col", col: key.slice(4) };
  if (key.startsWith("row:")) return { kind: "row", row: key.slice(4) };
  if (key.startsWith("cell:")) {
    const rest = key.slice(5);
    const at = rest.indexOf("@");
    if (at <= 0) return null;
    return { kind: "cell", col: rest.slice(0, at), row: rest.slice(at + 1) };
  }
  return null;
}

/**
 * How one cell looks: its column's style, then its row group's (the same row
 * in every block), then its own row's, then its own.
 */
export function styleAt(
  layout: ReportLayout,
  row: string | null,
  col: string | null,
  group: string | null = null,
): CellStyle {
  const pick = (key: string): CellStyle => layout.styles[key] ?? {};
  return {
    ...(col !== null ? pick(targetKey({ kind: "col", col })) : {}),
    ...(group !== null ? pick(targetKey({ kind: "row", row: group })) : {}),
    ...(row !== null ? pick(targetKey({ kind: "row", row })) : {}),
    ...(row !== null && col !== null ? pick(targetKey({ kind: "cell", row, col })) : {}),
  };
}

/** The blank space after a row: its own, else its group's. */
export function rowGapMm(layout: ReportLayout, row: string, group: string | null = null): number | undefined {
  return layout.rowGapsMm[row] ?? (group !== null ? layout.rowGapsMm[group] : undefined);
}

// ------------------------------------------------------------------ editing

/** Narrowest a column may be made, in percent of the table. */
export const MIN_COLUMN_PCT = 1;

/** The widths the report prints with, summing to 100. */
export function columnWidths(report: PrintableReportId, layout: ReportLayout): Record<string, number> {
  const list = REPORT_COLUMNS[report];
  const raw = list.map((column) => layout.widths[column.id] ?? column.widthPct);
  const sum = raw.reduce((total, value) => total + value, 0);
  return Object.fromEntries(list.map((column, index) => [column.id, (raw[index]! / sum) * 100]));
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

function withWidths(layout: ReportLayout, widths: Record<string, number>): ReportLayout {
  return {
    ...layout,
    widths: Object.fromEntries(Object.entries(widths).map(([id, value]) => [id, round3(value)])),
  };
}

/**
 * Drag the right edge of `col`: it grows by `deltaPct` and the column to its
 * right shrinks by as much, so the table still spans the page.
 */
export function moveColumnEdge(
  report: PrintableReportId,
  layout: ReportLayout,
  col: string,
  deltaPct: number,
): ReportLayout {
  const list = REPORT_COLUMNS[report];
  const index = list.findIndex((column) => column.id === col);
  const next = list[index + 1];
  if (index < 0 || !next) return layout;

  const widths = columnWidths(report, layout);
  const left = widths[col]!;
  const right = widths[next.id]!;
  const delta = Math.max(MIN_COLUMN_PCT - left, Math.min(right - MIN_COLUMN_PCT, deltaPct));
  widths[col] = left + delta;
  widths[next.id] = right - delta;
  return withWidths(layout, widths);
}

/** Set one column's width; the others give or take room in proportion. */
export function setColumnWidth(
  report: PrintableReportId,
  layout: ReportLayout,
  col: string,
  pct: number,
): ReportLayout {
  const widths = columnWidths(report, layout);
  const others = Object.keys(widths).filter((id) => id !== col);
  if (!(col in widths) || others.length === 0) return layout;

  const most = 100 - others.length * MIN_COLUMN_PCT;
  const target = Math.max(MIN_COLUMN_PCT, Math.min(most, pct));
  // Share what is left among the others in proportion - except that a column
  // the share would squeeze below the minimum is held at the minimum and the
  // rest shared again among the remainder.
  const result: Record<string, number> = { [col]: target };
  let free = others;
  let room = 100 - target;
  while (free.length > 0) {
    const scale = room / free.reduce((sum, id) => sum + widths[id]!, 0);
    const tooNarrow = free.filter((id) => widths[id]! * scale < MIN_COLUMN_PCT);
    if (tooNarrow.length === 0) {
      for (const id of free) result[id] = widths[id]! * scale;
      break;
    }
    for (const id of tooNarrow) result[id] = MIN_COLUMN_PCT;
    room -= tooNarrow.length * MIN_COLUMN_PCT;
    free = free.filter((id) => !tooNarrow.includes(id));
  }
  return withWidths(layout, result);
}

/** Apply a change to one target's style; `undefined` in the patch clears a property. */
export function withStyle(
  layout: ReportLayout,
  target: LayoutTarget,
  patch: { [K in keyof CellStyle]?: CellStyle[K] | undefined },
): ReportLayout {
  const key = targetKey(target);
  const next: CellStyle = { ...(layout.styles[key] ?? {}) };
  for (const [property, value] of Object.entries(patch) as [keyof CellStyle, unknown][]) {
    if (value === undefined) delete next[property];
    else (next as Record<string, unknown>)[property] = value;
  }
  const styles = { ...layout.styles };
  if (Object.keys(next).length === 0) delete styles[key];
  else styles[key] = next;
  return { ...layout, styles };
}

/** Space after a row, or none with null / 0. */
export function withRowGap(layout: ReportLayout, row: string, mm: number | null): ReportLayout {
  const rowGapsMm = { ...layout.rowGapsMm };
  if (mm === null || mm <= 0) delete rowGapsMm[row];
  else rowGapsMm[row] = mm;
  return { ...layout, rowGapsMm };
}

// ------------------------------------------------------------ stylesheet

/** A value safe inside a double-quoted CSS string. */
export function cssString(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`).replace(/[\n\r\f]/g, " ")}"`;
}

/** The font stack for a layout font, falling back to what the app always used. */
export function fontStack(id: LayoutFontId | undefined): string {
  const primary = fontFamily(id);
  const rest = ['"Noto Sans Gujarati"', '"Shruti"', '"Nirmala UI"', '"Lohit Gujarati"', "serif"];
  return [cssString(primary), ...rest.filter((entry) => entry !== cssString(primary))].join(", ");
}

/** What a cell's text looks like: carried into everything inside a heading. */
function textDeclarations(style: CellStyle): string[] {
  const out: string[] = [];
  if (style.bold !== undefined) out.push(`font-weight: ${style.bold ? 700 : 400}`);
  if (style.italic !== undefined) out.push(`font-style: ${style.italic ? "italic" : "normal"}`);
  if (style.underline !== undefined) out.push(`text-decoration: ${style.underline ? "underline" : "none"}`);
  if (style.font) out.push(`font-family: ${fontStack(style.font)}`);
  if (style.sizePt !== undefined) out.push(`font-size: ${style.sizePt}pt`);
  if (style.align) out.push(`text-align: ${style.align}`);
  if (style.colour) out.push(`color: ${style.colour}`);
  if (style.lineColour) out.push(`border-color: ${style.lineColour}`);
  if (style.wrap !== undefined) out.push(`white-space: ${style.wrap ? "normal" : "nowrap"}`);
  return out;
}

/** The box itself: its padding, vertical alignment and borders - never its contents'. */
function boxDeclarations(style: CellStyle): string[] {
  const out: string[] = [];
  if (style.vAlign) out.push(`vertical-align: ${style.vAlign}`);
  if (style.paddingXMm !== undefined) {
    out.push(`padding-left: ${style.paddingXMm}mm`, `padding-right: ${style.paddingXMm}mm`);
  }
  if (style.paddingYMm !== undefined) {
    out.push(`padding-top: ${style.paddingYMm}mm`, `padding-bottom: ${style.paddingYMm}mm`);
  }
  for (const side of BORDER_SIDES) {
    const edge = style.borders?.[side];
    if (!edge) continue;
    if (edge.style === "none") out.push(`border-${side}: hidden`);
    else out.push(`border-${side}: ${BORDER_CSS[edge.style]} ${edge.colour ?? style.lineColour ?? "#000"}`);
  }
  return out;
}

function declarations(style: CellStyle): string[] {
  const out: string[] = [];
  if (style.fill) out.push(`background: ${style.fill === NO_FILL ? "transparent" : style.fill}`);
  return [...out, ...textDeclarations(style), ...boxDeclarations(style)];
}

const FLEX_ALIGN: Record<Alignment, string> = { left: "flex-start", center: "center", right: "flex-end" };

/**
 * A heading part: its text properties go to everything inside it too, because
 * the form's own rules size and colour the pieces of a heading one by one.
 */
function partRules(root: string, partId: string, style: CellStyle, part?: ReportPart): string[] {
  const attribute = `[data-part=${cssString(partId)}]`;
  const selector = `${root} ${attribute}`;
  /** The part when it is this kind of element, e.g. `#r table[data-part="x"]`. */
  const as = (tag: string): string => `${root} ${tag}${attribute}`;
  const rules: string[] = [];
  const all = `${selector}, ${selector} *`;
  const inherited = textDeclarations(style);
  if (inherited.length > 0) rules.push(`${all} { ${inherited.join("; ")}; }`);
  const box = boxDeclarations(style);
  if (box.length > 0) rules.push(`${selector} { ${box.join("; ")}; }`);
  if (style.fill) {
    rules.push(`${all} { background: ${style.fill === NO_FILL ? "transparent" : style.fill}; }`);
  }
  if (style.align) rules.push(`${selector} { justify-content: ${FLEX_ALIGN[style.align]}; }`);
  if (style.widthMm !== undefined) {
    // A piece of a heading row takes exactly this width; the others share the
    // rest. A heading on its own line is centred at it.
    const centred = part?.block ? " margin-left: auto; margin-right: auto; box-sizing: border-box;" : "";
    rules.push(`${selector} { flex: 0 0 auto; width: ${style.widthMm}mm;${centred} }`);
  }
  if (style.heightMm !== undefined) {
    // A block grows to the height; a heading table grows each of its rows, and
    // a row or cell of one grows itself.
    rules.push(`${selector}:not(table):not(tr):not(td) { min-height: ${style.heightMm}mm; }`);
    rules.push(`${as("table")} td, ${as("tr")} > td, ${as("td")} { height: ${style.heightMm}mm; }`);
  }
  return rules;
}

/**
 * The stylesheet that applies a layout to a rendered report.
 *
 * `root` is an id selector, which outranks every class rule in print.css, so a
 * school's choice wins over the form's default without `!important` - and the
 * inline sizes fitCells sets (shrink to fit) still win over both.
 *
 * Column rules come first, then row rules, then single cells; their selectors
 * grow more specific in that order too, so a cell's own colour beats its row's.
 */
export function layoutCss(report: PrintableReportId, layout: ReportLayout, root: string): string {
  const rules: string[] = [];
  const defaults = REPORT_DEFAULTS[report];

  const base: string[] = [];
  if (layout.font) base.push(`font-family: ${fontStack(layout.font)}`);
  if (layout.sizePt !== undefined && layout.sizePt !== defaults.sizePt) {
    if (report === "rojmel") {
      base.push(`--rojmel-text: ${layout.sizePt}pt`);
      base.push(`--rojmel-figure: ${round3(layout.sizePt * ROJMEL_FIGURE_RATIO)}pt`);
      base.push(`--report-font: ${round3(layout.sizePt * ROJMEL_TITLE_RATIO)}pt`);
    } else {
      base.push(`--report-font: ${layout.sizePt}pt`);
    }
  }
  if (layout.colour) base.push(`color: ${layout.colour}`);
  if (base.length > 0) rules.push(`${root} { ${base.join("; ")}; }`);
  // The text colour reaches pieces the form sets a colour on, and the line
  // colour every rule of every table and heading box.
  if (layout.colour) rules.push(`${root} .sheet * { color: ${layout.colour}; }`);
  if (layout.lineColour) rules.push(`${root} .sheet * { border-color: ${layout.lineColour}; }`);

  // No colours of the form's own. A school's highlights still apply: they come
  // later, with selectors at least as specific.
  if (layout.plain) {
    rules.push(
      `${root} :is(table.form, table.banner) :is(td, th), ${root} [data-part], ${root} [data-part] * { background: transparent; }`,
    );
  }

  const table = `${root} table[data-layout]`;
  const padding: string[] = [];
  if (layout.paddingYMm !== undefined) {
    padding.push(`padding-top: ${layout.paddingYMm}mm`, `padding-bottom: ${layout.paddingYMm}mm`);
  }
  if (layout.paddingXMm !== undefined) {
    padding.push(`padding-left: ${layout.paddingXMm}mm`, `padding-right: ${layout.paddingXMm}mm`);
  }
  if (padding.length > 0) {
    // :where keeps this weaker than a column's, a row's or a cell's own padding.
    rules.push(`${table} :where(tr:not(.layout-gap):not(.block-gap)) > :is(td, th) { ${padding.join("; ")}; }`);
  }
  if (layout.rowHeightMm !== undefined) {
    rules.push(
      // :where keeps this weaker than a row's (or its group's) own height.
      `${table} > tbody > :where(tr:not(.layout-gap):not(.block-gap)) > td { height: ${layout.rowHeightMm}mm; }`,
    );
  }
  if (layout.align) {
    rules.push(`${table} > * > tr > :is(td, th) { text-align: ${layout.align}; }`);
  }

  const order = { part: 0, col: 1, row: 2, cell: 3 } as const;
  // A row group before a single row, so the row's own choice wins.
  const groupFirst = (target: LayoutTarget): number =>
    target.kind === "row" && !isGroupKey(target.row) ? 1 : 0;
  // REPORT_PARTS lists a heading before the pieces inside it, and its rules
  // reach those pieces too: in that order a piece's own choice comes later and wins.
  const partOrder = (target: LayoutTarget): number =>
    target.kind === "part" ? REPORT_PARTS[report].findIndex((part) => part.id === target.part) : 0;
  const targets = Object.entries(layout.styles)
    .map(([key, style]) => ({ target: parseTargetKey(key), style }))
    .filter((entry): entry is { target: LayoutTarget; style: CellStyle } => entry.target !== null)
    .sort(
      (a, b) =>
        order[a.target.kind] - order[b.target.kind] ||
        partOrder(a.target) - partOrder(b.target) ||
        groupFirst(a.target) - groupFirst(b.target),
    );

  for (const { target, style } of targets) {
    if (target.kind === "part") {
      const part = REPORT_PARTS[report].find((each) => each.id === target.part);
      rules.push(...partRules(root, target.part, style, part));
      continue;
    }
    const body = declarations(style);
    const rowSelector = (row: string): string =>
      isGroupKey(row) ? `tr[data-row-group=${cssString(row)}]` : `tr[data-row=${cssString(row)}]`;
    if (target.kind === "row" && style.heightMm !== undefined) {
      rules.push(`${table} ${rowSelector(target.row)} > td { height: ${style.heightMm}mm; }`);
    }
    if (body.length === 0) continue;
    const selector =
      target.kind === "col"
        ? `${table} :is(td, th)[data-col=${cssString(target.col)}]`
        : target.kind === "row"
          ? `${table} ${rowSelector(target.row)} > :is(td, th)`
          : `${table} tr[data-row=${cssString(target.row)}] > :is(td, th)[data-col=${cssString(target.col)}]`;
    rules.push(`${selector} { ${body.join("; ")}; }`);
    // A total printed in <strong> follows its cell's choice of weight.
    if (style.bold !== undefined) rules.push(`${selector} strong { font-weight: inherit; }`);
  }

  return rules.join("\n");
}

/** Every font a layout uses, so the page can wait for them before measuring. */
export function fontsUsed(layout: ReportLayout): string[] {
  const ids = new Set<LayoutFontId>([layout.font ?? DEFAULT_FONT]);
  for (const style of Object.values(layout.styles)) if (style.font) ids.add(style.font);
  return [...ids].map((id) => fontFamily(id));
}

// ------------------------------------------------------------------- Excel

/** Points in a millimetre, for Excel's row heights. */
export const PT_PER_MM = 72 / 25.4;

/**
 * How much wider the school made these columns than the form's default: an
 * Excel column gets the same proportion. Several ids (the rojmel's two sides
 * sharing one spreadsheet column) are averaged.
 */
export function widthScale(report: PrintableReportId, layout: ReportLayout, cols: string[]): number {
  const known = cols.filter((id) => REPORT_COLUMNS[report].some((column) => column.id === id));
  if (known.length === 0) return 1;
  const now = columnWidths(report, layout);
  const before = columnWidths(report, emptyLayout());
  return known.reduce((sum, id) => sum + now[id]! / before[id]!, 0) / known.length;
}
