/**
 * Build a YearBook straight from reference/sample_data_2025-26.json.
 *
 * The engine tests use this rather than the database: they stay pure and fast,
 * and a failure points at the calculation rather than at the seed. A separate
 * test (tests/engine/load.test.ts) asserts that the database path produces the
 * same book, so neither can drift from the other unnoticed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rupeesToPaise } from "../../src/lib/money.js";
import type { BookBill, BookCheque, YearBook } from "../../src/engine/types.js";
import { byBillOrder } from "../../src/engine/load.js";
import { CHEQUE_TYPE_FROM_SAMPLE, sampleDataSchema, type SampleData } from "../../prisma/sample-data.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(HERE, "../../reference/sample_data_2025-26.json");

/** The parsed sample file, including its expected_results oracle. */
export const sampleData: SampleData = sampleDataSchema.parse(
  JSON.parse(readFileSync(SAMPLE_PATH, "utf8")),
);

export function sampleBook(): YearBook {
  const data = sampleData;

  const chequeNoByBillId = new Map<string, number>();
  for (const cheque of data.cheques) {
    for (const billId of cheque.bill_ids) chequeNoByBillId.set(billId, cheque.cheque_no);
  }

  const toBill = (bill: SampleData["bills"][number]): BookBill => ({
    id: bill.id,
    voucherNo: bill.voucher_no,
    billNo: bill.bill_no,
    billDate: bill.bill_date,
    descriptionGu: bill.description_gu,
    vendorGu: bill.vendor_gu,
    headCode: bill.grant_head,
    amountPaise: rupeesToPaise(bill.amount),
    deductionPaise: rupeesToPaise(bill.deduction),
    quantityGu: bill.quantity_gu ?? null,
    remarksGu: bill.remarks_gu ?? null,
    chequeNo: chequeNoByBillId.get(bill.id) ?? null,
  });

  const billsById = new Map(data.bills.map((bill) => [bill.id, toBill(bill)]));

  const cheques: BookCheque[] = data.cheques.map((cheque) => ({
    chequeNo: cheque.cheque_no,
    chequeDate: cheque.cheque_date,
    cashbookDate: cheque.cashbook_date,
    cashedDate: cheque.cashed_date ?? null,
    voucherNo: cheque.voucher_no ?? null,
    payeeGu: cheque.payee_gu,
    purposeGu: cheque.purpose_gu,
    type: CHEQUE_TYPE_FROM_SAMPLE[cheque.type],
    remarksGu: cheque.remarks_gu ?? null,
    bills: cheque.bill_ids
      .map((billId) => billsById.get(billId))
      .filter((bill): bill is BookBill => bill !== undefined)
      .sort(byBillOrder),
    typedAllocation:
      cheque.type === "grant_return"
        ? cheque.allocation.map((row) => ({
            headCode: row.grant_head,
            amountPaise: rupeesToPaise(row.amount),
          }))
        : [],
  }));

  return {
    school: {
      nameGu: data.school.name_gu,
      smcLabelGu: data.school.smc_label,
      diseCode: data.school.dise_code,
      clusterGu: data.school.cluster_gu,
      talukaGu: data.school.taluka_gu,
      districtGu: data.school.district_gu,
      programmeGu: data.school.programme_gu,
      memberSecretaryGu: data.school.member_secretary_gu,
      memberSecretaryShortGu: data.school.member_secretary_short_gu,
      memberSecretaryMobile: data.school.member_secretary_mobile ?? null,
      bankNameGu: data.school.bank_name,
      bankBranchGu: data.school.bank_branch_gu,
      bankAccountNo: data.school.bank_account_no,
    },

    year: {
      label: data.financial_year.label,
      startDate: data.financial_year.start,
      endDate: data.financial_year.end,
      status: "OPEN",
    },

    heads: [...data.grant_heads]
      .sort((a, b) => a.report_order - b.report_order)
      .map((head) => ({
        code: head.code,
        nameGu: head.name_gu,
        reportOrder: head.report_order,
      })),

    opening: new Map(
      Object.entries(data.opening_balances.by_head).map(([code, balance]) => [
        code,
        { bankPaise: rupeesToPaise(balance.bank), cashPaise: rupeesToPaise(balance.cash) },
      ]),
    ),

    receipts: data.receipts.map((receipt) => ({
      id: receipt.id,
      date: receipt.date,
      headCode: receipt.grant_head,
      amountPaise: rupeesToPaise(receipt.amount),
      receivedFromGu: receipt.received_from,
      modeGu: receipt.mode_gu,
      bankLabelGu: receipt.bank_gu,
      ddChequeNo: receipt.dd_cheque_no ?? null,
      ddChequeDate: receipt.dd_cheque_date ?? null,
      allotmentOrderNo: receipt.allotment_order_no ?? null,
      allotmentOrderDate: receipt.allotment_order_date ?? null,
      depositedDate: receipt.deposited_date ?? null,
      creditedDate: receipt.credited_date ?? null,
      remarksGu: receipt.remarks_gu ?? null,
    })),

    bills: [...billsById.values()].sort(byBillOrder),

    cheques,

    reconciliation: {
      chequesIssuedNotCashedPaise: rupeesToPaise(
        data.year_end_bank_reconciliation.cheques_issued_not_cashed,
      ),
      creditsInBankNotInCashbookPaise: rupeesToPaise(
        data.year_end_bank_reconciliation.credits_in_bank_not_in_cashbook,
      ),
      depositsNotYetCreditedPaise: rupeesToPaise(
        data.year_end_bank_reconciliation.deposits_not_yet_credited,
      ),
      bankChargesNotInCashbookPaise: rupeesToPaise(
        data.year_end_bank_reconciliation.bank_charges_not_in_cashbook,
      ),
      passbookBalancePaise: rupeesToPaise(
        data.year_end_bank_reconciliation.passbook_balance_on_31_03_2026,
      ),
    },
  };
}

/** Shorthand for the oracle the tests assert against. */
export const expected = sampleData.expected_results;
