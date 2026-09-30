/**
 * Seed the database from reference/sample_data_2025-26.json.
 *
 * Two things happen here, and the second matters as much as the first:
 *
 *  1. The sample year is loaded into the schema.
 *  2. Every derived figure the JSON carries - each bill's net_amount, each
 *     cheque's amount, and the allocation of every reimbursement and direct
 *     cheque - is recomputed from the facts and checked against what the file
 *     says. The schema stores none of those, so this is the one moment they can
 *     be compared. A mismatch aborts the seed rather than quietly seeding a book
 *     that will not balance.
 *
 * Run with: npm run db:seed   (or npm run db:reset to rebuild from empty)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../src/lib/db.js";
import { rupeesToPaise, formatAmount } from "../src/lib/money.js";
import { isAllocationComputed } from "../src/lib/types.js";
import { CHEQUE_TYPE_FROM_SAMPLE, sampleDataSchema, type SampleData } from "./sample-data.js";

const prisma = createPrismaClient();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(HERE, "../reference/sample_data_2025-26.json");

/** Collected integrity problems, all reported together instead of one at a time. */
const problems: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) problems.push(message);
}

async function loadSample(): Promise<SampleData> {
  const raw = await readFile(SAMPLE_PATH, "utf8");
  const parsed = sampleDataSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error("sample_data_2025-26.json does not match the expected shape:\n");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

/**
 * Verify the sample file's own derived numbers before trusting any of it.
 * These are exactly the facts the schema refuses to store.
 */
function verifySampleIntegrity(data: SampleData): void {
  const billsById = new Map(data.bills.map((bill) => [bill.id, bill]));

  for (const bill of data.bills) {
    check(
      bill.net_amount === bill.amount - bill.deduction,
      `bill ${bill.bill_no}: net_amount ${bill.net_amount} != amount ${bill.amount} - deduction ${bill.deduction}`,
    );
  }

  const claimedBills = new Map<string, number>();

  for (const cheque of data.cheques) {
    const allocationTotal = cheque.allocation.reduce((total, row) => total + row.amount, 0);
    check(
      allocationTotal === cheque.amount,
      `cheque ${cheque.cheque_no}: allocation total ${allocationTotal} != amount ${cheque.amount}`,
    );

    for (const billId of cheque.bill_ids) {
      check(billsById.has(billId), `cheque ${cheque.cheque_no}: links unknown bill ${billId}`);
      const previous = claimedBills.get(billId);
      check(
        previous === undefined,
        `bill ${billId} is linked to cheque ${previous} and cheque ${cheque.cheque_no}`,
      );
      claimedBills.set(billId, cheque.cheque_no);
    }

    const type = CHEQUE_TYPE_FROM_SAMPLE[cheque.type];

    if (isAllocationComputed(type)) {
      // The split must be exactly the linked bills' net amounts grouped by head.
      const fromBills = new Map<string, number>();
      for (const billId of cheque.bill_ids) {
        const bill = billsById.get(billId);
        if (!bill) continue;
        fromBills.set(bill.grant_head, (fromBills.get(bill.grant_head) ?? 0) + bill.net_amount);
      }
      const stated = new Map(cheque.allocation.map((row) => [row.grant_head, row.amount]));
      const heads = new Set([...fromBills.keys(), ...stated.keys()]);
      for (const head of heads) {
        check(
          (fromBills.get(head) ?? 0) === (stated.get(head) ?? 0),
          `cheque ${cheque.cheque_no} head ${head}: bills give ${fromBills.get(head) ?? 0}, file says ${stated.get(head) ?? 0}`,
        );
      }
    } else {
      check(
        cheque.bill_ids.length === 0,
        `cheque ${cheque.cheque_no} is a grant return but links ${cheque.bill_ids.length} bills`,
      );
    }
  }

  // The identity the whole product rests on, per head and in total.
  const opening = new Map(
    Object.entries(data.opening_balances.by_head).map(([code, balance]) => [
      code,
      balance.bank + balance.cash,
    ]),
  );
  const received = new Map<string, number>();
  for (const receipt of data.receipts) {
    received.set(receipt.grant_head, (received.get(receipt.grant_head) ?? 0) + receipt.amount);
  }
  const spent = new Map<string, number>();
  const returned = new Map<string, number>();
  for (const cheque of data.cheques) {
    const bucket = cheque.type === "grant_return" ? returned : spent;
    for (const row of cheque.allocation) {
      bucket.set(row.grant_head, (bucket.get(row.grant_head) ?? 0) + row.amount);
    }
  }

  for (const row of data.expected_results.annexure_10_rows) {
    const head = row.grant_head;
    const computedClosing =
      (opening.get(head) ?? 0) +
      (received.get(head) ?? 0) -
      (spent.get(head) ?? 0) -
      (returned.get(head) ?? 0);
    check(
      computedClosing === row.closing,
      `${head}: Opening+Received-Spent-Returned = ${computedClosing}, expected_results says ${row.closing}`,
    );
  }
}

async function wipe(): Promise<void> {
  // Child rows first: SQLite will not cascade through every path on its own.
  await prisma.chequeAllocation.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.cheque.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.openingBalance.deleteMany();
  await prisma.bankReconciliation.deleteMany();
  await prisma.grantHeadYear.deleteMany();
  await prisma.grantHead.deleteMany();
  await prisma.financialYear.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.school.deleteMany();
}

async function seed(data: SampleData): Promise<void> {
  const school = await prisma.school.create({
    data: {
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
    },
  });

  const bankAccount = await prisma.bankAccount.create({
    data: {
      schoolId: school.id,
      bankNameGu: data.school.bank_name,
      branchGu: data.school.bank_branch_gu,
      accountNo: data.school.bank_account_no,
      isPrimary: true,
    },
  });

  const year = await prisma.financialYear.create({
    data: {
      schoolId: school.id,
      label: data.financial_year.label,
      startDate: data.financial_year.start,
      endDate: data.financial_year.end,
      status: "OPEN",
    },
  });

  // Grant heads, and their order/active flag for this year.
  const headIdByCode = new Map<string, number>();
  for (const head of data.grant_heads) {
    const created = await prisma.grantHead.create({
      data: { schoolId: school.id, code: head.code, nameGu: head.name_gu },
    });
    headIdByCode.set(head.code, created.id);
    await prisma.grantHeadYear.create({
      data: {
        financialYearId: year.id,
        grantHeadId: created.id,
        reportOrder: head.report_order,
        active: true,
      },
    });
  }

  const headId = (code: string): number => {
    const id = headIdByCode.get(code);
    if (id === undefined) throw new Error(`unknown grant head "${code}" in sample data`);
    return id;
  };

  for (const [code, balance] of Object.entries(data.opening_balances.by_head)) {
    await prisma.openingBalance.create({
      data: {
        financialYearId: year.id,
        grantHeadId: headId(code),
        bankPaise: rupeesToPaise(balance.bank),
        cashPaise: rupeesToPaise(balance.cash),
      },
    });
  }

  for (const receipt of data.receipts) {
    await prisma.receipt.create({
      data: {
        financialYearId: year.id,
        grantHeadId: headId(receipt.grant_head),
        date: receipt.date,
        amountPaise: rupeesToPaise(receipt.amount),
        receivedFromGu: receipt.received_from,
        modeGu: receipt.mode_gu,
        ddChequeNo: receipt.dd_cheque_no ?? null,
        ddChequeDate: receipt.dd_cheque_date ?? null,
        allotmentOrderNo: receipt.allotment_order_no ?? null,
        allotmentOrderDate: receipt.allotment_order_date ?? null,
        bankAccountId: bankAccount.id,
        bankLabelGu: receipt.bank_gu,
        depositedDate: receipt.deposited_date ?? null,
        creditedDate: receipt.credited_date ?? null,
        remarksGu: receipt.remarks_gu ?? null,
      },
    });
  }

  // Cheques before bills, because a bill carries the link to its cheque.
  const chequeIdByBillId = new Map<string, number>();
  for (const cheque of data.cheques) {
    const type = CHEQUE_TYPE_FROM_SAMPLE[cheque.type];
    const created = await prisma.cheque.create({
      data: {
        financialYearId: year.id,
        chequeNo: cheque.cheque_no,
        chequeDate: cheque.cheque_date,
        cashbookDate: cheque.cashbook_date,
        cashedDate: cheque.cashed_date ?? null,
        voucherNo: cheque.voucher_no ?? null,
        payeeGu: cheque.payee_gu,
        purposeGu: cheque.purpose_gu,
        type,
        bankAccountId: bankAccount.id,
        remarksGu: cheque.remarks_gu ?? null,
      },
    });

    for (const billId of cheque.bill_ids) chequeIdByBillId.set(billId, created.id);

    // Only a grant return carries a stored allocation. For the other two types
    // the split is computed from the bills, so storing it would duplicate a fact.
    if (!isAllocationComputed(type)) {
      for (const row of cheque.allocation) {
        await prisma.chequeAllocation.create({
          data: {
            chequeId: created.id,
            grantHeadId: headId(row.grant_head),
            amountPaise: rupeesToPaise(row.amount),
          },
        });
      }
    }
  }

  for (const bill of data.bills) {
    await prisma.bill.create({
      data: {
        financialYearId: year.id,
        grantHeadId: headId(bill.grant_head),
        voucherNo: bill.voucher_no,
        billNo: bill.bill_no ?? null,
        billDate: bill.bill_date,
        descriptionGu: bill.description_gu,
        vendorGu: bill.vendor_gu,
        amountPaise: rupeesToPaise(bill.amount),
        deductionPaise: rupeesToPaise(bill.deduction),
        quantityGu: bill.quantity_gu ?? null,
        remarksGu: bill.remarks_gu ?? null,
        chequeId: chequeIdByBillId.get(bill.id) ?? null,
      },
    });
  }

  const reconciliation = data.year_end_bank_reconciliation;
  await prisma.bankReconciliation.create({
    data: {
      financialYearId: year.id,
      chequesIssuedNotCashedPaise: rupeesToPaise(reconciliation.cheques_issued_not_cashed),
      creditsInBankNotInCashbookPaise: rupeesToPaise(reconciliation.credits_in_bank_not_in_cashbook),
      depositsNotYetCreditedPaise: rupeesToPaise(reconciliation.deposits_not_yet_credited),
      bankChargesNotInCashbookPaise: rupeesToPaise(reconciliation.bank_charges_not_in_cashbook),
      passbookBalancePaise: rupeesToPaise(reconciliation.passbook_balance_on_31_03_2026),
    },
  });

  const totals = data.expected_results.annexure_10_totals;
  console.log(`Seeded ${data.school.name_gu} - ${data.financial_year.label}`);
  console.log(
    `  ${data.grant_heads.length} grant heads, ${data.receipts.length} receipts, ` +
      `${data.bills.length} bills, ${data.cheques.length} cheques`,
  );
  console.log(
    `  Opening ${formatAmount(rupeesToPaise(totals.opening))} + Received ${formatAmount(rupeesToPaise(totals.received))}` +
      ` - Spent ${formatAmount(rupeesToPaise(totals.spent))} - Returned ${formatAmount(rupeesToPaise(totals.returned))}` +
      ` = Closing ${formatAmount(rupeesToPaise(totals.closing))}`,
  );
}

async function main(): Promise<void> {
  const data = await loadSample();

  verifySampleIntegrity(data);
  if (problems.length > 0) {
    console.error(`Sample data failed ${problems.length} integrity check(s); nothing was seeded:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  await wipe();
  await seed(data);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
