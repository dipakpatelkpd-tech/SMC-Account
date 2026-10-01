/**
 * Build a YearBook from the database.
 *
 * This is the only place Prisma types meet the engine. Everything downstream
 * works on plain data, which is what lets the report tests run without a
 * database at all.
 */
import type { PrismaClient } from "@prisma/client";
import { paise } from "../lib/money.js";
import type { ChequeType } from "../lib/types.js";
import type { BookBill, BookCheque, YearBook } from "./types.js";

/** Load one financial year by id. Throws if it does not exist. */
export async function loadYearBook(prisma: PrismaClient, financialYearId: number): Promise<YearBook> {
  const year = await prisma.financialYear.findUnique({
    where: { id: financialYearId },
    include: {
      school: { include: { bankAccounts: { where: { isPrimary: true }, take: 1 } } },
      grantHeadYears: { include: { grantHead: true }, orderBy: { reportOrder: "asc" } },
      openingBalances: { include: { grantHead: true } },
      receipts: { include: { grantHead: true }, orderBy: [{ date: "asc" }, { id: "asc" }] },
      bills: { include: { grantHead: true, cheque: true }, orderBy: [{ voucherNo: "asc" }, { id: "asc" }] },
      cheques: {
        include: {
          bills: { include: { grantHead: true } },
          allocations: { include: { grantHead: true } },
        },
        orderBy: { chequeNo: "asc" },
      },
      bankCharges: { include: { grantHead: true }, orderBy: [{ date: "asc" }, { id: "asc" }] },
      reconciliation: true,
    },
  });

  if (!year) throw new Error(`no financial year with id ${financialYearId}`);

  const bankAccount = year.school.bankAccounts[0];
  if (!bankAccount) throw new Error(`school ${year.school.nameGu} has no primary bank account`);

  const toBill = (bill: {
    id: number;
    voucherNo: number;
    billNo: string | null;
    billDate: string;
    descriptionGu: string;
    vendorGu: string;
    amountPaise: number;
    deductionPaise: number;
    quantityGu: string | null;
    remarksGu: string | null;
    chequeId: number | null;
    grantHead: { code: string };
  }): BookBill => ({
    id: String(bill.id),
    voucherNo: bill.voucherNo,
    billNo: bill.billNo,
    billDate: bill.billDate,
    descriptionGu: bill.descriptionGu,
    vendorGu: bill.vendorGu,
    headCode: bill.grantHead.code,
    amountPaise: paise(bill.amountPaise),
    deductionPaise: paise(bill.deductionPaise),
    quantityGu: bill.quantityGu,
    remarksGu: bill.remarksGu,
    chequeNo: null, // filled in below, once the cheque numbers are known
  });

  const chequeNoById = new Map(year.cheques.map((cheque) => [cheque.id, cheque.chequeNo]));

  const cheques: BookCheque[] = year.cheques.map((cheque) => ({
    chequeNo: cheque.chequeNo,
    chequeDate: cheque.chequeDate,
    cashbookDate: cheque.cashbookDate,
    cashedDate: cheque.cashedDate,
    voucherNo: cheque.voucherNo,
    payeeGu: cheque.payeeGu,
    purposeGu: cheque.purposeGu,
    type: cheque.type as ChequeType,
    remarksGu: cheque.remarksGu,
    bills: cheque.bills
      .map(toBill)
      .map((bill) => ({ ...bill, chequeNo: cheque.chequeNo }))
      .sort(byBillOrder),
    typedAllocation: cheque.allocations.map((allocation) => ({
      headCode: allocation.grantHead.code,
      amountPaise: paise(allocation.amountPaise),
    })),
  }));

  return {
    school: {
      nameGu: year.school.nameGu,
      smcLabelGu: year.school.smcLabelGu,
      diseCode: year.school.diseCode,
      clusterGu: year.school.clusterGu,
      talukaGu: year.school.talukaGu,
      districtGu: year.school.districtGu,
      programmeGu: year.school.programmeGu,
      memberSecretaryGu: year.school.memberSecretaryGu,
      memberSecretaryShortGu: year.school.memberSecretaryShortGu,
      memberSecretaryMobile: year.school.memberSecretaryMobile,
      bankNameGu: bankAccount.bankNameGu,
      bankBranchGu: bankAccount.branchGu,
      bankAccountNo: bankAccount.accountNo,
    },

    year: {
      label: year.label,
      startDate: year.startDate,
      endDate: year.endDate,
      status: year.status,
    },

    heads: year.grantHeadYears
      .filter((headYear) => headYear.active)
      .map((headYear) => ({
        code: headYear.grantHead.code,
        nameGu: headYear.grantHead.nameGu,
        reportOrder: headYear.reportOrder,
      })),

    opening: new Map(
      year.openingBalances.map((balance) => [
        balance.grantHead.code,
        { bankPaise: paise(balance.bankPaise), cashPaise: paise(balance.cashPaise) },
      ]),
    ),

    receipts: year.receipts.map((receipt) => ({
      id: String(receipt.id),
      date: receipt.date,
      headCode: receipt.grantHead.code,
      amountPaise: paise(receipt.amountPaise),
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
    })),

    bills: year.bills
      .map(toBill)
      .map((bill, index) => ({
        ...bill,
        chequeNo: year.bills[index]?.chequeId ? (chequeNoById.get(year.bills[index]!.chequeId!) ?? null) : null,
      }))
      .sort(byBillOrder),

    cheques,

    bankCharges: year.bankCharges.map((charge) => ({
      id: String(charge.id),
      date: charge.date,
      headCode: charge.grantHead.code,
      amountPaise: paise(charge.amountPaise),
      descriptionGu: charge.descriptionGu,
      remarksGu: charge.remarksGu,
    })),

    reconciliation: year.reconciliation
      ? {
          chequesIssuedNotCashedPaise: paise(year.reconciliation.chequesIssuedNotCashedPaise),
          creditsInBankNotInCashbookPaise: paise(year.reconciliation.creditsInBankNotInCashbookPaise),
          depositsNotYetCreditedPaise: paise(year.reconciliation.depositsNotYetCreditedPaise),
          bankChargesNotInCashbookPaise: paise(year.reconciliation.bankChargesNotInCashbookPaise),
          passbookBalancePaise: paise(year.reconciliation.passbookBalancePaise),
        }
      : null,
  };
}

/** Convenience for the single-school case: load the only year with this label. */
export async function loadYearBookByLabel(prisma: PrismaClient, label: string): Promise<YearBook> {
  const year = await prisma.financialYear.findFirst({ where: { label }, select: { id: true } });
  if (!year) throw new Error(`no financial year labelled "${label}"`);
  return loadYearBook(prisma, year.id);
}

/**
 * Voucher order, then bill number ordered by the part after the slash as a
 * number - so 1/2 sorts before 1/10, which string order would get wrong.
 * A bill with no number sorts last within its voucher.
 */
export function byBillOrder(a: BookBill, b: BookBill): number {
  if (a.voucherNo !== b.voucherNo) return a.voucherNo - b.voucherNo;
  if (a.billNo === null) return b.billNo === null ? 0 : 1;
  if (b.billNo === null) return -1;
  return billSequence(a.billNo) - billSequence(b.billNo);
}

/** The numeric part after the slash in a bill number such as "1/21". */
function billSequence(billNo: string): number {
  const afterSlash = billNo.includes("/") ? billNo.slice(billNo.lastIndexOf("/") + 1) : billNo;
  const parsed = Number.parseInt(afterSlash, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
