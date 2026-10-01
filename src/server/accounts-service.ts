/**
 * The AccountsApi implementation.
 *
 * Deliberately knows nothing about Electron. It takes a PrismaClient and answers
 * the contract, so the same class backs the desktop app today (called from the
 * main process over IPC) and a web server later (called from an HTTP handler).
 * That is the whole reason it lives in src/server/ rather than in electron/.
 *
 * Writes go through the engine's validation before they are committed: a write
 * that would leave the books in a state the reports cannot print is rejected and
 * the Gujarati message is handed back to the screen.
 */
import type { PrismaClient } from "@prisma/client";
import { formatAmount } from "../lib/money.js";
import {
  annexure9,
  annexure10,
  balancesByDate,
  chequeAllocation,
  chequeAmount,
  allLedgers,
  billRegister,
  buildRojmel,
  chequeRegister,
  grantRegister,
  pageResolver,
  patrakD,
  vouchers,
  loadYearBook,
  validate,
  yearEndBalance,
  type YearBook,
} from "../engine/index.js";
import type {
  Annexure9,
  Annexure10,
  DayBalance,
  Ledger,
} from "../engine/types.js";
import type { Rojmel } from "../engine/rojmel.js";
import type {
  BillRegisterRow,
  ChequeRegisterRow,
  PatrakDRow,
  Voucher,
} from "../engine/registers.js";
import type { Issue } from "../engine/validation.js";
import { isAllocationComputed, type ChequeType } from "../lib/types.js";
import { codeForNewHead } from "../lib/default-grant-heads.js";
import { financialYearEnd, financialYearStart } from "../lib/dates.js";
import { matchHeadNames, readLegacyWorkbook } from "./legacy-import.js";
import {
  emptyLayout,
  isEmptyLayout,
  reportLayoutSchema,
  type ReportLayout,
} from "../shared/report-layout.js";
import { PRINTABLE_REPORTS } from "../shared/api.js";
import { fingerprint, fold, mergeRows, validRows, type SuggestionRow } from "../shared/suggestions.js";
import type {
  ApiResult,
  BooksApi,
  BillDto,
  BillInput,
  ChequeDto,
  ChequeInput,
  DashboardDto,
  FinancialYearDto,
  GrantHeadDto,
  GrantHeadInput,
  GrantRegisterRowDto,
  OpeningBalanceDto,
  OpeningBalanceInput,
  ReceiptDto,
  BankChargeDto,
  BankChargeInput,
  PrintableReportId,
  ReceiptInput,
  ReconciliationDto,
  SchoolDto,
  SchoolInput,
  CloseYearInput,
  ExcelReportId,
  LegacyImportPreviewDto,
  LegacyImportResultDto,
  LegacyImportSelection,
  YearEndPreviewDto,
} from "../shared/api.js";

/** A validation failure expressed the way the contract returns it. */
function fail(code: string, messageGu: string, detail: string): ApiResult<never> {
  // messageEn mirrors detail: these are written as readable English sentences,
  // so the English interface has a message without a parallel catalogue.
  return { ok: false, issues: [{ severity: "error", code, messageGu, messageEn: detail, detail }] };
}

export class AccountsService implements BooksApi {
  constructor(
    private readonly prisma: PrismaClient,
    /** The year every call operates on. Single-school, single-year at a time. */
    private readonly financialYearId: number,
  ) {}

  /** The current year as the engine sees it. Rebuilt per call - always fresh. */
  private book(): Promise<YearBook> {
    return loadYearBook(this.prisma, this.financialYearId);
  }

  // ------------------------------------------------------------- masters

  async getDashboard(): Promise<DashboardDto> {
    const book = await this.book();
    const year = await this.financialYear();

    const unpaidBills = book.bills.filter((bill) => bill.chequeNo === null).length;

    return {
      school: bookSchoolToDto(book),
      year,
      annexure10: annexure10(book),
      yearEnd: yearEndBalance(book),
      counts: {
        receipts: book.receipts.length,
        bills: book.bills.length,
        cheques: book.cheques.length,
        unpaidBills,
      },
      issues: validate(book).issues,
    };
  }

  async getSchool(): Promise<SchoolDto> {
    return bookSchoolToDto(await this.book());
  }

  async listFinancialYears(): Promise<FinancialYearDto[]> {
    const years = await this.prisma.financialYear.findMany({ orderBy: { label: "asc" } });
    return years.map((year) => ({
      id: year.id,
      label: year.label,
      startDate: year.startDate,
      endDate: year.endDate,
      status: year.status,
    }));
  }

  async listGrantHeads(): Promise<GrantHeadDto[]> {
    const rows = await this.prisma.grantHeadYear.findMany({
      where: { financialYearId: this.financialYearId },
      include: { grantHead: true },
      orderBy: { reportOrder: "asc" },
    });
    return rows.map((row) => ({
      id: row.grantHeadId,
      code: row.grantHead.code,
      nameGu: row.grantHead.nameGu,
      reportOrder: row.reportOrder,
      active: row.active,
    }));
  }

  /**
   * Correct the school's own details, including the bank account.
   *
   * Every one of these prints on the forms, so a typo in the DISE code or the
   * head teacher's name is a wrong form, not a cosmetic problem - which is why
   * this exists rather than sending the school back through setup.
   *
   * The bank account is edited in place rather than replaced: the receipts and
   * cheques already recorded point at it, and a new row would leave the year's
   * entries attached to the old account.
   */
  async saveSchool(input: SchoolInput): Promise<ApiResult<SchoolDto>> {
    const required: [string, string, string][] = [
      [input.nameGu, "શાળાનું નામ ભરવું જરૂરી છે", "school name is required"],
      [input.smcLabelGu, "રિપોર્ટના મથાળાની લીટી ભરવી જરૂરી છે", "the report heading is required"],
      [input.diseCode, "ડાયસ કોડ ભરવો જરૂરી છે", "DISE code is required"],
      [input.clusterGu, "ક્લસ્ટર ભરવું જરૂરી છે", "cluster is required"],
      [input.talukaGu, "તાલુકો ભરવો જરૂરી છે", "taluka is required"],
      [input.districtGu, "જિલ્લો ભરવો જરૂરી છે", "district is required"],
      [input.programmeGu, "યોજનાની લીટી ભરવી જરૂરી છે", "the programme line is required"],
      [
        input.memberSecretaryGu,
        "મુખ્ય શિક્ષકનું નામ ભરવું જરૂરી છે",
        "head teacher name is required",
      ],
      [
        input.memberSecretaryShortGu,
        "ચેક પર છપાતું ટૂંકું નામ ભરવું જરૂરી છે",
        "the short name printed on cheques is required",
      ],
      [input.bankNameGu, "બેંકનું નામ ભરવું જરૂરી છે", "bank name is required"],
      [input.bankAccountNo, "બેંક ખાતા નંબર ભરવો જરૂરી છે", "bank account number is required"],
    ];
    for (const [value, messageGu, detail] of required) {
      if (!value || value.trim() === "") return fail("required_field", messageGu, detail);
    }

    const year = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
      include: { school: { include: { bankAccounts: { where: { isPrimary: true }, take: 1 } } } },
    });
    const account = year.school.bankAccounts[0];
    if (!account) return fail("no_bank_account", "બેંક ખાતું મળ્યું નહીં", "no primary bank account");

    await this.prisma.$transaction(async (tx) => {
      await tx.school.update({
        where: { id: year.schoolId },
        data: {
          nameGu: input.nameGu.trim(),
          smcLabelGu: input.smcLabelGu.trim(),
          diseCode: input.diseCode.trim(),
          clusterGu: input.clusterGu.trim(),
          talukaGu: input.talukaGu.trim(),
          districtGu: input.districtGu.trim(),
          programmeGu: input.programmeGu.trim(),
          memberSecretaryGu: input.memberSecretaryGu.trim(),
          memberSecretaryShortGu: input.memberSecretaryShortGu.trim(),
          memberSecretaryMobile: input.memberSecretaryMobile?.trim() || null,
        },
      });
      await tx.bankAccount.update({
        where: { id: account.id },
        data: {
          bankNameGu: input.bankNameGu.trim(),
          branchGu: input.bankBranchGu.trim(),
          accountNo: input.bankAccountNo.trim(),
        },
      });
    });

    return { ok: true, data: await this.getSchool() };
  }

  /**
   * Add a grant head the state has introduced mid-year.
   *
   * The head is created at the school level and activated for THIS year only:
   * an earlier year's Annexure 10 must keep printing the rows it printed at the
   * time (SPEC 11.3).
   */
  async createGrantHead(input: { nameGu: string }): Promise<ApiResult<GrantHeadDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const nameGu = input.nameGu.trim();
    if (nameGu === "") {
      return fail(
        "grant_head_without_name",
        "ગ્રાન્ટ હેડનું નામ ભરવું જરૂરી છે",
        "a grant head needs a name",
      );
    }

    const year = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
      include: { school: { include: { grantHeads: true } } },
    });

    if (year.school.grantHeads.some((head) => head.nameGu === nameGu)) {
      return fail(
        "duplicate_grant_head",
        `${nameGu} નામનું ગ્રાન્ટ હેડ પહેલેથી છે`,
        `a grant head named ${nameGu} already exists`,
      );
    }

    const heads = await this.listGrantHeads();
    const code = codeForNewHead(year.school.grantHeads.map((head) => head.code));
    const reportOrder = Math.max(0, ...heads.map((head) => head.reportOrder)) + 1;

    const created = await this.prisma.grantHead.create({
      data: {
        schoolId: year.schoolId,
        code,
        nameGu,
        years: { create: { financialYearId: this.financialYearId, reportOrder, active: true } },
      },
    });

    return {
      ok: true,
      data: { id: created.id, code: created.code, nameGu: created.nameGu, reportOrder, active: true },
    };
  }

  /**
   * Rename a head, move it in the print order, or take it out of this year.
   *
   * The name lives on the school-level head, so renaming one changes what every
   * year prints for it - correct, because it is the same grant with a corrected
   * spelling. The order and whether it appears at all belong to this year.
   */
  async updateGrantHead(id: number, input: GrantHeadInput): Promise<ApiResult<GrantHeadDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const nameGu = input.nameGu.trim();
    if (nameGu === "") {
      return fail(
        "grant_head_without_name",
        "ગ્રાન્ટ હેડનું નામ ભરવું જરૂરી છે",
        "a grant head needs a name",
      );
    }

    const link = await this.prisma.grantHeadYear.findUnique({
      where: { financialYearId_grantHeadId: { financialYearId: this.financialYearId, grantHeadId: id } },
    });
    if (!link) {
      return fail("unknown_grant_head", "ગ્રાન્ટ હેડ મળ્યું નહીં", `grant head ${id} is not in this year`);
    }

    // Deactivating a head that this year has entries against would drop those
    // rows off Annexure 10 while their money is still in the bank balance.
    if (!input.active) {
      const used = await this.headUsage(id);
      if (used !== null) {
        return fail(
          "grant_head_in_use",
          `આ ગ્રાન્ટ હેડ વપરાયેલ છે (${used}), તેથી બંધ કરી શકાય નહીં`,
          `grant head ${id} is used by ${used} this year`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.grantHead.update({ where: { id }, data: { nameGu } });
      await tx.grantHeadYear.update({
        where: { id: link.id },
        data: { reportOrder: input.reportOrder, active: input.active },
      });
    });

    const saved = (await this.listGrantHeads()).find((head) => head.id === id);
    return { ok: true, data: saved! };
  }

  /**
   * Remove a head that was added by mistake.
   *
   * Only ever a head with nothing behind it. A used head is refused with the
   * reason, and the screen offers deactivation instead - deleting it would take
   * receipts and bills with it.
   */
  async deleteGrantHead(id: number): Promise<ApiResult<null>> {
    const used = await this.headUsage(id);
    if (used !== null) {
      return fail(
        "grant_head_in_use",
        `આ ગ્રાન્ટ હેડ વપરાયેલ છે (${used}), તેથી કાઢી શકાય નહીં`,
        `grant head ${id} is used by ${used}`,
      );
    }

    const opening = await this.prisma.openingBalance.findFirst({ where: { grantHeadId: id } });
    if (opening && (opening.bankPaise !== 0 || opening.cashPaise !== 0)) {
      return fail(
        "grant_head_has_opening_balance",
        "આ ગ્રાન્ટ હેડમાં ઉઘડતી સિલક છે, તેથી કાઢી શકાય નહીં",
        `grant head ${id} has an opening balance`,
      );
    }

    // The zero opening-balance row and the year links go with it; a head with no
    // money and no entries leaves nothing else behind.
    await this.prisma.grantHead.delete({ where: { id } });
    return { ok: true, data: null };
  }

  /**
   * What is standing in the way of removing a head, in Gujarati, or null when
   * nothing is. Counts across every year, not just this one: the head is a
   * school-level master.
   */
  private async headUsage(grantHeadId: number): Promise<string | null> {
    const [receipts, bills, allocations] = await Promise.all([
      this.prisma.receipt.count({ where: { grantHeadId } }),
      this.prisma.bill.count({ where: { grantHeadId } }),
      this.prisma.chequeAllocation.count({ where: { grantHeadId } }),
    ]);
    const parts: string[] = [];
    if (receipts > 0) parts.push(`${receipts} આવક`);
    if (bills > 0) parts.push(`${bills} બિલ`);
    if (allocations > 0) parts.push(`${allocations} ચેક`);
    return parts.length === 0 ? null : parts.join(", ");
  }

  // ---------------------------------------------------- opening balances

  async listOpeningBalances(): Promise<OpeningBalanceDto[]> {
    const heads = await this.listGrantHeads();
    const balances = await this.prisma.openingBalance.findMany({
      where: { financialYearId: this.financialYearId },
    });
    const byHead = new Map(balances.map((balance) => [balance.grantHeadId, balance]));

    // Every head gets a row, even one that has never had an opening balance -
    // otherwise the screen would silently omit heads the user needs to fill in.
    return heads.map((head) => ({
      grantHeadId: head.id,
      headCode: head.code,
      headNameGu: head.nameGu,
      bankPaise: byHead.get(head.id)?.bankPaise ?? 0,
      cashPaise: byHead.get(head.id)?.cashPaise ?? 0,
    }));
  }

  async saveOpeningBalance(input: OpeningBalanceInput): Promise<ApiResult<OpeningBalanceDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    if (input.bankPaise < 0 || input.cashPaise < 0) {
      return fail(
        "negative_opening_balance",
        "ઉઘડતી સિલક ઋણ ન હોઈ શકે",
        "opening balance cannot be negative",
      );
    }

    await this.prisma.openingBalance.upsert({
      where: {
        financialYearId_grantHeadId: {
          financialYearId: this.financialYearId,
          grantHeadId: input.grantHeadId,
        },
      },
      create: {
        financialYearId: this.financialYearId,
        grantHeadId: input.grantHeadId,
        bankPaise: input.bankPaise,
        cashPaise: input.cashPaise,
      },
      update: { bankPaise: input.bankPaise, cashPaise: input.cashPaise },
    });

    const saved = (await this.listOpeningBalances()).find(
      (row) => row.grantHeadId === input.grantHeadId,
    );
    return { ok: true, data: saved! };
  }

  // --------------------------------------------------------- legacy import

  /**
   * Choosing the file needs a dialog, which belongs to the desktop shell.
   * Overridden in the main process; a web build would take an upload instead.
   */
  async pickLegacyFile(): Promise<ApiResult<string | null>> {
    return fail(
      "file_dialog_not_available",
      "આ જગ્યાએથી ફાઈલ પસંદ કરી શકાતી નથી",
      "choosing a file is not available in this environment",
    );
  }

  /**
   * Read an old workbook and say what importing it would mean.
   *
   * Nothing is written. The plan comes back with every guess the importer made,
   * the head names it could and could not match, and whether this year already
   * holds entries - see applyLegacyImport for why that last one matters.
   */
  async previewLegacyImport(filePath: string): Promise<ApiResult<LegacyImportPreviewDto>> {
    const year = await this.financialYear();
    const plan = await readLegacyWorkbook(filePath, year);
    const heads = await this.listGrantHeads();

    const [receipts, bills, cheques] = await Promise.all([
      this.prisma.receipt.count({ where: { financialYearId: this.financialYearId } }),
      this.prisma.bill.count({ where: { financialYearId: this.financialYearId } }),
      this.prisma.cheque.count({ where: { financialYearId: this.financialYearId } }),
    ]);

    return {
      ok: true,
      data: {
        plan,
        headMatches: matchHeadNames(plan.headNames, heads),
        yearHasData: receipts + bills + cheques > 0,
      },
    };
  }

  /**
   * Write the reviewed plan into this year.
   *
   * Refused unless the year is EMPTY. Importing into a year that already has
   * entries would silently duplicate receipts and cheques, and nothing in the
   * reports would look wrong - the totals would simply be twice what the school
   * received. Starting from an empty year also means an import can be undone by
   * deleting the year's entries and importing again.
   *
   * One transaction, so a failure halfway leaves the year as empty as it started.
   *
   * A row the file could not give a usable date or voucher number is skipped and
   * reported rather than invented: those few rows are quicker to type in than to
   * find later.
   */
  async applyLegacyImport(
    selection: LegacyImportSelection,
  ): Promise<ApiResult<LegacyImportResultDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;

    const [receiptCount, billCount, chequeCount] = await Promise.all([
      this.prisma.receipt.count({ where: { financialYearId: this.financialYearId } }),
      this.prisma.bill.count({ where: { financialYearId: this.financialYearId } }),
      this.prisma.cheque.count({ where: { financialYearId: this.financialYearId } }),
    ]);
    if (receiptCount + billCount + chequeCount > 0) {
      return fail(
        "year_not_empty",
        "આ વર્ષમાં પહેલેથી એન્ટ્રી છે. જૂની ફાઈલ ખાલી વર્ષમાં જ લાવી શકાય.",
        "a legacy workbook can only be imported into an empty year",
      );
    }

    const bankAccountId = await this.primaryBankAccountId();
    const plan = selection.plan;

    const skipped: LegacyImportResultDto["skipped"] = [];
    const wantedReceipts = new Map(selection.receipts.map((row) => [row.sourceRow, row]));
    const wantedBills = new Map(selection.bills.map((row) => [row.sourceRow, row]));
    const wantedCheques = new Map(selection.cheques.map((row) => [row.sourceRow, row]));

    const counts = await this.prisma.$transaction(async (tx) => {
      let receipts = 0;
      let bills = 0;
      let cheques = 0;

      for (const row of plan.receipts) {
        const choice = wantedReceipts.get(row.sourceRow);
        if (!choice) continue;
        if (row.date === null) {
          skipped.push({ kind: "receipt", sourceRow: row.sourceRow, reasonGu: "તારીખ નથી" });
          continue;
        }

        await tx.receipt.create({
          data: {
            financialYearId: this.financialYearId,
            bankAccountId,
            date: row.date,
            grantHeadId: choice.grantHeadId,
            amountPaise: row.amountPaise,
            receivedFromGu: row.receivedFromGu,
            // The old register has no mode column; the money was in the bank.
            modeGu: "બેન્ક",
            bankLabelGu: row.bankLabelGu,
            allotmentOrderNo: row.allotmentOrderNo,
            creditedDate: row.date,
            remarksGu: "જૂની ફાઈલમાંથી લાવેલ",
          },
        });
        receipts += 1;
      }

      // Bill ids by voucher number, so the cheques below can be linked to the
      // bills they paid - the old register links them by voucher, not by id.
      const billIdsByVoucher = new Map<number, number[]>();

      for (const row of plan.bills) {
        const choice = wantedBills.get(row.sourceRow);
        if (!choice) continue;
        if (row.billDate === null) {
          skipped.push({ kind: "bill", sourceRow: row.sourceRow, reasonGu: "તારીખ નથી" });
          continue;
        }
        if (row.voucherNo === null) {
          skipped.push({ kind: "bill", sourceRow: row.sourceRow, reasonGu: "વાઉચર નંબર નથી" });
          continue;
        }

        const created = await tx.bill.create({
          data: {
            financialYearId: this.financialYearId,
            voucherNo: row.voucherNo,
            billNo: row.billNo,
            billDate: row.billDate,
            descriptionGu: row.descriptionGu,
            vendorGu: row.vendorGu,
            grantHeadId: choice.grantHeadId,
            amountPaise: row.amountPaise,
            deductionPaise: row.deductionPaise,
            quantityGu: row.quantityGu,
            remarksGu: "જૂની ફાઈલમાંથી લાવેલ",
          },
        });
        bills += 1;

        const forVoucher = billIdsByVoucher.get(row.voucherNo) ?? [];
        forVoucher.push(created.id);
        billIdsByVoucher.set(row.voucherNo, forVoucher);
      }

      for (const row of plan.cheques) {
        const choice = wantedCheques.get(row.sourceRow);
        if (!choice) continue;
        if (row.chequeNo === null || row.chequeDate === null) {
          skipped.push({ kind: "cheque", sourceRow: row.sourceRow, reasonGu: "ચેક નંબર કે તારીખ નથી" });
          continue;
        }
        if (choice.type === "GRANT_RETURN" && choice.grantHeadId === null) {
          skipped.push({
            kind: "cheque",
            sourceRow: row.sourceRow,
            reasonGu: "પરત કરેલ ગ્રાન્ટનું હેડ પસંદ કરેલ નથી",
          });
          continue;
        }

        const created = await tx.cheque.create({
          data: {
            financialYearId: this.financialYearId,
            bankAccountId,
            chequeNo: row.chequeNo,
            chequeDate: row.chequeDate,
            // The old register keeps one date per cheque; the cash book used it.
            cashbookDate: row.chequeDate,
            cashedDate: row.cashedDate,
            voucherNo: row.voucherNo,
            payeeGu: row.payeeGu,
            purposeGu: row.purposeGu,
            type: choice.type,
            remarksGu: "જૂની ફાઈલમાંથી લાવેલ",
            // A grant return's split is typed, never computed, so the head the
            // reviewer chose takes the whole amount.
            allocations:
              choice.type === "GRANT_RETURN" && choice.grantHeadId !== null
                ? {
                    create: [
                      { grantHeadId: choice.grantHeadId, amountPaise: row.amountPaise },
                    ],
                  }
                : undefined,
          },
        });
        cheques += 1;

        // Reimbursement and direct cheques take their amount from their bills, so
        // the link is what makes them worth anything at all.
        if (choice.type !== "GRANT_RETURN" && row.voucherNo !== null) {
          const billIds = billIdsByVoucher.get(row.voucherNo) ?? [];
          if (billIds.length === 0) {
            skipped.push({
              kind: "cheque",
              sourceRow: row.sourceRow,
              reasonGu: `વાઉચર ${row.voucherNo} ના બિલ મળ્યા નહીં – ચેક બિલ વગર લાવ્યો`,
            });
          }
          await tx.bill.updateMany({
            where: { id: { in: billIds } },
            data: { chequeId: created.id },
          });
        }
      }

      return { receipts, bills, cheques };
    });

    return { ok: true, data: { ...counts, skipped } };
  }

  // ---------------------------------------------------------- year closing

  /**
   * What closing this year would produce, without writing anything.
   *
   * The closing balance per head comes from Annexure 10, which is the statement
   * the school submits - so the opening balances of the next year are, by
   * construction, the figures they already signed for - less the bank charges
   * laid on each head, which Annexure 10 does not show but which did leave the
   * bank. Without that, next year would open with more in the bank than there is.
   */
  async getYearEndPreview(): Promise<YearEndPreviewDto> {
    const book = await this.book();
    const year = await this.financialYear();
    const statement = annexure10(book);
    const heads = await this.listGrantHeads();
    const idByCode = new Map(heads.map((head) => [head.code, head.id]));
    const years = await this.listFinancialYears();
    const charged = new Map<string, number>();
    for (const charge of book.bankCharges) {
      charged.set(charge.headCode, (charged.get(charge.headCode) ?? 0) + charge.amountPaise);
    }
    const closingOf = (headCode: string, closingPaise: number): number =>
      closingPaise - (charged.get(headCode) ?? 0);

    return {
      year,
      suggestedNextLabel: nextYearLabel(year.label),
      existingLabels: years.map((each) => each.label),
      cashPaise: yearEndBalance(book).cashPaise,
      rows: statement.rows.map((row) => ({
        grantHeadId: idByCode.get(row.headCode) ?? 0,
        headCode: row.headCode,
        headNameGu: row.nameGu,
        closingPaise: closingOf(row.headCode, row.closingPaise),
      })),
      totalClosingPaise: statement.totals.closingPaise - [...charged.values()].reduce((a, b) => a + b, 0),
      blocking: validate(book).issues.filter((issue) => issue.severity === "error"),
    };
  }

  /**
   * Close this year and open the next one with these closing balances.
   *
   * Everything happens in one transaction: a next year with heads but no opening
   * balances, or a closed year with no successor, would be a state no screen can
   * show and no report can print.
   *
   * Three refusals, all of them about not carrying a broken year forward:
   *
   *  - **Validation errors.** Whatever does not add up this year would be
   *    inherited as an opening balance and never reconcile again.
   *  - **Cash in hand on 31 March.** Which head that cash belongs to is not
   *    knowable from the books - a reimbursement's bills cancel its cash the
   *    same day - so carrying it would mean inventing the split.
   *  - **A year that already exists.** Never overwrite a year of books.
   *
   * Only ACTIVE heads carry forward. A head the state stopped is deactivated on
   * the masters screen, and its year is over.
   */
  async closeYear(input: CloseYearInput): Promise<ApiResult<FinancialYearDto>> {
    const label = input.nextLabel.trim();
    if (!/^\d{4}-\d{2}$/.test(label)) {
      return fail(
        "bad_year_label",
        "નાણાકીય વર્ષ 2026-27 ના સ્વરૂપમાં લખો",
        `financial year label "${input.nextLabel}" must look like 2026-27`,
      );
    }

    const preview = await this.getYearEndPreview();

    if (preview.year.status !== "OPEN") {
      return fail(
        "year_already_closed",
        `વર્ષ ${preview.year.label} પહેલેથી બંધ થયેલ છે`,
        `financial year ${preview.year.label} is already closed`,
      );
    }

    if (preview.blocking.length > 0) {
      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: "year_has_errors",
            messageGu: "વર્ષ બંધ કરતાં પહેલાં નીચેની ભૂલો સુધારો.",
            messageEn: "Fix the errors below before closing the year.",
            detail: "the year has validation errors",
          },
          ...preview.blocking,
        ],
      };
    }

    if (preview.cashPaise !== 0) {
      return fail(
        "cash_in_hand_at_year_end",
        `૩૧ માર્ચે રોકડ સિલક ${formatAmount(preview.cashPaise)} છે. વર્ષ બંધ કરતાં પહેલાં તે બેન્કમાં જમા કરો અથવા તેનો ખર્ચ નોંધો.`,
        `cash in hand on ${preview.year.endDate} is ${formatAmount(preview.cashPaise)}; it cannot be split across heads`,
      );
    }

    const openings = input.openings ?? {};
    for (const [headId, paise] of Object.entries(openings)) {
      if (!Number.isInteger(paise) || paise < 0) {
        return fail(
          "negative_opening_balance",
          "ઉઘડતી સિલક ઋણ ન હોઈ શકે",
          `opening balance for grant head ${headId} must be a whole number of paise, not negative`,
        );
      }
    }

    if (preview.existingLabels.includes(label)) {
      return fail(
        "year_exists",
        `વર્ષ ${label} પહેલેથી છે`,
        `financial year ${label} already exists`,
      );
    }

    const heads = await this.listGrantHeads();
    const active = heads.filter((head) => head.active);
    const closingByHead = new Map(preview.rows.map((row) => [row.grantHeadId, row.closingPaise]));

    const current = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const next = await tx.financialYear.create({
        data: {
          schoolId: current.schoolId,
          label,
          startDate: financialYearStart(label),
          endDate: financialYearEnd(label),
          status: "OPEN",
        },
      });

      for (const head of active) {
        await tx.grantHeadYear.create({
          data: {
            financialYearId: next.id,
            grantHeadId: head.id,
            reportOrder: head.reportOrder,
            active: true,
          },
        });
        await tx.openingBalance.create({
          data: {
            financialYearId: next.id,
            grantHeadId: head.id,
            // This year's બંધ સિલક, unless the school changed it on the way.
            // Cash is zero: closing cash is refused above, so all of it is bank.
            bankPaise: openings[head.id] ?? closingByHead.get(head.id) ?? 0,
            cashPaise: 0,
          },
        });
      }

      await tx.bankReconciliation.create({ data: { financialYearId: next.id } });
      await tx.financialYear.update({
        where: { id: current.id },
        data: { status: "CLOSED" },
      });

      return next;
    });

    return {
      ok: true,
      data: {
        id: created.id,
        label: created.label,
        startDate: created.startDate,
        endDate: created.endDate,
        status: created.status,
      },
    };
  }

  /**
   * Which year the screens show.
   *
   * The service itself is built around one year id, so this only checks that the
   * year exists and hands it back - rebinding is the caller's job (the main
   * process rebuilds the service and reloads the window). Keeping the check here
   * means a web build gets the same refusal for free.
   */
  async openYear(id: number): Promise<ApiResult<FinancialYearDto>> {
    const year = await this.prisma.financialYear.findUnique({ where: { id } });
    if (!year) {
      return fail("unknown_year", "એ નાણાકીય વર્ષ મળ્યું નહીં", `financial year ${id} does not exist`);
    }
    return {
      ok: true,
      data: {
        id: year.id,
        label: year.label,
        startDate: year.startDate,
        endDate: year.endDate,
        status: year.status,
      },
    };
  }

  // -------------------------------------------------------------- receipts

  async listReceipts(): Promise<ReceiptDto[]> {
    const receipts = await this.prisma.receipt.findMany({
      where: { financialYearId: this.financialYearId },
      include: { grantHead: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    return receipts.map(receiptToDto);
  }

  async createReceipt(input: ReceiptInput): Promise<ApiResult<ReceiptDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = this.checkReceipt(input);
    if (invalid) return invalid;

    const bankAccountId = await this.primaryBankAccountId();
    const created = await this.prisma.receipt.create({
      data: {
        financialYearId: this.financialYearId,
        bankAccountId,
        date: input.date,
        grantHeadId: input.grantHeadId,
        amountPaise: input.amountPaise,
        receivedFromGu: input.receivedFromGu,
        modeGu: input.modeGu,
        bankLabelGu: input.bankLabelGu,
        ddChequeNo: input.ddChequeNo ?? null,
        ddChequeDate: input.ddChequeDate ?? null,
        allotmentOrderNo: input.allotmentOrderNo ?? null,
        allotmentOrderDate: input.allotmentOrderDate ?? null,
        depositedDate: input.depositedDate ?? null,
        creditedDate: input.creditedDate ?? null,
        remarksGu: input.remarksGu ?? null,
      },
      include: { grantHead: true },
    });
    return { ok: true, data: receiptToDto(created) };
  }

  async updateReceipt(id: number, input: ReceiptInput): Promise<ApiResult<ReceiptDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = this.checkReceipt(input);
    if (invalid) return invalid;

    const updated = await this.prisma.receipt.update({
      where: { id },
      data: {
        date: input.date,
        grantHeadId: input.grantHeadId,
        amountPaise: input.amountPaise,
        receivedFromGu: input.receivedFromGu,
        modeGu: input.modeGu,
        bankLabelGu: input.bankLabelGu,
        ddChequeNo: input.ddChequeNo ?? null,
        ddChequeDate: input.ddChequeDate ?? null,
        allotmentOrderNo: input.allotmentOrderNo ?? null,
        allotmentOrderDate: input.allotmentOrderDate ?? null,
        depositedDate: input.depositedDate ?? null,
        creditedDate: input.creditedDate ?? null,
        remarksGu: input.remarksGu ?? null,
      },
      include: { grantHead: true },
    });
    return { ok: true, data: receiptToDto(updated) };
  }

  async deleteReceipt(id: number): Promise<ApiResult<null>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    await this.prisma.receipt.delete({ where: { id } });
    return { ok: true, data: null };
  }

  private checkReceipt(input: ReceiptInput): ApiResult<never> | null {
    if (input.amountPaise <= 0) {
      return fail("receipt_amount_not_positive", "રકમ શૂન્યથી વધુ હોવી જોઈએ", "receipt amount must be positive");
    }
    return null;
  }

  // ---------------------------------------------------------- bank charges

  /**
   * Money the bank took out of the account itself. No cheque, no voucher: it is
   * shown in the rojmel and its head's ledger, and nowhere else.
   */
  async listBankCharges(): Promise<BankChargeDto[]> {
    const charges = await this.prisma.bankCharge.findMany({
      where: { financialYearId: this.financialYearId },
      include: { grantHead: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    return charges.map(bankChargeToDto);
  }

  async createBankCharge(input: BankChargeInput): Promise<ApiResult<BankChargeDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = this.checkBankCharge(input);
    if (invalid) return invalid;

    const created = await this.prisma.bankCharge.create({
      data: {
        financialYearId: this.financialYearId,
        date: input.date,
        grantHeadId: input.grantHeadId,
        amountPaise: input.amountPaise,
        descriptionGu: input.descriptionGu.trim(),
        remarksGu: input.remarksGu?.trim() || null,
      },
      include: { grantHead: true },
    });
    return { ok: true, data: bankChargeToDto(created) };
  }

  async updateBankCharge(id: number, input: BankChargeInput): Promise<ApiResult<BankChargeDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = this.checkBankCharge(input);
    if (invalid) return invalid;

    const updated = await this.prisma.bankCharge.update({
      where: { id },
      data: {
        date: input.date,
        grantHeadId: input.grantHeadId,
        amountPaise: input.amountPaise,
        descriptionGu: input.descriptionGu.trim(),
        remarksGu: input.remarksGu?.trim() || null,
      },
      include: { grantHead: true },
    });
    return { ok: true, data: bankChargeToDto(updated) };
  }

  async deleteBankCharge(id: number): Promise<ApiResult<null>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    await this.prisma.bankCharge.delete({ where: { id } });
    return { ok: true, data: null };
  }

  private checkBankCharge(input: BankChargeInput): ApiResult<never> | null {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      return fail("charge_amount_not_positive", "રકમ શૂન્યથી વધુ હોવી જોઈએ", "bank charge amount must be positive");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return fail("charge_date_invalid", "તારીખ માન્ય નથી", `bank charge date "${input.date}" is not a date`);
    }
    if (input.descriptionGu.trim() === "") {
      return fail("charge_description_missing", "વિગત લખવી જરૂરી છે", "bank charge description is required");
    }
    return null;
  }

  // ----------------------------------------------------------------- bills

  async listBills(): Promise<BillDto[]> {
    const bills = await this.prisma.bill.findMany({
      where: { financialYearId: this.financialYearId },
      include: { grantHead: true, cheque: true },
      orderBy: [{ voucherNo: "asc" }, { id: "asc" }],
    });
    return bills.map(billToDto);
  }

  async createBill(input: BillInput): Promise<ApiResult<BillDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = await this.checkBill(input, null);
    if (invalid) return invalid;

    const created = await this.prisma.bill.create({
      data: {
        financialYearId: this.financialYearId,
        voucherNo: input.voucherNo,
        billNo: input.billNo,
        billDate: input.billDate,
        descriptionGu: input.descriptionGu,
        vendorGu: input.vendorGu,
        grantHeadId: input.grantHeadId,
        amountPaise: input.amountPaise,
        deductionPaise: input.deductionPaise,
        quantityGu: input.quantityGu ?? null,
        remarksGu: input.remarksGu ?? null,
        chequeId: input.chequeId ?? null,
      },
      include: { grantHead: true, cheque: true },
    });
    return { ok: true, data: billToDto(created) };
  }

  async updateBill(id: number, input: BillInput): Promise<ApiResult<BillDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = await this.checkBill(input, id);
    if (invalid) return invalid;

    const updated = await this.prisma.bill.update({
      where: { id },
      data: {
        voucherNo: input.voucherNo,
        billNo: input.billNo,
        billDate: input.billDate,
        descriptionGu: input.descriptionGu,
        vendorGu: input.vendorGu,
        grantHeadId: input.grantHeadId,
        amountPaise: input.amountPaise,
        deductionPaise: input.deductionPaise,
        quantityGu: input.quantityGu ?? null,
        remarksGu: input.remarksGu ?? null,
        chequeId: input.chequeId ?? null,
      },
      include: { grantHead: true, cheque: true },
    });
    return { ok: true, data: billToDto(updated) };
  }

  async deleteBill(id: number): Promise<ApiResult<null>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    await this.prisma.bill.delete({ where: { id } });
    return { ok: true, data: null };
  }

  private async checkBill(input: BillInput, excludeId: number | null): Promise<ApiResult<never> | null> {
    if (input.amountPaise <= 0) {
      return fail("bill_amount_not_positive", "બિલની રકમ શૂન્યથી વધુ હોવી જોઈએ", "bill amount must be positive");
    }
    if (input.deductionPaise < 0) {
      return fail("negative_deduction", "કપાત ઋણ ન હોઈ શકે", "deduction cannot be negative");
    }
    // SPEC section 7: a blocking rule.
    if (input.deductionPaise > input.amountPaise) {
      return fail(
        "deduction_exceeds_amount",
        "કપાત બિલની રકમ કરતાં વધારે છે",
        `the deduction of ${formatAmount(input.deductionPaise)} exceeds the bill amount of ${formatAmount(input.amountPaise)}`,
      );
    }
    if (input.billNo !== null) {
      const clash = await this.prisma.bill.findFirst({
        where: {
          financialYearId: this.financialYearId,
          voucherNo: input.voucherNo,
          billNo: input.billNo,
          ...(excludeId === null ? {} : { id: { not: excludeId } }),
        },
        select: { id: true },
      });
      if (clash) {
        return fail(
          "duplicate_bill_no",
          `વાઉચર ${input.voucherNo} માં બિલ નંબર ${input.billNo} પહેલેથી છે`,
          `bill number ${input.billNo} already exists in voucher ${input.voucherNo}`,
        );
      }
    }
    return null;
  }

  // --------------------------------------------------------------- cheques

  async listCheques(): Promise<ChequeDto[]> {
    const book = await this.book();
    const cheques = await this.prisma.cheque.findMany({
      where: { financialYearId: this.financialYearId },
      include: {
        bills: { include: { grantHead: true } },
        allocations: { include: { grantHead: true } },
      },
      orderBy: { chequeNo: "asc" },
    });

    const headIdByCode = new Map<string, number>();
    for (const cheque of cheques) {
      for (const bill of cheque.bills) headIdByCode.set(bill.grantHead.code, bill.grantHeadId);
      for (const row of cheque.allocations) headIdByCode.set(row.grantHead.code, row.grantHeadId);
    }
    const nameByCode = new Map(book.heads.map((head) => [head.code, head.nameGu]));

    return cheques.map((cheque) => {
      // The allocation comes from the engine, so the screen shows exactly what
      // the reports will - one definition of the split, never two.
      const fromEngine = book.cheques.find((candidate) => candidate.chequeNo === cheque.chequeNo);
      const allocation = fromEngine ? chequeAllocation(fromEngine) : new Map<string, number>();

      const rows = [...allocation.entries()].map(([code, amountPaise]) => ({
        grantHeadId: headIdByCode.get(code) ?? 0,
        headCode: code,
        headNameGu: nameByCode.get(code) ?? code,
        amountPaise,
      }));

      return {
        id: cheque.id,
        chequeNo: cheque.chequeNo,
        chequeDate: cheque.chequeDate,
        cashbookDate: cheque.cashbookDate,
        cashedDate: cheque.cashedDate,
        voucherNo: cheque.voucherNo,
        payeeGu: cheque.payeeGu,
        purposeGu: cheque.purposeGu,
        type: cheque.type as ChequeType,
        remarksGu: cheque.remarksGu,
        allocation: rows,
        amountPaise: fromEngine ? chequeAmount(fromEngine) : 0,
        billCount: cheque.bills.length,
      };
    });
  }

  async createCheque(input: ChequeInput): Promise<ApiResult<ChequeDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = await this.checkCheque(input, null);
    if (invalid) return invalid;

    const bankAccountId = await this.primaryBankAccountId();

    const created = await this.prisma.cheque.create({
      data: {
        financialYearId: this.financialYearId,
        bankAccountId,
        chequeNo: input.chequeNo,
        chequeDate: input.chequeDate,
        cashbookDate: input.cashbookDate,
        cashedDate: input.cashedDate ?? null,
        voucherNo: input.voucherNo ?? null,
        payeeGu: input.payeeGu,
        purposeGu: input.purposeGu,
        type: input.type,
        remarksGu: input.remarksGu ?? null,
        // Typed rows exist only for a grant return; the other types compute it.
        allocations: isAllocationComputed(input.type)
          ? undefined
          : {
              create: (input.typedAllocation ?? []).map((row) => ({
                grantHeadId: row.grantHeadId,
                amountPaise: row.amountPaise,
              })),
            },
      },
    });

    await this.linkBills(created.id, input);
    return this.chequeById(created.id);
  }

  async updateCheque(id: number, input: ChequeInput): Promise<ApiResult<ChequeDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    const invalid = await this.checkCheque(input, id);
    if (invalid) return invalid;

    await this.prisma.cheque.update({
      where: { id },
      data: {
        chequeNo: input.chequeNo,
        chequeDate: input.chequeDate,
        cashbookDate: input.cashbookDate,
        cashedDate: input.cashedDate ?? null,
        voucherNo: input.voucherNo ?? null,
        payeeGu: input.payeeGu,
        purposeGu: input.purposeGu,
        type: input.type,
        remarksGu: input.remarksGu ?? null,
      },
    });

    await this.prisma.chequeAllocation.deleteMany({ where: { chequeId: id } });
    if (!isAllocationComputed(input.type)) {
      for (const row of input.typedAllocation ?? []) {
        await this.prisma.chequeAllocation.create({
          data: { chequeId: id, grantHeadId: row.grantHeadId, amountPaise: row.amountPaise },
        });
      }
    }

    await this.linkBills(id, input);
    return this.chequeById(id);
  }

  async deleteCheque(id: number): Promise<ApiResult<null>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    // Release the bills rather than deleting them: the bill is a real document
    // that still exists even when the cheque that paid it is corrected away.
    await this.prisma.bill.updateMany({ where: { chequeId: id }, data: { chequeId: null } });
    await this.prisma.cheque.delete({ where: { id } });
    return { ok: true, data: null };
  }

  /** Point exactly the requested bills at this cheque, releasing any others. */
  private async linkBills(chequeId: number, input: ChequeInput): Promise<void> {
    await this.prisma.bill.updateMany({ where: { chequeId }, data: { chequeId: null } });
    if (input.billIds.length > 0) {
      await this.prisma.bill.updateMany({
        where: { id: { in: input.billIds } },
        data: { chequeId },
      });
    }
  }

  private async checkCheque(input: ChequeInput, excludeId: number | null): Promise<ApiResult<never> | null> {
    const clash = await this.prisma.cheque.findFirst({
      where: {
        financialYearId: this.financialYearId,
        chequeNo: input.chequeNo,
        ...(excludeId === null ? {} : { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (clash) {
      return fail(
        "duplicate_cheque_no",
        `ચેક નંબર ${input.chequeNo} પહેલેથી છે`,
        `cheque number ${input.chequeNo} already exists`,
      );
    }

    if (isAllocationComputed(input.type)) {
      if (input.billIds.length === 0) {
        return fail(
          "cheque_without_bills",
          "આ પ્રકારના ચેક સાથે ઓછામાં ઓછું એક બિલ જોડવું જરૂરી છે",
          `a ${input.type} cheque must be linked to at least one bill, because its allocation is computed from them`,
        );
      }
      // A bill already paid by another cheque cannot be claimed by this one.
      const taken = await this.prisma.bill.findMany({
        where: {
          id: { in: input.billIds },
          chequeId: { not: null },
          ...(excludeId === null ? {} : { NOT: { chequeId: excludeId } }),
        },
        select: { billNo: true, voucherNo: true },
      });
      if (taken.length > 0) {
        const names = taken.map((bill) => bill.billNo ?? `વાઉચર ${bill.voucherNo}`).join(", ");
        return fail(
          "bill_already_paid",
          `આ બિલ બીજા ચેક સાથે જોડાયેલ છે: ${names}`,
          `bills already linked to another cheque: ${names}`,
        );
      }
    } else {
      if (input.billIds.length > 0) {
        return fail(
          "grant_return_with_bills",
          "બચત ગ્રાન્ટ પરત ચેક સાથે બિલ જોડી શકાય નહીં",
          "a grant-return cheque cannot have bills; its split is typed per head",
        );
      }
      const rows = input.typedAllocation ?? [];
      if (rows.length === 0) {
        return fail(
          "grant_return_without_allocation",
          "બચત ગ્રાન્ટ પરત માટે દરેક ગ્રાન્ટ હેડની રકમ ભરવી જરૂરી છે",
          "a grant-return cheque needs at least one typed head amount",
        );
      }
      if (rows.some((row) => row.amountPaise <= 0)) {
        return fail(
          "grant_return_amount_not_positive",
          "પરત રકમ શૂન્યથી વધુ હોવી જોઈએ",
          "each returned amount must be positive",
        );
      }
    }

    return null;
  }

  private async chequeById(id: number): Promise<ApiResult<ChequeDto>> {
    const found = (await this.listCheques()).find((cheque) => cheque.id === id);
    if (!found) {
      return fail("cheque_not_found", "ચેક મળ્યો નહીં", `cheque ${id} not found after write`);
    }
    return { ok: true, data: found };
  }

  // -------------------------------------------------------- reconciliation

  async getReconciliation(): Promise<ReconciliationDto | null> {
    const row = await this.prisma.bankReconciliation.findUnique({
      where: { financialYearId: this.financialYearId },
    });
    if (!row) return null;
    return {
      chequesIssuedNotCashedPaise: row.chequesIssuedNotCashedPaise,
      creditsInBankNotInCashbookPaise: row.creditsInBankNotInCashbookPaise,
      depositsNotYetCreditedPaise: row.depositsNotYetCreditedPaise,
      bankChargesNotInCashbookPaise: row.bankChargesNotInCashbookPaise,
      passbookBalancePaise: row.passbookBalancePaise,
    };
  }

  async saveReconciliation(input: ReconciliationDto): Promise<ApiResult<ReconciliationDto>> {
    const frozen = await this.refuseIfClosed();
    if (frozen) return frozen;
    await this.prisma.bankReconciliation.upsert({
      where: { financialYearId: this.financialYearId },
      create: { financialYearId: this.financialYearId, ...input },
      update: { ...input },
    });
    return { ok: true, data: input };
  }

  // -------------------------------------------------------------- printing

  /**
   * Rendering a PDF needs a browser, which this class does not have - it is
   * plain data access so that a web server could reuse it. The Electron main
   * process overrides this with a real implementation; a future web build would
   * answer it by streaming a server-rendered PDF instead.
   */
  async exportPdf(_report: PrintableReportId): Promise<ApiResult<string | null>> {
    return fail(
      "pdf_not_available",
      "આ જગ્યાએથી PDF બનાવી શકાતું નથી",
      "PDF export is not available in this environment",
    );
  }

  /** Printing needs a browser and a printer: the main process answers it. */
  async printReport(_report: PrintableReportId): Promise<ApiResult<boolean>> {
    return fail(
      "print_not_available",
      "આ જગ્યાએથી છાપી શકાતું નથી",
      "Printing is not available in this environment",
    );
  }

  /**
   * Building the workbook is pure Node and lives in src/server/excel.ts, but
   * SAVING it needs a file dialog, which this class has no business owning. The
   * main process overrides this; a web build would send the bytes as a download.
   */
  async exportExcel(_report: ExcelReportId): Promise<ApiResult<string | null>> {
    return fail(
      "excel_not_available",
      "આ જગ્યાએથી Excel ફાઈલ બનાવી શકાતી નથી",
      "Excel export is not available in this environment",
    );
  }

  // -------------------------------------------------------- report layouts

  /**
   * A layout belongs to the school, not the year: set up once, every year prints
   * the same. It is readable and changeable in a closed year too - it holds no
   * figure, and reprinting an old register in the school's layout is normal.
   *
   * A stored layout that no longer passes the schema (written by a newer
   * version, or damaged) is not an error: the report prints its default rather
   * than refusing to print.
   */
  async getReportLayout(report: PrintableReportId): Promise<ReportLayout> {
    if (!PRINTABLE_REPORTS.includes(report)) return emptyLayout();
    const schoolId = await this.schoolId();
    const row = await this.prisma.reportLayout.findUnique({
      where: { schoolId_report: { schoolId, report } },
    });
    if (!row) return emptyLayout();
    try {
      const parsed = reportLayoutSchema.safeParse(JSON.parse(row.layoutJson));
      return parsed.success ? parsed.data : emptyLayout();
    } catch {
      return emptyLayout();
    }
  }

  async saveReportLayout(
    report: PrintableReportId,
    layout: ReportLayout,
  ): Promise<ApiResult<ReportLayout>> {
    if (!PRINTABLE_REPORTS.includes(report)) {
      return fail("unknown_report", "આવો રિપોર્ટ નથી", `no printable report called ${report}`);
    }
    const parsed = reportLayoutSchema.safeParse(layout);
    if (!parsed.success) {
      return fail(
        "invalid_layout",
        "રિપોર્ટની ગોઠવણી સાચવી શકાઈ નહીં: કિંમતો માન્ય મર્યાદામાં નથી.",
        `the layout is not valid: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    const schoolId = await this.schoolId();
    const where = { schoolId_report: { schoolId, report } };

    // Back to the default: nothing to store.
    if (isEmptyLayout(parsed.data)) {
      await this.prisma.reportLayout.deleteMany({ where: { schoolId, report } });
      return { ok: true, data: parsed.data };
    }

    const layoutJson = JSON.stringify(parsed.data);
    await this.prisma.reportLayout.upsert({
      where,
      create: { schoolId, report, layoutJson },
      update: { layoutJson },
    });
    return { ok: true, data: parsed.data };
  }

  // ----------------------------------------------------------- suggestions

  /**
   * The saved suggestions merged with `incoming` (src/shared/suggestions.ts),
   * saved back and returned. Rows that are not valid are dropped rather than
   * refused: suggestions must never be the reason something fails. Nothing is
   * written when the merge changes nothing - the books are on a pen drive.
   *
   * What the books already hold is offered too: every vendor, bill
   * description, payee, purpose and receipt detail entered before - typed,
   * imported or from an earlier year - so a school's first bill form already
   * knows its shops.
   */
  async syncSuggestions(incoming: SuggestionRow[]): Promise<SuggestionRow[]> {
    const saved: SuggestionRow[] = (await this.prisma.suggestion.findMany()).map((row) => ({
      field: row.field,
      value: row.value,
      count: row.useCount,
      last: Date.parse(row.lastUsedAt) || 0,
      ...(row.removedAt ? { removed: Date.parse(row.removedAt) || 0 } : {}),
    }));
    const now = Date.now();
    const merged = mergeRows(mergeRows(saved, await this.suggestionsFromBooks(), now), validRows(incoming), now);
    if (fingerprint(merged) === fingerprint(saved)) return merged;

    await this.prisma.$transaction(async (tx) => {
      await tx.suggestion.deleteMany();
      await tx.suggestion.createMany({
        data: merged.map((row) => ({
          field: row.field,
          valueKey: fold(row.value),
          value: row.value,
          useCount: row.count,
          lastUsedAt: new Date(row.last).toISOString(),
          removedAt: row.removed === undefined ? null : new Date(row.removed).toISOString(),
        })),
      });
    });
    return merged;
  }

  /**
   * Suggestions read off the records themselves, keyed as the forms key their
   * fields (data-suggest): how many records carry each value, and when the
   * latest of them was saved.
   */
  private async suggestionsFromBooks(): Promise<SuggestionRow[]> {
    const rows = new Map<string, SuggestionRow>();
    const add = (field: string, value: string | null | undefined, at: Date): void => {
      const text = value?.trim();
      if (!text) return;
      const key = `${field}\u0000${fold(text)}`;
      const held = rows.get(key);
      const last = at.getTime();
      if (held) {
        held.count += 1;
        held.last = Math.max(held.last, last);
      } else {
        rows.set(key, { field, value: text, count: 1, last });
      }
    };

    const [bills, cheques, receipts, schools, banks, heads] = await Promise.all([
      this.prisma.bill.findMany({ select: { vendorGu: true, descriptionGu: true, updatedAt: true } }),
      this.prisma.cheque.findMany({ select: { payeeGu: true, purposeGu: true, updatedAt: true } }),
      this.prisma.receipt.findMany({
        select: { receivedFromGu: true, bankLabelGu: true, remarksGu: true, updatedAt: true },
      }),
      this.prisma.school.findMany(),
      this.prisma.bankAccount.findMany(),
      this.prisma.grantHead.findMany({ select: { nameGu: true, updatedAt: true } }),
    ]);
    for (const bill of bills) {
      add("vendor.name", bill.vendorGu, bill.updatedAt);
      add("bill.description", bill.descriptionGu, bill.updatedAt);
    }
    for (const cheque of cheques) {
      add("vendor.name", cheque.payeeGu, cheque.updatedAt);
      add("cheque.purpose", cheque.purposeGu, cheque.updatedAt);
    }
    for (const receipt of receipts) {
      add("receipt.from", receipt.receivedFromGu, receipt.updatedAt);
      add("bank.name", receipt.bankLabelGu, receipt.updatedAt);
      add("receipt.remarks", receipt.remarksGu, receipt.updatedAt);
    }
    for (const school of schools) {
      add("school.name", school.nameGu, school.updatedAt);
      add("school.smcLabel", school.smcLabelGu, school.updatedAt);
      add("school.cluster", school.clusterGu, school.updatedAt);
      add("school.taluka", school.talukaGu, school.updatedAt);
      add("school.district", school.districtGu, school.updatedAt);
      add("school.headTeacher", school.memberSecretaryGu, school.updatedAt);
      add("school.headTeacherShort", school.memberSecretaryShortGu, school.updatedAt);
    }
    for (const bank of banks) {
      add("bank.name", bank.bankNameGu, bank.updatedAt);
      add("bank.branch", bank.branchGu, bank.updatedAt);
    }
    for (const head of heads) add("grantHead.name", head.nameGu, head.updatedAt);
    return validRows([...rows.values()]);
  }

  // --------------------------------------------------------------- reports

  async getRojmel(): Promise<Rojmel> {
    return buildRojmel(await this.book());
  }

  async getChequeRegister(): Promise<ChequeRegisterRow[]> {
    return chequeRegister(await this.book());
  }

  async getBillRegister(): Promise<BillRegisterRow[]> {
    return billRegister(await this.book());
  }

  async getVouchers(): Promise<Voucher[]> {
    return vouchers(await this.book());
  }

  async getPatrakD(): Promise<PatrakDRow[]> {
    return patrakD(await this.book());
  }

  async getAnnexure10(): Promise<Annexure10> {
    return annexure10(await this.book());
  }

  async getAnnexure9(): Promise<Annexure9> {
    return annexure9(await this.book());
  }

  async getBalances(): Promise<DayBalance[]> {
    return balancesByDate(await this.book());
  }

  async getLedgers(): Promise<Ledger[]> {
    // The ledger prints the rojmel page each entry appears on, so the cash book
    // has to be paginated first - that is where those page numbers come from.
    const book = await this.book();
    return allLedgers(book, { pages: pageResolver(buildRojmel(book)) });
  }

  async getGrantRegister(): Promise<GrantRegisterRowDto[]> {
    const book = await this.book();
    const receipts = await this.listReceipts();
    const byKey = new Map(receipts.map((receipt) => [`${receipt.date}::${receipt.id}`, receipt]));

    return grantRegister(book).map((row) => {
      const dto =
        byKey.get(`${row.receipt.date}::${Number(row.receipt.id)}`) ??
        receipts.find((candidate) => candidate.id === Number(row.receipt.id))!;
      return { receipt: dto, spentPaise: row.spentPaise, savingPaise: row.savingPaise };
    });
  }

  async getValidation(): Promise<Issue[]> {
    return validate(await this.book()).issues;
  }

  // --------------------------------------------------------------- helpers

  private async financialYear(): Promise<FinancialYearDto> {
    const year = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
    });
    return {
      id: year.id,
      label: year.label,
      startDate: year.startDate,
      endDate: year.endDate,
      status: year.status,
    };
  }

  /**
   * Refuse a write when the year has been closed.
   *
   * A closed year has already been carried into the next one's opening balances,
   * so changing it now would leave the two years disagreeing with no sign of it.
   * Reading and printing stay open - reprinting a submitted register is normal.
   */
  private async refuseIfClosed(): Promise<ApiResult<never> | null> {
    const year = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
      select: { label: true, status: true },
    });
    if (year.status === "OPEN") return null;
    return fail(
      "year_closed",
      `વર્ષ ${year.label} બંધ થયેલ છે, તેમાં ફેરફાર થઈ શકતો નથી.`,
      `financial year ${year.label} is closed and cannot be changed`,
    );
  }

  private async schoolId(): Promise<number> {
    const year = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
      select: { schoolId: true },
    });
    return year.schoolId;
  }

  private async primaryBankAccountId(): Promise<number> {
    const year = await this.prisma.financialYear.findUniqueOrThrow({
      where: { id: this.financialYearId },
      include: { school: { include: { bankAccounts: { where: { isPrimary: true }, take: 1 } } } },
    });
    const account = year.school.bankAccounts[0];
    if (!account) throw new Error("the school has no primary bank account");
    return account.id;
  }
}

// ------------------------------------------------------------------ mapping

/** "2025-26" -> "2026-27". */
function nextYearLabel(label: string): string {
  const start = Number(label.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function bookSchoolToDto(book: YearBook): SchoolDto {
  return { ...book.school };
}

function bankChargeToDto(charge: {
  id: number;
  date: string;
  grantHeadId: number;
  amountPaise: number;
  descriptionGu: string;
  remarksGu: string | null;
  grantHead: { nameGu: string };
}): BankChargeDto {
  return {
    id: charge.id,
    date: charge.date,
    grantHeadId: charge.grantHeadId,
    headNameGu: charge.grantHead.nameGu,
    amountPaise: charge.amountPaise,
    descriptionGu: charge.descriptionGu,
    remarksGu: charge.remarksGu,
  };
}

function receiptToDto(receipt: {
  id: number;
  date: string;
  grantHeadId: number;
  amountPaise: number;
  receivedFromGu: string;
  modeGu: string;
  bankLabelGu: string;
  ddChequeNo: string | null;
  ddChequeDate: string | null;
  allotmentOrderNo: string | null;
  allotmentOrderDate: string | null;
  depositedDate: string | null;
  creditedDate: string | null;
  remarksGu: string | null;
  grantHead: { nameGu: string };
}): ReceiptDto {
  return {
    id: receipt.id,
    date: receipt.date,
    grantHeadId: receipt.grantHeadId,
    headNameGu: receipt.grantHead.nameGu,
    amountPaise: receipt.amountPaise,
    receivedFromGu: receipt.receivedFromGu,
    modeGu: receipt.modeGu,
    bankLabelGu: receipt.bankLabelGu,
    ddChequeNo: receipt.ddChequeNo,
    ddChequeDate: receipt.ddChequeDate,
    allotmentOrderNo: receipt.allotmentOrderNo,
    allotmentOrderDate: receipt.allotmentOrderDate,
    depositedDate: receipt.depositedDate,
    creditedDate: receipt.creditedDate,
    remarksGu: receipt.remarksGu,
  };
}

function billToDto(bill: {
  id: number;
  voucherNo: number;
  billNo: string | null;
  billDate: string;
  descriptionGu: string;
  vendorGu: string;
  grantHeadId: number;
  amountPaise: number;
  deductionPaise: number;
  quantityGu: string | null;
  remarksGu: string | null;
  chequeId: number | null;
  grantHead: { nameGu: string };
  cheque: { chequeNo: number } | null;
}): BillDto {
  return {
    id: bill.id,
    voucherNo: bill.voucherNo,
    billNo: bill.billNo,
    billDate: bill.billDate,
    descriptionGu: bill.descriptionGu,
    vendorGu: bill.vendorGu,
    grantHeadId: bill.grantHeadId,
    headNameGu: bill.grantHead.nameGu,
    amountPaise: bill.amountPaise,
    deductionPaise: bill.deductionPaise,
    netPaise: bill.amountPaise - bill.deductionPaise,
    quantityGu: bill.quantityGu,
    remarksGu: bill.remarksGu,
    chequeId: bill.chequeId,
    chequeNo: bill.cheque?.chequeNo ?? null,
  };
}
