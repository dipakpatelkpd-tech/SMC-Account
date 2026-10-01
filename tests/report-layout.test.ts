/**
 * A school's report layout, as data: the column widths it resolves to, the
 * edits the editor makes, the keys cells are found by and the stylesheet the
 * preview and the PDF apply.
 *
 * The widths are pinned against the numbers the print pages used to carry
 * inline, so moving them into REPORT_COLUMNS cannot have moved a single column
 * of a form nobody has customised.
 */
import { describe, expect, it } from "vitest";
import { PRINTABLE_REPORTS } from "../src/shared/api.js";
import {
  MIN_COLUMN_PCT,
  NO_FILL,
  REPORT_PARTS,
  REPORT_COLUMNS,
  billRowKeys,
  columnWidths,
  cssString,
  LANDSCAPE_REPORTS,
  emptyLayout,
  fitScalePct,
  isEmptyLayout,
  layoutCss,
  ledgerRowKeys,
  moveColumnEdge,
  parseTargetKey,
  reportLayoutSchema,
  resolvePage,
  setColumnWidth,
  styleAt,
  tableWidthMm,
  targetKey,
  uniqueKeys,
  widthScale,
  withRowGap,
  withStyle,
  type ReportLayout,
} from "../src/shared/report-layout.js";

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

describe("default widths", () => {
  it("fill every form's table exactly, with unique column ids", () => {
    for (const report of PRINTABLE_REPORTS) {
      const columns = REPORT_COLUMNS[report];
      expect(sum(columns.map((column) => column.widthPct))).toBeCloseTo(100, 9);
      expect(new Set(columns.map((column) => column.id)).size).toBe(columns.length);
      // A cell key splits on "@", so no column id may contain one.
      for (const column of columns) expect(column.id).not.toContain("@");
    }
  });

  it("are the widths the forms printed with before layouts existed", () => {
    const widths = (report: (typeof PRINTABLE_REPORTS)[number]) =>
      REPORT_COLUMNS[report].map((column) => Math.round(column.widthPct * 1000) / 1000);
    expect(widths("chequeRegister")).toEqual([4, 6, 9.5, 4.5, 9, 9.5, 15, 9.5, 13, 8, 9.5, 2.5]);
    expect(widths("billRegister")).toEqual([4, 5.5, 5.5, 9.5, 15, 15, 9.5, 7.5, 9.5, 7, 6, 6]);
    expect(widths("khatavahi")).toEqual([12, 7, 33, 12, 12, 12, 12]);
    expect(widths("annexure9")).toEqual([11, 7, 58, 24]);
    expect(widths("annexure10").slice(0, 2)).toEqual([5, 17]);
    // Fifteen: the જાવક side has no date column of its own.
    expect(widths("rojmel")).toHaveLength(15);
    expect(widths("rojmel").at(-1)).toBeCloseTo(6.1, 9);
  });

  it("resolve unchanged for an empty layout", () => {
    const widths = Object.values(columnWidths("patrakD", emptyLayout()));
    REPORT_COLUMNS.patrakD.forEach((column, index) => expect(widths[index]).toBeCloseTo(column.widthPct, 9));
  });
});

describe("dragging a column edge", () => {
  it("widens one column and narrows its right neighbour by as much", () => {
    const next = moveColumnEdge("chequeRegister", emptyLayout(), "payee", 5);
    const widths = columnWidths("chequeRegister", next);
    expect(widths["payee"]).toBeCloseTo(20, 3);
    expect(widths["chequeAmount"]).toBeCloseTo(4.5, 3);
    expect(widths["amount"]).toBeCloseTo(9.5, 3);
    expect(sum(Object.values(widths))).toBeCloseTo(100, 6);
  });

  it("never makes either column narrower than the minimum", () => {
    const wider = moveColumnEdge("chequeRegister", emptyLayout(), "payee", 50);
    expect(columnWidths("chequeRegister", wider)["chequeAmount"]).toBeCloseTo(MIN_COLUMN_PCT, 3);
    const narrower = moveColumnEdge("chequeRegister", emptyLayout(), "payee", -50);
    expect(columnWidths("chequeRegister", narrower)["payee"]).toBeCloseTo(MIN_COLUMN_PCT, 3);
  });

  it("does nothing to the last column, which has no right neighbour", () => {
    const layout = emptyLayout();
    expect(moveColumnEdge("chequeRegister", layout, "remarks", 5)).toBe(layout);
  });
});

describe("typing a column width", () => {
  it("sets that column and shares the difference among the others", () => {
    const next = setColumnWidth("khatavahi", emptyLayout(), "detail", 43);
    const widths = columnWidths("khatavahi", next);
    expect(widths["detail"]).toBeCloseTo(43, 3);
    expect(sum(Object.values(widths))).toBeCloseTo(100, 6);
    // The others keep their proportions: date and credit were equal, and stay so.
    expect(widths["date"]).toBeCloseTo(widths["credit"]!, 6);
  });

  it("keeps every other column above the minimum however wide one is made", () => {
    const next = setColumnWidth("chequeRegister", emptyLayout(), "payee", 99);
    const widths = columnWidths("chequeRegister", next);
    for (const value of Object.values(widths)) expect(value).toBeGreaterThanOrEqual(MIN_COLUMN_PCT - 1e-6);
    expect(sum(Object.values(widths))).toBeCloseTo(100, 6);
  });
});

describe("targets and styles", () => {
  it("round-trip a cell key whose row key contains @, / and quotes", () => {
    const target = { kind: "cell", row: 'bill:1:1/2@"x"', col: "amount" } as const;
    expect(parseTargetKey(targetKey(target))).toEqual(target);
  });

  it("layer column, then row, then the cell's own", () => {
    let layout = emptyLayout();
    layout = withStyle(layout, { kind: "col", col: "amount" }, { fill: "#fff59d", bold: true });
    layout = withStyle(layout, { kind: "row", row: "cheque:7" }, { fill: "#c8e6c9" });
    layout = withStyle(layout, { kind: "cell", row: "cheque:7", col: "amount" }, { sizePt: 16 });

    expect(styleAt(layout, "cheque:8", "amount")).toEqual({ fill: "#fff59d", bold: true });
    expect(styleAt(layout, "cheque:7", "payee")).toEqual({ fill: "#c8e6c9" });
    expect(styleAt(layout, "cheque:7", "amount")).toEqual({ fill: "#c8e6c9", bold: true, sizePt: 16 });
  });

  it("drops a target once every property is cleared, leaving an empty layout", () => {
    const target = { kind: "row", row: "total" } as const;
    let layout = withStyle(emptyLayout(), target, { bold: false });
    expect(isEmptyLayout(layout)).toBe(false);
    layout = withStyle(layout, target, { bold: undefined });
    expect(layout.styles).toEqual({});
    expect(isEmptyLayout(layout)).toBe(true);
  });

  it("adds and removes the space after a row", () => {
    const layout = withRowGap(emptyLayout(), "cheque:7", 6);
    expect(layout.rowGapsMm).toEqual({ "cheque:7": 6 });
    expect(withRowGap(layout, "cheque:7", 0).rowGapsMm).toEqual({});
  });
});

describe("row keys", () => {
  it("stay unique when a base repeats, and stable for the first of each", () => {
    expect(uniqueKeys(["a", "b", "a", "a"])).toEqual(["a", "b", "a#2", "a#3"]);
  });

  it("name a bill by voucher and bill number, so an earlier bill does not move them", () => {
    const before = billRowKeys([
      { voucherNo: 3, billNo: "3/1" },
      { voucherNo: 3, billNo: "3/2" },
    ]);
    const after = billRowKeys([
      { voucherNo: 2, billNo: "2/1" },
      { voucherNo: 3, billNo: "3/1" },
      { voucherNo: 3, billNo: "3/2" },
    ]);
    expect(after.slice(1)).toEqual(before);
    // The bill behind a direct cheque has no number; two such stay apart.
    expect(billRowKeys([{ voucherNo: 9, billNo: null }, { voucherNo: 9, billNo: null }])).toEqual([
      "bill:9:-",
      "bill:9:-#2",
    ]);
  });

  it("name ledger entries by account and date", () => {
    expect(ledgerRowKeys("SWACHHATA", [{ date: "2025-04-01" }, { date: "2025-04-01" }])).toEqual([
      "SWACHHATA:2025-04-01",
      "SWACHHATA:2025-04-01#2",
    ]);
  });
});

describe("the stylesheet", () => {
  it("is empty for an empty layout: the form prints exactly as before", () => {
    for (const report of PRINTABLE_REPORTS) expect(layoutCss(report, emptyLayout(), "#r")).toBe("");
  });

  it("scopes every rule to the root id and orders column, row, cell", () => {
    let layout = emptyLayout();
    layout = withStyle(layout, { kind: "cell", row: "cheque:7", col: "amount" }, { fill: "#bbdefb" });
    layout = withStyle(layout, { kind: "row", row: "cheque:7" }, { bold: true });
    layout = withStyle(layout, { kind: "col", col: "amount" }, { font: "rasa" });
    const css = layoutCss("chequeRegister", layout, "#report-layout");
    const lines = css.split("\n");
    expect(lines.every((line) => line.startsWith("#report-layout"))).toBe(true);
    const col = lines.findIndex((line) => line.includes('font-family: "Rasa"'));
    const row = lines.findIndex((line) => line.includes("font-weight: 700"));
    const cell = lines.findIndex((line) => line.includes("background: #bbdefb"));
    expect(col).toBeLessThan(row);
    expect(row).toBeLessThan(cell);
    // Bold follows into the <strong> a total is printed in.
    expect(css).toContain('tr[data-row="cheque:7"] > :is(td, th) strong { font-weight: inherit; }');
  });

  it("escapes a row key rather than letting it end the selector", () => {
    const layout = withStyle(emptyLayout(), { kind: "row", row: 'x"] body { color: red' }, { bold: true });
    expect(layoutCss("billRegister", layout, "#r")).toContain('[data-row="x\\"] body { color: red"]');
    expect(cssString('a\\b"c')).toBe('"a\\\\b\\"c"');
  });

  it("scales the rojmel's three sizes together", () => {
    const css = layoutCss("rojmel", { ...emptyLayout(), sizePt: 13.2 }, "#r");
    expect(css).toContain("--rojmel-text: 13.2pt");
    expect(css).toContain("--rojmel-figure: 12.1pt");
    expect(css).toContain("--report-font: 15.4pt");
  });

  it("colours the text and the ruled lines of a cell, a row or the whole report", () => {
    let layout: ReportLayout = { ...emptyLayout(), colour: "#1a237e", lineColour: "#9e9e9e" };
    layout = withStyle(layout, { kind: "row", row: "cheque:7" }, { colour: "#b71c1c", lineColour: "#0d47a1" });
    const css = layoutCss("chequeRegister", layout, "#r");
    expect(css).toContain("#r .sheet * { color: #1a237e; }");
    expect(css).toContain("#r .sheet * { border-color: #9e9e9e; }");
    expect(css).toContain('tr[data-row="cheque:7"] > :is(td, th) { color: #b71c1c; border-color: #0d47a1; }');
    expect(reportLayoutSchema.safeParse(layout).success).toBe(true);
    expect(reportLayoutSchema.safeParse({ ...layout, lineColour: "blue" }).success).toBe(false);
  });

  it("writes spacing and row height for the report's tables only", () => {
    const css = layoutCss("billRegister", { ...emptyLayout(), paddingXMm: 2, rowHeightMm: 9 }, "#r");
    expect(css).toContain("#r table[data-layout] > * > tr:not(.layout-gap):not(.block-gap) > :is(td, th) { padding-left: 2mm; padding-right: 2mm; }");
    expect(css).toContain("height: 9mm");
  });
});

describe("the schema", () => {
  it("accepts what the editor makes, and fills in what an older file lacks", () => {
    const made = withRowGap(withStyle(emptyLayout(), { kind: "col", col: "amount" }, { fill: "#FFE0B2" }), "total", 4);
    expect(reportLayoutSchema.parse(made)).toEqual(made);
    expect(reportLayoutSchema.parse({ version: 1 })).toEqual(emptyLayout());
  });

  it("refuses a colour that is not #rrggbb, an unknown font and absurd sizes", () => {
    const bad = (layout: unknown) => reportLayoutSchema.safeParse(layout).success;
    expect(bad({ version: 1, styles: { "col:amount": { fill: "red" } } })).toBe(false);
    expect(bad({ version: 1, styles: { "col:amount": { fill: "#fff;}" } } })).toBe(false);
    expect(bad({ version: 1, font: "comic-sans" })).toBe(false);
    expect(bad({ version: 1, sizePt: 400 })).toBe(false);
    expect(bad({ version: 1, rowGapsMm: { total: -3 } })).toBe(false);
    expect(bad({ version: 1, surprise: true })).toBe(false);
  });
});

describe("paper", () => {
  it("knows each form's printed table width", () => {
    expect(tableWidthMm("rojmel")).toBeCloseTo(335, 6);
    expect(tableWidthMm("chequeRegister")).toBeCloseTo(325, 6);
    expect(tableWidthMm("annexure10")).toBeCloseTo(205, 6);
    // The voucher is on A4 by default: 210mm less two 10mm margins.
    expect(tableWidthMm("vouchers")).toBeCloseTo(190, 6);
    expect(tableWidthMm("patrakD")).toBeCloseTo(277, 6);
  });

  it("prints every report as it always did until a school changes it", () => {
    for (const report of PRINTABLE_REPORTS) {
      const page = resolvePage(report, undefined);
      expect(page.scale, report).toBe(1);
      expect(page.landscape, report).toBe(LANDSCAPE_REPORTS.has(report));
    }
    expect(resolvePage("rojmel", undefined)).toMatchObject({
      paper: "legal-in",
      paperWidthMm: 345,
      paperHeightMm: 215,
      marginMm: 5,
    });
    expect(resolvePage("vouchers", undefined).paper).toBe("a4");
    expect(resolvePage("patrakD", undefined).paper).toBe("a4");
  });

  it("turns the paper, and lays a zoomed sheet out larger by as much", () => {
    const page = resolvePage("annexure9", { paper: "a4", orientation: "landscape", scalePct: 50, marginMm: 10 });
    expect(page.paperWidthMm).toBe(297);
    expect(page.paperHeightMm).toBe(210);
    expect(page.contentWidthMm).toBeCloseTo((297 - 20) / 0.5, 6);
    expect(page.contentHeightMm).toBeCloseTo((210 - 20) / 0.5, 6);
    expect(tableWidthMm("annexure9", { ...emptyLayout(), page: { orientation: "landscape" } })).toBeCloseTo(325, 6);
  });

  it("fits a form onto a smaller paper", () => {
    // The rojmel's 335mm across onto A4 landscape's 287: 85%.
    expect(fitScalePct("rojmel", { paper: "a4" })).toBe(85);
    // A larger paper is never zoomed up.
    expect(fitScalePct("chequeRegister", { paper: "a3" })).toBe(100);
  });

  it("keeps a page setup in the layout, and checks it", () => {
    const layout = { ...emptyLayout(), page: { paper: "a4" as const, scalePct: 90 } };
    expect(isEmptyLayout(layout)).toBe(false);
    expect(isEmptyLayout({ ...emptyLayout(), page: {} })).toBe(true);
    expect(reportLayoutSchema.safeParse(layout).success).toBe(true);
    expect(reportLayoutSchema.safeParse({ ...layout, page: { paper: "b5" } }).success).toBe(false);
    expect(reportLayoutSchema.safeParse({ ...layout, page: { scalePct: 5 } }).success).toBe(false);
  });

  it("gives Excel the same proportion a column was widened by", () => {
    const layout = setColumnWidth("khatavahi", emptyLayout(), "detail", 49.5);
    expect(widthScale("khatavahi", layout, ["detail"])).toBeCloseTo(1.5, 3);
    expect(widthScale("khatavahi", layout, [])).toBe(1);
  });
});

describe("headings on every report", () => {
  it("can all be given a width and a height, and a title is centred at its width", () => {
    for (const report of PRINTABLE_REPORTS) {
      for (const part of REPORT_PARTS[report]) expect(part.sizable, `${report} ${part.id}`).toBe(true);
    }
    const layout = withStyle(emptyLayout(), { kind: "part", part: "title" }, { widthMm: 150, heightMm: 14 });
    const css = layoutCss("chequeRegister", layout, "#r");
    expect(css).toContain('#r [data-part="title"] { flex: 0 0 auto; width: 150mm; margin-left: auto; margin-right: auto;');
    expect(css).toContain("min-height: 14mm");
  });

  it("splits the annexures' heading into its pieces, the school's name among them", () => {
    for (const report of ["annexure9", "annexure10"] as const) {
      expect(REPORT_PARTS[report].map((part) => part.id)).toEqual(
        expect.arrayContaining(["banner", "bannerProgramme", "bannerNumber", "bannerYear", "bannerSchool", "bannerDetails"]),
      );
    }
    // A row of the heading grows by its cells' height.
    const css = layoutCss("annexure10", withStyle(emptyLayout(), { kind: "part", part: "bannerSchool" }, { heightMm: 12 }), "#r");
    expect(css).toContain('#r td[data-part="bannerSchool"] { height: 12mm; }');
  });
});

describe("headings, blank colours, alignment and height", () => {
  it("round-trip a heading part's key", () => {
    expect(parseTargetKey(targetKey({ kind: "part", part: "band" }))).toEqual({ kind: "part", part: "band" });
  });

  it("names the rojmel's Cash Book band and title among its parts", () => {
    expect(REPORT_PARTS.rojmel.map((part) => part.id)).toEqual([
      "title",
      "band",
      "bandLeft",
      "bandRight",
      "bandPage",
      "closing",
    ]);
    // Every heading's width can be set now; the titles are centred blocks.
    expect(REPORT_PARTS.rojmel.filter((part) => part.block).map((part) => part.id)).toEqual(["title", "band", "closing"]);
    expect(REPORT_PARTS.rojmel.filter((part) => part.sizable).map((part) => part.id)).toEqual([
      "title",
      "band",
      "bandLeft",
      "bandRight",
      "bandPage",
      "closing",
    ]);
  });

  it("lets a piece's own colour win over its heading's, whichever was set first", () => {
    let layout = withStyle(emptyLayout(), { kind: "part", part: "bandLeft" }, { fill: "#fff59d" });
    layout = withStyle(layout, { kind: "part", part: "band" }, { fill: NO_FILL });
    const css = layoutCss("rojmel", layout, "#r");
    expect(css.indexOf('[data-part="band"]')).toBeLessThan(css.indexOf('[data-part="bandLeft"]'));
  });

  it("gives a piece of a heading row the width set for it", () => {
    const layout = withStyle(emptyLayout(), { kind: "part", part: "bandLeft" }, { widthMm: 150 });
    expect(layoutCss("rojmel", layout, "#r")).toContain('#r [data-part="bandLeft"] { flex: 0 0 auto; width: 150mm; }');
  });

  it("sizes, heightens and blanks a heading, down to the pieces inside it", () => {
    const layout = withStyle(emptyLayout(), { kind: "part", part: "band" }, { sizePt: 16, heightMm: 12, fill: NO_FILL });
    const css = layoutCss("rojmel", layout, "#r");
    expect(css).toContain('#r [data-part="band"], #r [data-part="band"] * { font-size: 16pt; }');
    expect(css).toContain('#r [data-part="band"], #r [data-part="band"] * { background: transparent; }');
    expect(css).toContain('#r [data-part="band"]:not(table):not(tr):not(td) { min-height: 12mm; }');
  });

  it("makes a cell blank rather than falling back to the form's colour", () => {
    const layout = withStyle(emptyLayout(), { kind: "row", row: "2025-04-01:spent" }, { fill: NO_FILL });
    expect(layoutCss("rojmel", layout, "#r")).toContain("background: transparent");
  });

  it("drops every colour of the form's own with `plain`", () => {
    expect(layoutCss("rojmel", { ...emptyLayout(), plain: true }, "#r")).toContain(
      "#r [data-part] * { background: transparent; }",
    );
  });

  it("aligns the whole report, and a row's own choice wins over it", () => {
    let layout: typeof EMPTY = { ...emptyLayout(), align: "right" };
    layout = withStyle(layout, { kind: "row", row: "total" }, { align: "left", heightMm: 10 });
    const css = layoutCss("patrakD", layout, "#r");
    const whole = css.indexOf("text-align: right");
    const row = css.indexOf("text-align: left");
    expect(whole).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(whole);
    expect(css).toContain('tr[data-row="total"] > td { height: 10mm; }');
  });

  it("accepts blank and alignment, and nothing else in their place", () => {
    const ok = (layout: unknown) => reportLayoutSchema.safeParse(layout).success;
    expect(ok({ version: 1, align: "center", plain: true, styles: { "part:title": { fill: "none", heightMm: 9 } } })).toBe(true);
    expect(ok({ version: 1, align: "justify" })).toBe(false);
    expect(ok({ version: 1, styles: { "col:amount": { fill: "transparent" } } })).toBe(false);
  });
});

const EMPTY = emptyLayout();
